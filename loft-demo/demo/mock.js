// Loft demo: the real Loft web app, with this file standing in for its server.
//
// Everything the app asks /api/... for is answered here, in the browser, from a recording of a real
// Loft server (demo/db.json: a made-up library of 20 books, its readers and their messages). The rules
// are ports of the server's own (library.py, browse.py, statuses.py, reading.py, discussion.py,
// fuzzy.py), so the home rows, the stacks, statuses and spoiler blurring behave as they do on a real
// Loft. Changes (reading, statuses, shelves, messages...) last until the page is closed. Images and
// book files come from demo/ through sw.js; chapters and JSON through fetch, below.
(() => {
"use strict";
const realFetch = window.fetch.bind(window);
const BASE = new URL("demo/", document.baseURI).href;
let db = null;
const ready = realFetch(BASE + "db.json").then((r) => r.json()).then(load);

const now = () => Date.now() / 1000;
const DAY = 86400;
const clone = (o) => JSON.parse(JSON.stringify(o));
const fold = (s) => String(s || "").toLocaleLowerCase();
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byText = (a, b) => cmp(fold(a), fold(b));
const DEMO_NO = "This is a demo, so that can’t be done here. On your own Loft it would be.";

// ── Loading the recording, with its times moved up to now ───────────────────────────────────
const TIME_KEYS = new Set(["at", "set_at", "added_at", "updated_at", "last_at", "checked_at", "created_at"]);
function shiftTimes(o, by, ref) {
  if (Array.isArray(o)) { o.forEach((x) => shiftTimes(x, by, ref)); return; }
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    if (TIME_KEYS.has(k) && typeof v === "number" && Math.abs(v - ref) < 400 * DAY) o[k] = v + by;
    else if (v && typeof v === "object") shiftTimes(v, by, ref);
  }
}
let S;   // the live state
function load(data) {
  shiftTimes(data, now() - data.ref, data.ref);
  db = data;
  S = {
    signedIn: true,
    books: new Map(data.books.map((b) => [b.id, b])),
    files: data.files,
    progress: new Map(Object.entries(data.progress).map(([k, v]) => [Number(k), v])),
    marks: new Map(Object.entries(data.marks).map(([k, v]) => [Number(k), v])),
    shelves: data.shelves,
    bookmarks: [],
    messages: data.messages,
    notifications: data.notifications,
    rec: data.recorded,
    settings: data.recorded["/settings"],
    nextId: 1000,
  };
}

// ── Answers ───────────────────────────────────────────────────────────────────────────────────
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fail = (status, detail) => json({ detail }, status);
class HttpError extends Error { constructor(status, detail) { super(detail); this.status = status; } }
const need = (cond, status, detail) => { if (!cond) throw new HttpError(status, detail); };

const ME = () => ({ id: 1, username: "Etienne", admin: true });

function card(b) {
  return { id: b.id, title: b.title, authors: b.authors, series: b.series, series_index: b.series_index,
    has_cover: b.has_cover, color: b.color, cover_v: b.cover_v };
}
const book = (id) => { const b = S.books.get(Number(id)); need(b, 404, "No such book"); return b; };

// ── Statuses (statuses.py) ─────────────────────────────────────────────────────────────────────
const INCOMPLETE_AFTER = 15 * DAY, ABANDONED_AFTER = 30 * DAY;
const aged = (since, t) => (t - since >= ABANDONED_AFTER ? "abandoned" : t - since >= INCOMPLETE_AFTER ? "incomplete" : "reading");
const wantShelf = () => S.shelves.find((s) => s.kind === "want");
function events(bid) {
  const e = {};
  const p = S.progress.get(bid);
  if (p) Object.assign(e, { read_at: p.updated_at, finished: p.finished });
  const m = S.marks.get(bid);
  if (m) Object.assign(e, { mark: m.status, mark_at: m.set_at });
  const w = wantShelf().books.find((x) => x.book_id === bid);
  if (w) e.want_at = w.added_at;
  return Object.keys(e).length ? e : null;
}
function decide(e, t = now()) {
  const evs = [[e.mark ? e.mark_at : null, 2, "mark"], [e.want_at, 1, "want"], [e.read_at, 0, "read"]].filter((x) => x[0] != null);
  evs.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const kind = evs[0][2];
  let s;
  if (kind === "want") s = "want";
  else if (kind === "mark") s = e.mark === "reading" ? aged(e.mark_at, t) : e.mark === "incomplete" ? (t - e.mark_at >= ABANDONED_AFTER ? "abandoned" : "incomplete") : e.mark;
  else s = e.finished ? "finished" : aged(e.read_at, t);
  return [s, Math.max(...evs.map((x) => x[0]))];
}
const statusOf = (bid) => { const e = events(bid); return e ? decide(e)[0] : "unread"; };
function statusesFor() {
  const out = new Map();
  for (const bid of S.books.keys()) { const e = events(bid); if (e) out.set(bid, decide(e)); }
  return out;
}
const shelvesFor = (bid) => sortedShelves().filter((s) => s.books.some((x) => x.book_id === bid)).map((s) => s.id);
const answer = (bid) => ({ status: statusOf(bid), shelves: shelvesFor(bid) });
function setStatus(bid, status) {
  need(["want", "unread", "reading", "incomplete", "abandoned", "finished"].includes(status), 400, "A reading status is one of: Want to read, Not started, Reading, Incomplete, Abandoned, Finished");
  const want = wantShelf(), t = now();
  if (status === "want") {
    S.marks.delete(bid);
    want.books = want.books.filter((x) => x.book_id !== bid);
    want.books.unshift({ book_id: bid, added_at: t });
  } else {
    S.marks.set(bid, { status, set_at: t });
    want.books = want.books.filter((x) => x.book_id !== bid);
  }
  return answer(bid);
}

// ── Reading (reading.py) ───────────────────────────────────────────────────────────────────────
function saveProgress(bid, { file_id, page, pages, at, locator }) {
  const t = now();
  at = at == null ? t : Math.min(Number(at), t + 300);
  pages = Math.max(1, Math.trunc(pages));
  page = Math.min(Math.max(0, Math.trunc(page)), pages - 1);
  const old = S.progress.get(bid);
  if (!old || at >= old.updated_at) {
    S.progress.set(bid, { file_id, page, pages, position: Math.min(1, Math.max(0, page / Math.max(1, pages - 1))),
      finished: page >= pages - 1, updated_at: at, locator: locator || null });
  }
  const want = wantShelf();   // reading a book takes it off Want to read
  want.books = want.books.filter((x) => !(x.book_id === bid && x.added_at <= at));
  return S.progress.get(bid);
}
function inProgress() {
  const mine = statusesFor();
  return [...mine].filter(([, [s]]) => s === "reading").sort((a, b) => b[1][1] - a[1][1]).slice(0, 20)
    .map(([bid]) => { const p = S.progress.get(bid); return [card(S.books.get(bid)), p && !p.finished ? p : null]; });
}

// ── The home screen (library.home) ─────────────────────────────────────────────────────────────
const byAdded = (a, b) => b.added_at - a.added_at || b.id - a.id;
const seriesOrder = (a, b) => (a.series_index ?? 1e9) - (b.series_index ?? 1e9) || byText(a.sort_title, b.sort_title);
const titleOrder = (a, b) => byText(a.sort_title, b.sort_title) || a.id - b.id;
function sortedShelves() {
  return [...S.shelves].sort((a, b) => (a.kind === "own") - (b.kind === "own") || byText(a.name, b.name));
}
function home() {
  const all = [...S.books.values()];
  const reading = inProgress();
  const recent = [...all].sort(byAdded).slice(0, 15).map(card);
  const rows = { continue: [], shelves: [], recent: [{ title: "Recently added", kind: "recent", value: null, books: recent }], series: [], genres: [] };
  const groups = new Map();
  for (const b of all) if (b.series) (groups.get(b.series) || groups.set(b.series, []).get(b.series)).push(b);
  [...groups].filter(([, bs]) => bs.length >= 2)
    .sort((a, b) => Math.max(...b[1].map((x) => x.added_at)) - Math.max(...a[1].map((x) => x.added_at))).slice(0, 8)
    .forEach(([name, bs]) => rows.series.push({ title: name, kind: "series", value: name, books: [...bs].sort(seriesOrder).map(card) }));
  const tags = new Map();
  for (const b of all) for (const t of b.tags) tags.set(t, (tags.get(t) || 0) + 1);
  [...tags].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, 6)
    .forEach(([t]) => rows.genres.push({ title: t, kind: "tag", value: t,
      books: all.filter((b) => b.tags.includes(t)).sort(titleOrder).slice(0, 20).map(card) }));
  for (const s of sortedShelves()) {
    if (!s.books.length) continue;
    rows.shelves.push({ title: s.name, kind: "shelf", value: String(s.id),
      books: [...s.books].sort((a, b) => b.added_at - a.added_at).slice(0, 20).map((x) => card(S.books.get(x.book_id))) });
  }
  const mine = statusesFor();
  const having = (st) => [...mine].filter(([, [s]]) => s === st).sort((a, b) => b[1][1] - a[1][1]).slice(0, 20).map(([bid]) => card(S.books.get(bid)));
  const inc = having("incomplete"), fin = having("finished");
  if (inc.length) rows.shelves.push({ title: "Incomplete", kind: "status", value: "incomplete", books: inc });
  if (fin.length) rows.shelves.push({ title: "Finished", kind: "finished", value: "", books: fin });
  if (reading.length >= 2) rows.continue.push({ title: "Continue reading", kind: "continue", value: null,
    books: reading.map(([c, p]) => ({ ...c, progress: p })) });
  const ordered = S.settings.look.home_rows.filter((r) => r.visible).flatMap((r) => rows[r.kind]);
  if (reading.length) return { hero: reading[0][0], hero_kind: "continue", hero_progress: reading[0][1], rows: ordered };
  return { hero: recent[0], hero_kind: "new", hero_progress: null, rows: ordered };
}

