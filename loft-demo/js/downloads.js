// Downloads, as people see them: the Download button on a book's page, the "On this device" shelf,
// the Downloads list in Your settings, and the pages shown when the server can't be reached.
import { authorLine, esc, icon, seriesLine } from "./api.js";
import { coverHTML } from "./cover.js";
import { gridItem } from "./grid.js";
import * as offline from "./offline.js";

export function size(bytes) {
  if (!bytes) return "0 MB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const percent = (s) => (s.total ? Math.floor((s.done / s.total) * 100) : 0);

// ---------- the book page's Download button ----------

// Fills `slot` with the button for `book` and keeps it current. Returns a function that stops.
export function wireDownload(slot, book) {
  let confirming = null;
  let failed = "";

  async function draw() {
    if (!slot.isConnected) return stop();
    const s = await offline.status(book.id);
    if (s.state === "none") {
      slot.innerHTML = `<button class="btn" type="button" data-dl>${icon("download")}Download</button>
        ${failed ? `<span class="download-note" role="alert">${esc(failed)}</span>` : ""}`;
    } else if (s.state === "downloading") {
      slot.innerHTML = `<button class="btn download-busy" type="button" data-cancel style="--done:${percent(s)}%"
        aria-label="Downloading, ${percent(s)}%. Cancel">${icon("download")}Downloading ${percent(s)}%<span class="file-size">Cancel</span></button>`;
    } else if (s.state === "paused") {
      slot.innerHTML = `<button class="btn" type="button" data-dl>${icon("download")}Finish download<span class="file-size">${percent(s)}%</span></button>
        ${failed ? `<span class="download-note" role="alert">${esc(failed)}</span>` : ""}`;
    } else if (confirming) {
      slot.innerHTML = `<button class="btn download-remove" type="button" data-remove>Remove download</button>`;
    } else {
      slot.innerHTML = `<button class="btn download-done" type="button" data-ask aria-label="Downloaded, ${size(s.size)}. Remove it">
        ${icon("downloaded")}Downloaded<span class="file-size">${size(s.size)}</span></button>`;
    }
  }

  const onClick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.dl !== undefined) {
      failed = "";
      b.disabled = true;
      offline.download(book).catch((err) => { failed = err.message; draw(); });
      setTimeout(draw, 50);
    } else if (b.dataset.cancel !== undefined) {
      await offline.cancel(book.id);
    } else if (b.dataset.ask !== undefined) {
      // One more tap to remove: a downloaded book shouldn't vanish from a stray tap.
      confirming = setTimeout(() => { confirming = null; draw(); }, 4000);
      draw();
    } else if (b.dataset.remove !== undefined) {
      clearTimeout(confirming);
      confirming = null;
      await offline.remove(book.id);
    }
  };
  const onChange = (e) => { if (!e.detail.bookId || e.detail.bookId === book.id) draw(); };
  const onFail = (e) => { if (e.detail.bookId === book.id) { failed = `Download stopped: ${e.detail.message}`; draw(); } };
  slot.addEventListener("click", onClick);
  window.addEventListener("downloads-changed", onChange);
  window.addEventListener("download-failed", onFail);
  function stop() {
    window.removeEventListener("downloads-changed", onChange);
    window.removeEventListener("download-failed", onFail);
  }
  draw();
  return stop;
}

// ---------- shelves ----------

// Books downloaded for this account, as the shelf code wants them (covers from this device).
export async function deviceBooks() {
  const out = [];
  for (const r of await offline.list()) {
    const cover = offline.isOffline() ? await offline.coverUrl(r.bookId) : null;
    out.push({ ...r.book, progress: null, cover_src: cover, downloading: !r.complete });
  }
  return out;
}

// ---------- Your settings ----------

export async function settingsSection() {
  const items = await offline.list();
  const total = items.reduce((n, r) => n + (r.size || 0), 0);
  const space = await offline.space();
  return `<section class="settings-section" data-downloads>
    <h2>Downloads</h2>
    <p class="muted">Books kept on this device, to read with no connection. Only you see yours.</p>
    ${items.length ? `<ul class="download-list">${items.map((r) => `<li>
        <a href="#/book/${r.bookId}">${esc(r.book.title)}</a>
        <span class="muted">${r.complete ? size(r.size) : `${percent(r)}% downloaded`}</span>
        <button class="btn btn-small" type="button" data-remove-dl="${r.bookId}">Remove</button></li>`).join("")}</ul>
      <p class="download-total">${items.length} ${items.length === 1 ? "book" : "books"}, ${size(total)}${space && space.quota
        ? `. This browser lets Loft use about ${size(space.quota)}.` : "."}</p>
      <button class="btn" type="button" data-remove-all>Remove all downloads</button>`
      : `<p class="muted">Nothing yet. A book’s page has a Download button.</p>`}
  </section>`;
}

export function wireSettingsSection(main) {
  const redraw = async () => {
    const box = main.querySelector("[data-downloads]");
    if (!box) return window.removeEventListener("downloads-changed", redraw);
    box.outerHTML = await settingsSection();
  };
  main.addEventListener("click", async (e) => {
    const one = e.target.closest("[data-remove-dl]");
    if (one) await offline.remove(Number(one.dataset.removeDl));
    const all = e.target.closest("[data-remove-all]");
    if (all) {
      if (all.dataset.sure) await offline.removeAll();
      else { all.dataset.sure = "1"; all.textContent = "Remove every download?"; all.classList.add("download-remove"); }
    }
  });
  window.addEventListener("downloads-changed", redraw);
}

// ---------- with no connection ----------

export async function renderOfflineHome(main) {
  const books = await deviceBooks();
  const ready = books.filter((b) => !b.downloading);
  main.innerHTML = `<section class="page offline-home">
    <header class="page-head"><h1>On this device</h1></header>
    ${ready.length ? `<ul class="grid">${ready.map(gridItem).join("")}</ul>`
      : `<div class="empty"><p>No books are downloaded on this device. When Loft can reach the server again, a book’s page has a Download button.</p></div>`}
  </section>`;
}

export async function renderOfflineBook(main, bookId) {
  const r = await offline.record(bookId);
  if (!r || !r.complete) {
    main.innerHTML = `<div class="empty"><p>This book isn’t downloaded, and Loft can’t reach the server just now.</p>
      <a class="btn" href="#/">Books on this device</a></div>`;
    return;
  }
  const b = { ...r.book, cover_src: await offline.coverUrl(bookId) };
  const paragraphs = (b.description || "").split(/\n{2,}/).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("");
  main.innerHTML = `<article class="book-page" style="--glow: ${esc(b.color || "#3a2a1e")}">
    <div class="book-page-cover">${coverHTML(b, 480, "book-thick")}</div>
    <div class="book-page-text">
      <h1 class="book-page-title">${esc(b.title)}</h1>
      ${b.authors.length ? `<p class="book-page-author">${esc(authorLine(b.authors))}</p>` : ""}
      ${b.series ? `<p class="book-page-series">${esc(seriesLine(b))}</p>` : ""}
      <div class="files">
        <a class="btn btn-primary" href="#/read/${b.id}">Read</a>
        <span class="btn download-done" aria-disabled="true">${icon("downloaded")}Downloaded<span class="file-size">${size(r.size)}</span></span>
      </div>
      ${paragraphs ? `<div class="description">${paragraphs}</div>` : ""}
    </div>
  </article>`;
}

export function needsServer(main) {
  main.innerHTML = `<div class="empty"><p>This needs the server, and Loft can’t reach it just now. Your downloaded books still open.</p>
    <a class="btn" href="#/">Books on this device</a></div>`;
}
