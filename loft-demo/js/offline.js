// Downloads: books kept on this device, to read with no connection (the way Shelf keeps music).
//
// Everything lives in IndexedDB, which works over plain http (service workers don't):
//   books   { key: "user:book", user, bookId, fileId, kind: "pages"|"flow", layout: kind or "fixed"
//             (a picture book's real pages: fixedfit.js downloadFits), version, width,
//             book, manifest, bookmarks, done, total, size, savedAt, complete }
//   blobs   { key: "file:what", fileId, blob }   what: p<page>, c<chapter>, r<picture path>, cover
//   outbox  { user, method, path, body, at, tag } progress and bookmark changes made while the
//             server couldn't be reached, sent in order when it can
// Downloads belong to the account that made them; another account on this browser never sees them.
//
// No imports from the app's screens: they import this.
import { downloadFits, pageUrl } from "./fixedfit.js";   // pure, imports nothing

const DB_NAME = "loft-offline";
const WIDTHS = [600, 900, 1200, 1800];
const AT_ONCE = 3;

let db = null;
let user = null;
let offlineNow = false;
const active = new Map();   // bookId -> AbortController, while downloading
const urlCache = new Map(); // blob key -> object URL

// ---------- the store ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      d.createObjectStore("books", { keyPath: "key" });
      d.createObjectStore("blobs", { keyPath: "key" });
      d.createObjectStore("outbox", { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function store() {
  if (!db) db = await openDb();
  return db;
}

const asPromise = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

async function run(name, mode, fn) {
  const d = await store();
  return new Promise((resolve, reject) => {
    const t = d.transaction(name, mode);
    let out;
    Promise.resolve(fn(t.objectStore(name))).then((v) => { out = v; }, reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("This device’s storage is full"));
  });
}

const get = (name, key) => run(name, "readonly", (s) => asPromise(s.get(key)));
const put = (name, value) => run(name, "readwrite", (s) => asPromise(s.put(value)));
const fileRange = (fileId) => IDBKeyRange.bound(`${fileId}:`, `${fileId}:￿`);
const bookKey = (bookId) => `${user}:${bookId}`;
const emit = (bookId = null) => window.dispatchEvent(new CustomEvent("downloads-changed", { detail: { bookId } }));

// ---------- who, and whether the server can be reached ----------

export function setUser(id) { user = id; }
export const isOffline = () => offlineNow;

export function setOffline(value) {
  if (offlineNow === value) return;
  offlineNow = value;
  document.body.classList.toggle("is-offline", value);
  window.dispatchEvent(new CustomEvent("offline-changed", { detail: { offline: value } }));
}

// A fetch that failed without an answer means the server can't be reached (not that it said no).
export const unreachable = (err) => err instanceof TypeError || (err && err.name === "TypeError");

// ---------- what's downloaded ----------

export async function list() {
  if (user == null) return [];
  try {
    const all = await run("books", "readonly", (s) => asPromise(s.getAll()));
    return all.filter((r) => r.user === user).sort((a, b) => b.savedAt - a.savedAt);
  } catch { return []; }
}

// The books downloaded (complete) for this account, for marking their covers.
export async function keptIds() {
  return new Set((await list()).filter((r) => r.complete).map((r) => r.bookId));
}

export async function record(bookId) {
  if (user == null) return null;
  try { return (await get("books", bookKey(bookId))) || null; } catch { return null; }
}

// "none" | "downloading" | "paused" | "done", with how far along and how big.
export async function status(bookId) {
  const r = await record(bookId);
  if (!r) return { state: "none" };
  const state = r.complete ? "done" : active.has(bookId) ? "downloading" : "paused";
  return { state, done: r.done, total: r.total, size: r.size };
}

async function blobUrl(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const hit = await get("blobs", key);
  if (!hit) return null;
  const url = URL.createObjectURL(hit.blob);
  urlCache.set(key, url);
  return url;
}

// The stored page images of a downloaded comic or PDF, in reading order (null if not downloaded).
export async function pageUrls(bookId, fileId, version) {
  const r = await record(bookId);
  if (!r || !r.complete || r.fileId !== fileId || r.version !== version) return null;
  try {
    // One read for the whole book (a big comic has hundreds of pages), then a URL for each page.
    const rows = await run("blobs", "readonly", (st) => asPromise(st.getAll(fileRange(fileId))));
    const byKey = new Map(rows.map((row) => [row.key, row.blob]));
    const urls = [];
    for (let i = 0; i < r.manifest.count; i += 1) {
      const key = `${fileId}:p${i}`;
      if (!urlCache.has(key) && byKey.has(key)) urlCache.set(key, URL.createObjectURL(byKey.get(key)));
      urls.push(urlCache.get(key) || null);
    }
    return urls.every(Boolean) ? urls : null;
  } catch { return null; }
}

// A stored chapter, with its pictures pointing at the stored copies.
export async function chapterText(bookId, fileId, n) {
  const r = await record(bookId);
  if (!r || !r.complete || r.fileId !== fileId) return null;
  try {
    const hit = await get("blobs", `${fileId}:c${n}`);
    if (!hit) return null;
    let text = await hit.blob.text();
    const paths = [...new Set([...text.matchAll(resourcePattern(fileId))].map((m) => m[1]))];
    for (const path of paths) {
      const url = await blobUrl(`${fileId}:r${path}`);
      if (url) text = text.split(`/api/files/${fileId}/res/${path}`).join(url);
    }
    return text;
  } catch { return null; }
}

export async function coverUrl(bookId) {
  const r = await record(bookId);
  if (!r || !r.book.has_cover) return null;
  try { return await blobUrl(`${r.fileId}:cover`); } catch { return null; }
}

const resourcePattern = (fileId) => new RegExp(`/api/files/${fileId}/res/([^"'\\s)<>]+)`, "g");

// ---------- downloading ----------

// The file the reader would open: the one you've been reading, else pages before flowing text.
export function readerFile(book) {
  const wanted = book.progress && book.progress.file_id;
  return book.files.find((f) => f.id === wanted && f.readable)
    || book.files.find((f) => f.readable === "pages") || book.files.find((f) => f.readable) || null;
}

// One width for every page: as wide as a page shows in portrait on this screen, never blurrier.
function pageWidth() {
  const shortSide = Math.min(screen.width, screen.height) * (window.devicePixelRatio || 1);
  return WIDTHS.find((w) => w >= shortSide) || WIDTHS[WIDTHS.length - 1];
}

async function fetchOk(url, signal, as = "blob") {
  const r = await fetch(url, { credentials: "same-origin", signal });
  if (!r.ok) {
    const err = new Error(r.status === 415 ? "This book can’t be opened, so it can’t be downloaded" : `The server said ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return as === "json" ? r.json() : as === "text" ? r.text() : r.blob();
}

export async function download(book) {
  const file = readerFile(book);
  if (!file || user == null || active.has(book.id)) return;
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* best effort */ }
  const kind = file.readable === "flow" ? "flow" : "pages";
  const manifest = await fetchOk(kind === "flow" ? `/api/files/${file.id}/flow` : `/api/files/${file.id}/manifest`, undefined, "json");
  let bookmarks = [];
  try { bookmarks = await fetchOk(`/api/books/${book.id}/bookmarks`, undefined, "json"); } catch { /* none kept */ }
  await clearFile(file.id);
  await put("books", {
    key: bookKey(book.id), user, bookId: book.id, fileId: file.id, kind, layout: manifest.fixed ? "fixed" : kind, version: manifest.version,
    width: pageWidth(), book, manifest, bookmarks, done: 0, total: 0, size: 0, savedAt: Date.now(), complete: false,
  });
  emit(book.id);
  return fetchAll(book.id);
}

// Fetch whatever of a download is still missing. Safe to call again after a reload or a failure.
async function fetchAll(bookId) {
  if (active.has(bookId)) return;
  const controller = new AbortController();
  active.set(bookId, controller);
  emit(bookId);
  try {
    let r = await record(bookId);
    if (!r) return;
    const { fileId, kind, width, manifest } = r;
    const have = new Set(await run("blobs", "readonly", (s) => asPromise(s.getAllKeys(fileRange(fileId)))));
    const jobs = [];
    if (kind === "pages") {
      for (let i = 0; i < manifest.count; i += 1) {
        jobs.push({ key: `${fileId}:p${i}`, url: `/api/files/${fileId}/pages/${i}?w=${width}&v=${manifest.version}` });
      }
    } else {
      // Chapters first: their pictures are only known once a chapter is read.
      for (let n = 0; n < manifest.chapters.length; n += 1) {
        const key = `${fileId}:c${n}`;
        let text;
        if (have.has(key)) text = await (await get("blobs", key)).blob.text();
        else {
          text = await fetchOk(pageUrl(fileId, n, manifest), controller.signal, "text");
          await put("blobs", { key, fileId, blob: new Blob([text], { type: "text/html" }) });
          have.add(key);
        }
        for (const m of text.matchAll(resourcePattern(fileId))) {
          jobs.push({ key: `${fileId}:r${m[1]}`, url: `/api/files/${fileId}/res/${m[1]}` });
        }
      }
    }
    if (r.book.has_cover) jobs.push({ key: `${fileId}:cover`, url: `/api/books/${bookId}/cover?w=480&v=${r.book.cover_v || 0}` });
    const unique = [...new Map(jobs.map((j) => [j.key, j])).values()];
    const total = unique.length + (kind === "flow" ? manifest.chapters.length : 0);
    let done = total - unique.filter((j) => !have.has(j.key)).length;
    let size = await storedSize(fileId);
    await put("books", { ...r, total, done, size });
    emit(bookId);

    const queue = unique.filter((j) => !have.has(j.key));
    let lastSave = 0;
    const worker = async () => {
      while (queue.length) {
        if (controller.signal.aborted) return;
        const job = queue.shift();
        const blob = await fetchOk(job.url, controller.signal);
        await put("blobs", { key: job.key, fileId, blob });
        done += 1;
        size += blob.size;
        if (Date.now() - lastSave > 700 || !queue.length) {
          lastSave = Date.now();
          r = await record(bookId);
          if (!r) { controller.abort(); return; }  // removed while downloading
          await put("books", { ...r, done, size });
          emit(bookId);
        }
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    if (controller.signal.aborted) return;
    r = await record(bookId);
    if (r) await put("books", { ...r, done, size, complete: true, savedAt: Date.now() });
  } catch (err) {
    controller.abort();  // one stream failed: stop the others too (the rest is fetched next time)
    if (unreachable(err)) setOffline(true);
    if (!(err && err.name === "AbortError")) {
      window.dispatchEvent(new CustomEvent("download-failed", { detail: { bookId, message: err.message } }));
    }
  } finally {
    active.delete(bookId);
    emit(bookId);
  }
}

export function cancel(bookId) {
  const c = active.get(bookId);
  if (c) c.abort();
  return remove(bookId);
}

async function storedSize(fileId) {
  let size = 0;
  await run("blobs", "readonly", (s) => new Promise((resolve) => {
    const c = s.openCursor(fileRange(fileId));
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return resolve();
      size += cur.value.blob.size;
      cur.continue();
    };
  }));
  return size;
}

async function clearFile(fileId) {
  for (const [key, url] of urlCache) {
    if (key.startsWith(`${fileId}:`)) { URL.revokeObjectURL(url); urlCache.delete(key); }
  }
  await run("blobs", "readwrite", (s) => asPromise(s.delete(fileRange(fileId))));
}

export async function remove(bookId) {
  const c = active.get(bookId);
  if (c) c.abort();
  const r = await record(bookId);
  if (!r) return;
  await run("books", "readwrite", (s) => asPromise(s.delete(r.key)));
  // Another account on this browser may have the same file downloaded: keep it for them.
  const all = await run("books", "readonly", (s) => asPromise(s.getAll()));
  if (!all.some((x) => x.fileId === r.fileId)) await clearFile(r.fileId);
  emit(bookId);
}

export async function removeAll() {
  for (const r of await list()) await remove(r.bookId);
}

// Space the browser lets Loft use, and how much is used (all accounts), when it says.
export async function space() {
  try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch { return null; }
}

// A picture book's page settings changed (its outline's layout_v): keep the new page order with the
// download. The pages themselves are the same, so nothing is downloaded again.
export async function keepOutline(bookId, outline) {
  const r = await record(bookId);
  if (!r || !r.complete || r.version !== outline.version || !outline.fixed) return;
  if (r.manifest && r.manifest.fixed && r.manifest.fixed.layout_v === outline.fixed.layout_v) return;
  await put("books", { ...r, manifest: outline });
}

// Keep the stored copy's details and bookmarks in step while online.
export async function refreshBook(book, bookmarks) {
  const r = await record(book.id);
  if (!r) return;
  await put("books", { ...r, book, ...(bookmarks ? { bookmarks } : {}) });
}

// ---------- changes made offline ----------

// Send a change to the server; if it can't be reached, keep it to send later. Returns the
// server's answer, or null when it was kept for later.
export async function send(method, path, body, tag = null) {
  try {
    const r = await fetch("/api" + path, {
      method, credentials: "same-origin", keepalive: method === "PUT",
      headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
    });
    return r;
  } catch (err) {
    if (!unreachable(err) || user == null) throw err;
    setOffline(true);
    await put("outbox", { user, method, path, body, at: Date.now(), tag });
    return null;
  }
}

// A bookmark added offline and taken away again before it was ever sent.
export async function forget(tag) {
  await run("outbox", "readwrite", (s) => new Promise((resolve) => {
    const c = s.openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return resolve();
      if (cur.value.tag === tag) cur.delete();
      cur.continue();
    };
  }));
}

// Send what was kept while offline, oldest first. Stops at the first that still can't get through.
export async function flush() {
  if (user == null) return;
  let entries = [];
  try {
    entries = await run("outbox", "readonly", (s) => new Promise((resolve) => {
      const out = [];
      const c = s.openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return resolve(out);
        out.push({ id: cur.key, ...cur.value });
        cur.continue();
      };
    }));
  } catch { return; }
  for (const e of entries.filter((x) => x.user === user)) {
    try {
      await fetch("/api" + e.path, {
        method: e.method, credentials: "same-origin",
        headers: e.body ? { "Content-Type": "application/json" } : {}, body: e.body ? JSON.stringify(e.body) : undefined,
      });
    } catch { return; }  // still can't reach it: try again later
    // Answered (even "no such book" counts): it's been dealt with.
    await run("outbox", "readwrite", (s) => asPromise(s.delete(e.id)));
  }
}

// ---------- at start, online ----------

// Finish downloads a reload interrupted, and fetch again any whose book changed on the server
// (a new file, or its pages split or rearranged).
export async function resume() {
  for (const r of await list()) {
    if (!r.complete) { fetchAll(r.bookId); continue; }
    try {
      const url = r.kind === "flow" ? `/api/files/${r.fileId}/flow` : `/api/files/${r.fileId}/manifest`;
      const [manifest, book] = await Promise.all([fetchOk(url, undefined, "json"), fetchOk(`/api/books/${r.bookId}`, undefined, "json")]);
      // Changed on the server, or downloaded for another kind of reader (a picture book downloaded
      // before Loft read such books as pages): download it again.
      if (manifest.version !== r.version || readerFile(book)?.id !== r.fileId || !downloadFits(r, manifest)) await download(book);
      else { await keepOutline(r.bookId, manifest); await refreshBook(book); }
    } catch (err) {
      if (unreachable(err)) { setOffline(true); return; }
    }
  }
}