// ── A book, and lists of books (library.get_book, list_books) ──────────────────────────────────
function bookDetail(id) {
  const b = book(id);
  const { formats, size, pages, sort_title, added_at, ...rest } = b;
  return { ...clone(rest), series_books: b.series ? [...S.books.values()].filter((x) => x.series === b.series && x.id !== b.id).sort(seriesOrder).map(card) : [],
    progress: S.progress.get(b.id) || null, shelves: shelvesFor(b.id), status: statusOf(b.id) };
}
function listBooks(q) {
  const kind = q.get("kind"), value = q.get("value"), sort = q.get("sort") || "title";
  const offset = Number(q.get("offset") || 0), limit = Number(q.get("limit") || 60);
  let books = [...S.books.values()];
  if (kind === "finished" || kind === "status") {
    const want = kind === "finished" ? "finished" : value;
    const mine = statusesFor();
    books = want === "unread" ? books.filter((b) => !mine.has(b.id) || mine.get(b.id)[0] === "unread") : books.filter((b) => mine.has(b.id) && mine.get(b.id)[0] === want);
  } else if (kind === "shelf") {
    const s = S.shelves.find((x) => String(x.id) === String(value));
    need(s, 404, "No such shelf");
    const on = new Set(s.books.map((x) => x.book_id));
    books = books.filter((b) => on.has(b.id));
  } else if (kind && value != null) {
    books = books.filter((b) => (kind === "series" ? b.series === value : kind === "tag" ? b.tags.includes(value) : kind === "author" ? b.authors.includes(value) : false));
  }
  const order = kind === "series" && sort === "title" ? seriesOrder : sort === "added" ? byAdded
    : sort === "author" ? (a, b) => byText(a.authors[0] || "", b.authors[0] || "") || titleOrder(a, b) : titleOrder;
  books.sort(order);
  return { total: books.length, books: books.slice(offset, offset + limit).map(card) };
}

// ── The stacks (browse.py) ─────────────────────────────────────────────────────────────────────
const UNKNOWN = "Unknown author", OTHER = "Other", NO_AUTHOR = "No author";
const surnameKey = (name) => { if (name === UNKNOWN) return ["￿", ""]; const p = (name || "").split(/\s+/).filter(Boolean); return [fold(p[p.length - 1] || ""), fold(name)]; };
const keyCmp = (a, b) => { for (let i = 0; i < a.length; i++) { const c = typeof a[i] === "number" ? a[i] - b[i] : cmp(a[i], b[i]); if (c) return c; } return 0; };
function sectionOf(tags, sections) {
  const have = new Set(tags.map(fold));
  for (const s of sections) if (s.tags.some((t) => have.has(fold(t)))) return s.name;
  return OTHER;
}
function stacks(q) {
  const by = q.get("by") || "series", status = q.get("status") || "", section = q.get("section") || "", author = q.get("author") || "", fmt = q.get("format") || "";
  need(["series", "section", "author"].includes(by), 400, "Shelve by one of: series, section, author");
  const sections = S.rec["/library"].sections;
  const mine = statusesFor();
  const books = [...S.books.values()].map((b) => {
    const p = S.progress.get(b.id);
    return { ...card(b), section: sectionOf(b.tags, sections), formats: b.formats, size: b.size, pages: b.pages,
      progress: p ? { page: p.page, pages: p.pages, position: p.position, finished: p.finished } : null,
      status: mine.has(b.id) ? mine.get(b.id)[0] : "unread", _title: fold(b.sort_title || b.title) };
  });
  const tests = { status: (b) => !status || b.status === status, section: (b) => !section || b.section === section,
    author: (b) => !author || b.authors.includes(author), format: (b) => !fmt || b.formats.includes(fmt) };
  const passing = (...skip) => books.filter((b) => Object.entries(tests).every(([n, t]) => skip.includes(n) || t(b)));
  const count = (items) => { const o = {}; for (const i of items) o[i] = (o[i] || 0) + 1; return o; };
  const STATUSES = ["want", "unread", "reading", "incomplete", "abandoned", "finished"];
  const names = [...sections.map((s) => s.name), OTHER];
  const facets = {
    status: Object.fromEntries(STATUSES.map((s) => [s, passing("status").filter((b) => b.status === s).length])),
    section: Object.fromEntries(names.map((s) => [s, passing("section").filter((b) => b.section === s).length])),
    author: Object.fromEntries(Object.entries(count(passing("author").flatMap((b) => b.authors))).sort((a, b) => keyCmp(surnameKey(a[0]), surnameKey(b[0])))),
    format: Object.fromEntries(Object.entries(count(passing("format").flatMap((b) => b.formats))).sort((a, b) => cmp(a[0], b[0]))),
  };
  const shown = passing();
  let cases = [];
  const group = (key) => { const g = new Map(); for (const b of shown) { const k = key(b); (g.get(k) || g.set(k, []).get(k)).push(b); } return g; };
  if (by === "section") {
    const g = group((b) => b.section);
    cases = names.filter((s) => g.has(s)).map((s) => ({ title: s, kind: "section", books: g.get(s) }));
  } else if (by === "author") {
    const letter = (b) => { if (!b.authors.length) return NO_AUTHOR; const f = surnameKey(b.authors[0])[0].slice(0, 1).toUpperCase(); return /\p{L}/u.test(f) ? f : "#"; };
    const g = group(letter);
    const lo = (l) => [l === NO_AUTHOR ? 1 : 0, l === "#" ? 1 : 0, l];
    cases = [...g.keys()].sort((a, b) => keyCmp(lo(a), lo(b))).map((l) => ({ title: l, kind: "letter", books: g.get(l) }));
  } else {
    const series = new Map(), loose = [];
    for (const b of shown) if (b.series) (series.get(b.series) || series.set(b.series, []).get(b.series)).push(b); else loose.push(b);
    cases = [...series.keys()].sort(byText).map((s) => ({ title: s, kind: "series", books: series.get(s) }));
    if (loose.length) cases.push({ title: "Not in a series", kind: "loose", books: loose });
  }
  const seriesFirst = (b) => [b.series_index ?? 1e9, b._title];
  const ord = (b) => [...surnameKey(b.authors[0] || ""), fold(b.series), b.series_index ?? 1e9, b._title];
  for (const c of cases) {
    const key = c.kind === "series" ? seriesFirst : ord;
    c.books = c.books.sort((a, b) => keyCmp(key(a), key(b))).map(({ _title, ...b }) => b);
    c.count = c.books.length;
  }
  return { by, total: shown.length, cases, facets };
}

// ── Search (fuzzy.py) ──────────────────────────────────────────────────────────────────────────
const WEIGHTS = { title: 3, series: 2, authors: 2, tags: 1, description: 0.5 };
const JOINED = new Set(["title", "series", "authors"]);
const LITTLE = new Set("the a an of and or in on at to by for with".split(" "));
const EXACT = 1, PREFIX = 0.9, PART = 0.75, TYPO = 0.7, PART_MIN = 3;
const STRENGTH = new Map([[EXACT, 1], [PREFIX, 0.9], [TYPO, 0.6], [PART, 0.5]]);
const reach = (w) => Math.min(1, w / 2);
const normalize = (t) => (t || "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().replace(/['’ʼ‘`]/g, "").replace(/[\W_]+/gu, " ").trim();
const words = (t) => normalize(t).split(" ").filter(Boolean);
const allowance = (t) => (t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0);
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, before[j - 2] + 1);
      cur[j] = v; best = Math.min(best, v);
    }
    if (best > limit) return limit + 1;
    before = prev; prev = cur;
  }
  return prev[b.length];
}
function search(query) {
  const postings = new Map(), alone = new Set();
  for (const b of S.books.values()) {
    const fields = [["title", [b.title]], ["series", [b.series]], ["authors", b.authors], ["tags", b.tags], ["description", [b.description]]];
    for (const [field, texts] of fields) for (const text of texts) {
      const ws = words(text); ws.forEach((w) => alone.add(w));
      const joined = ws.slice(1).map((y, i) => [ws[i], y]).filter(([x, y]) => !LITTLE.has(x) && !LITTLE.has(y)).map(([x, y]) => x + y);
      for (const t of ws.concat(JOINED.has(field) ? joined : [])) {
        const p = postings.get(t) || postings.set(t, new Map()).get(t);
        if ((p.get(b.id) || 0) < WEIGHTS[field]) p.set(b.id, WEIGHTS[field]);
      }
    }
  }
  let typed = [...new Set(words((query || "").slice(0, 300)))];
  typed = (typed.filter((w) => !LITTLE.has(w)).length ? typed.filter((w) => !LITTLE.has(w)) : typed).slice(0, 12);
  const total = new Map(), reached = new Map(), n = S.books.size;
  for (const t of typed) {
    const strong = new Map(), best = new Map();
    for (const [w, p] of postings) {
      let score = 0;
      if (w === t) score = EXACT;
      else if (w.startsWith(t)) score = PREFIX;
      else if (t.length >= PART_MIN && w.includes(t) && alone.has(w)) score = PART;
      else if (allowance(t) && alone.has(w) && [...t.slice(0, 2)].some((c) => w.slice(0, 2).includes(c)) && distance(t, w, allowance(t)) <= allowance(t)) score = TYPO;
      if (!score) continue;
      for (const [bid, weight] of p) {
        const s = STRENGTH.get(score) * reach(weight);
        if (s > (strong.get(bid) || 0)) strong.set(bid, s);
        if (score * weight > (best.get(bid) || 0)) best.set(bid, score * weight);
      }
    }
    const rarity = 1 + Math.log(1 + (n - strong.size + 0.5) / (strong.size + 0.5));
    for (const [bid, s] of strong) { reached.set(bid, (reached.get(bid) || 0) + s * rarity); total.set(bid, (total.get(bid) || 0) + best.get(bid)); }
  }
  const r6 = (x) => Math.round(x * 1e6) / 1e6;
  return [...reached.keys()].sort((a, b) => r6(reached.get(b)) - r6(reached.get(a)) || total.get(b) - total.get(a)
    || byText(S.books.get(a).sort_title, S.books.get(b).sort_title) || a - b).slice(0, 40).map((id) => card(S.books.get(id)));
}

// ── Talking about a book (discussion.py) ───────────────────────────────────────────────────────
function where(bid) {
  const p = S.progress.get(bid), st = statusOf(bid);
  if (!p && st !== "finished") return [0, "", false];
  if (!p || p.finished || st === "finished") return [1, "Finished", true];
  return [p.position, p.locator ? `${Math.round(p.position * 100)}%` : `Page ${p.page + 1}`, false];
}
function message(m, pos, finished) {
  const mine = m.user_id === 1;
  return { id: m.id, parent_id: m.parent_id, by: m.by, mine, body: m.removed ? "" : m.body, removed: m.removed, position: m.position,
    place: m.place, at: m.at, edited: !!m.edited, ahead: !mine && !finished && !m.removed && m.position > pos + 0.001 };
}
function thread(bid, after) {
  book(bid);
  const [position, place, finished] = where(bid);
  return { you: { position, place, finished },
    messages: S.messages.filter((m) => m.book_id === bid && m.id > after).map((m) => message(m, position, finished)) };
}
function cleanBody(text) {
  need(typeof text === "string", 400, "A message must be text");
  let body = text.replace(/\r\n/g, "\n").split("\n").map((l) => l.split(/\s+/).filter(Boolean).join(" ")).join("\n").trim();
  while (body.includes("\n\n\n")) body = body.replace("\n\n\n", "\n\n");
  need(body, 400, "Write something first");
  need(body.length <= 4000, 400, "A message can be at most 4000 characters");
  return body;
}

// ── The router ─────────────────────────────────────────────────────────────────────────────────
function route(method, path, q, body) {
  const m = (re) => path.match(re);
  let x;
  if (path === "/ping") return { app: "loft", version: S.rec["/status"].version };
  if (path === "/status") return S.rec["/status"];
  if (path === "/login" || path === "/setup") { S.signedIn = true; return { ...ME(), token: "demo" }; }
  if (path === "/logout") { S.signedIn = false; return { ok: true }; }
  if (!S.signedIn && path !== "/join") throw new HttpError(401, "Sign in first");
  if (path === "/me") return ME();
  if (path === "/settings") {
    if (method === "PATCH") for (const [section, values] of Object.entries(body || {})) Object.assign(S.settings[section] ||= {}, values);
    return S.settings;
  }
  if (path === "/home") return home();
  if (path === "/books" && method === "GET") return listBooks(q);
  if (path === "/search") return search(q.get("q"));
  if (path === "/stacks") return stacks(q);
  if ((x = m(/^\/books\/(\d+)$/))) {
    if (method === "PATCH") {
      const b = book(x[1]);
      for (const k of ["title", "authors", "series", "series_index", "description", "publisher", "published", "language", "tags"]) if (k in body) b[k] = body[k];
      if ("title" in body) b.sort_title = body.title.replace(/^(the|a|an)\s+/i, "");
    }
    return bookDetail(x[1]);
  }
  if ((x = m(/^\/books\/(\d+)\/status$/))) { const id = book(x[1]).id; return method === "PUT" ? setStatus(id, body.status) : answer(id); }
  if ((x = m(/^\/books\/(\d+)\/opened$/))) {
    const id = book(x[1]).id;
    if (["incomplete", "abandoned"].includes(statusOf(id))) S.marks.set(id, { status: "reading", set_at: now() });
    return answer(id);
  }
  if ((x = m(/^\/books\/(\d+)\/progress$/))) return saveProgress(book(x[1]).id, body);
  if ((x = m(/^\/books\/(\d+)\/bookmarks$/))) {
    const id = book(x[1]).id;
    if (method === "POST") {
      const mark = { id: ++S.nextId, book_id: id, file_id: body.file_id, page: Math.max(0, Math.trunc(body.page)), note: (body.note || "").slice(0, 500), created_at: now(), locator: body.locator || null };
      S.bookmarks.push(mark);
      const { book_id, ...out } = mark; return out;
    }
    return S.bookmarks.filter((b) => b.book_id === id).sort((a, b) => a.page - b.page || a.id - b.id).map(({ book_id, ...b }) => b);
  }
  if ((x = m(/^\/bookmarks\/(\d+)$/))) { S.bookmarks = S.bookmarks.filter((b) => b.id !== Number(x[1])); return { ok: true }; }
  if ((x = m(/^\/books\/(\d+)\/discussion$/))) {
    const id = book(x[1]).id;
    if (method === "POST") {
      let parent = body.parent_id ?? null;
      if (parent != null) { const a = S.messages.find((mm) => mm.id === parent && mm.book_id === id); need(a, 404, "No such message"); parent = a.parent_id || a.id; }
      const [position, place] = where(id);
      const msg = { id: ++S.nextId, book_id: id, user_id: 1, by: "Etienne", parent_id: parent, body: cleanBody(body.body), position, place, at: now(), edited: false, removed: false };
      S.messages.push(msg);
      const [p, , f] = where(id);
      return message(msg, p, f);
    }
    return thread(id, Number(q.get("after") || 0));
  }
  if ((x = m(/^\/messages\/(\d+)$/))) {
    const msg = S.messages.find((mm) => mm.id === Number(x[1]));
    need(msg, 404, "No such message");
    if (method === "PATCH") { need(msg.user_id === 1, 404, "No such message"); msg.body = cleanBody(body.body); msg.edited = true; const [p, , f] = where(msg.book_id); return message(msg, p, f); }
    if (S.messages.some((mm) => mm.parent_id === msg.id)) { msg.removed = true; msg.body = ""; }
    else S.messages = S.messages.filter((mm) => mm.id !== msg.id);
    return { ok: true };
  }
  if (path === "/notifications") return { unread: S.notifications.filter((n) => !n.read).length, items: S.notifications };
  if (path === "/notifications/read") { S.notifications.forEach((n) => { n.read = true; }); return { ok: true }; }
  if (path === "/shelves") {
    if (method === "POST") {
      const name = String(body.name || "").trim().replace(/\s+/g, " ");
      need(name && name.length <= 60, 400, "A shelf needs a name");
      need(!S.shelves.some((s) => fold(s.name) === fold(name)), 400, `You already have a shelf called ${name}`);
      const s = { id: ++S.nextId, name, kind: "own", books: [] }; S.shelves.push(s);
      return { id: s.id, name, kind: "own", count: 0 };
    }
    return sortedShelves().map((s) => ({ id: s.id, name: s.name, kind: s.kind, count: s.books.length }));
  }
  if ((x = m(/^\/shelves\/(\d+)$/))) {
    const s = S.shelves.find((y) => y.id === Number(x[1]));
    need(s && s.kind === "own", 404, "No such shelf");
    if (method === "DELETE") { S.shelves = S.shelves.filter((y) => y !== s); return { ok: true }; }
    s.name = String(body.name || s.name).trim(); return { id: s.id, name: s.name, kind: s.kind, count: s.books.length };
  }
  if ((x = m(/^\/shelves\/(\d+)\/books\/(\d+)$/))) {
    const s = S.shelves.find((y) => y.id === Number(x[1])), id = book(x[2]).id;
    need(s, 404, "No such shelf");
    if (method === "PUT") { if (!s.books.some((y) => y.book_id === id)) s.books.unshift({ book_id: id, added_at: now() }); }
    else s.books = s.books.filter((y) => y.book_id !== id);
    return { ok: true };
  }
  if ((x = m(/^\/files\/(\d+)\/(flow|manifest)$/)) && method === "GET") {
    const f = S.files[x[1]]; need(f, 404, "No such file");
    return x[2] === "flow" ? f.flow : f.manifest;
  }
  // ── Admin and requests: as recorded, with the simple changes kept ──
  const rec = S.rec;
  if (path === "/requests" && method === "POST") {
    const title = String(body.title || "").trim(); need(title, 400, "Say which book you’d like");
    const r = { id: ++S.nextId, title, author: String(body.author || "").trim(), note: String(body.note || "").trim(), by: "Etienne", mine: true, votes: 1, voted: true, status: "open", reason: "", book_id: null, at: now() };
    rec["/requests"].unshift(r); return { id: r.id };
  }
  if ((x = m(/^\/requests\/(\d+)(?:\/(vote|fulfil|decline))?$/)) && method !== "GET") {
    const r = rec["/requests"].find((y) => y.id === Number(x[1])); need(r, 404, "No such request");
    if (x[2] === "vote") { if (!!body.on !== r.voted) { r.voted = !!body.on; r.votes += r.voted ? 1 : -1; } return { ok: true }; }
    rec["/requests"] = rec["/requests"].filter((y) => y !== r);
    if (x[2]) rec["/requests?closed=true"].unshift({ ...r, status: x[2] === "fulfil" ? "done" : "declined", reason: body.reason || "", book_id: body.book_id || null });
    return { ok: true };
  }
  if ((x = m(/^\/submissions\/(\d+)\/(approve|decline)$/))) {
    if (x[2] === "approve") throw new HttpError(400, "This is a demo, so “The Winter Ferry” can’t be added to the library. On your own Loft, approving puts it on the shelves.");
    rec["/submissions"] = rec["/submissions"].filter((y) => y.id !== Number(x[1])); return { ok: true };
  }
  if ((x = m(/^\/join-requests\/(\d+)(\/approve)?$/))) {
    const j = rec["/join-requests"].find((y) => y.id === Number(x[1])); need(j, 404, "No such request");
    rec["/join-requests"] = rec["/join-requests"].filter((y) => y !== j);
    if (x[2]) { const u = { id: ++S.nextId, username: j.username, admin: false }; rec["/users"].push(u); return u; }
    return { ok: true };
  }
  if (path === "/users" && method === "POST") {
    const name = String(body.username || "").trim(); need(name, 400, "A name is needed");
    need(!rec["/users"].some((u) => fold(u.username) === fold(name)), 400, "That name is taken");
    const u = { id: ++S.nextId, username: name, admin: false }; rec["/users"].push(u); return u;
  }
  if ((x = m(/^\/users\/(\d+)$/)) && method !== "GET") {
    const u = rec["/users"].find((y) => y.id === Number(x[1])); need(u && u.id !== 1, 400, "You can’t change your own account here");
    if (method === "DELETE") { rec["/users"] = rec["/users"].filter((y) => y !== u); return { ok: true }; }
    if ("admin" in body) u.admin = !!body.admin; return u;
  }
  if (path === "/library" && method === "PATCH") {
    for (const [k, v] of Object.entries(body || {})) if (k !== "books_dirs" && k !== "upload_dir" && k !== "backup_dir") rec["/library"][k] = v;
    return rec["/library"];
  }
  if (path === "/backups" && method === "POST") {
    const t = now(), d = new Date(t * 1000), p = (n) => String(n).padStart(2, "0");
    const name = `loft-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-b95a53.zip`;
    rec["/backups"].backups.unshift({ name, at: t, size: 917204, before_restore: false, mine: true });
    rec["/backups"].last_at = t;
    return { name, ...rec["/backups"] };
  }
  if (path === "/scan" && method === "POST") return { ok: true };
  if (path === "/updates/check") { rec["/updates"].checked_at = now(); return rec["/updates"]; }
  if (method === "GET" && (path + (q.toString() ? `?${q}` : "")) in rec) return rec[path + (q.toString() ? `?${q}` : "")];
  if (method === "GET" && path in rec) return rec[path];
  if (path.startsWith("/lookup")) throw new HttpError(503, "Looking up details online needs your own Loft server; the demo doesn’t go online.");
  if (method !== "GET") throw new HttpError(400, DEMO_NO);
  return undefined;   // not a JSON answer: a file, a page image, a chapter
}

// Files the recording keeps under demo/: covers, page images, chapters, the books themselves.
function staticUrl(path) {
  let x;
  if ((x = path.match(/^\/api\/books\/(\d+)\/cover$/))) return `${BASE}covers/${x[1]}.jpg`;
  if ((x = path.match(/^\/api\/files\/(\d+)\/pages\/(\d+)$/))) return `${BASE}pages/${x[1]}-${x[2]}.jpg`;
  if ((x = path.match(/^\/api\/files\/(\d+)\/chapters\/(\d+)$/))) return `${BASE}chapters/${x[1]}-${x[2]}.html`;
  return null;
}

window.fetch = async function (input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, location.href);
  if (url.origin !== location.origin) return realFetch(input, init);
  if (url.pathname === "/whatsnew.json") return realFetch(new URL("whatsnew.json", document.baseURI), init);
  if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
  await ready;
  const method = (init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
  let body = null;
  try { body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null; } catch { body = null; }
  const path = url.pathname.slice(4);
  try {
    const out = route(method, path, url.searchParams, body || {});
    if (out !== undefined) return json(clone(out));
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error("Loft demo:", method, path, e);
    return fail(500, "Something went wrong in the demo");
  }
  const file = staticUrl(url.pathname);
  if (file) return realFetch(file, { signal: init.signal });
  return realFetch(input, init);   // anything else: the service worker (sw.js) has it, or it's not in the demo
};
})();
