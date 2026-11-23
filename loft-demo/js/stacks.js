// The stacks: the whole library as bookcases, signed by series, section or author, with books
// standing spine-out (or face-out). One bar on top chooses how to shelve and narrows what's shown;
// on a phone its filters fold behind one button. Tap a spine and the book slides out.
import { api, authorLine, esc, seriesLine } from "./api.js";
import { coverHTML } from "./cover.js";
import { spineTitle } from "./titles.js";
import { STATUS_LABELS as STATUS } from "./statusmenu.js";

const KEPT = "loft-stacks";
const BY = [["series", "Series"], ["section", "Sections"], ["author", "Authors"]];
const FORMATS = { pdf: "PDF", epub: "EPUB", cbz: "Comic (CBZ)", cbr: "Comic (CBR)", cb7: "Comic (CB7)",
  mobi: "Kindle (MOBI)", azw: "Kindle (AZW)", azw3: "Kindle (AZW3)", fb2: "FB2", txt: "Text" };
const FILTERS = ["status", "section", "author", "format"];

function remembered() {
  try { return JSON.parse(localStorage.getItem(KEPT) || "{}"); } catch { return {}; }
}

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// A spine's colour: the cover's own, or one made from the title for books without a cover.
function spineColour(b) {
  if (b.color) return b.color;
  const h = hash(b.title) % 360;
  return `hsl(${h} 32% 32%)`;
}

function readableOn(colour) {
  const m = /^#([0-9a-f]{6})$/i.exec(colour || "");
  if (!m) return "#f3ece3";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1b140e" : "#f3ece3";
}

// Thicker for longer books: pages when Loft knows them, else the file's size.
function thickness(b) {
  if (b.pages) return Math.round(Math.min(46, Math.max(13, 9 + b.pages / 9)));
  const mb = (b.size || 0) / 1e6;
  return Math.round(Math.min(40, Math.max(14, 14 + Math.log2(Math.max(1, mb)) * 4)));
}


const number = (i) => (i == null ? "" : String(i).replace(/\.0$/, ""));

function spineHTML(b, inSeries = false) {
  const c = spineColour(b);
  const tall = 84 + (hash(b.id) % 15);  // a real shelf is never all one height
  const reading = b.progress && !b.progress.finished;
  return `<button type="button" class="spine${reading ? " is-reading" : ""}" data-book="${b.id}" aria-expanded="false"
      style="--c:${c};--ink:${readableOn(c)};--w:${thickness(b)}px;--tall:${tall}%"
      aria-label="${esc(b.title)}${b.authors.length ? `, by ${esc(authorLine(b.authors))}` : ""}${reading ? ", reading" : ""}">
    <span class="spine-title">${esc(spineTitle(b, inSeries))}</span>
    ${b.series_index ? `<span class="spine-no">${esc(number(b.series_index))}</span>` : ""}
  </button>`;
}

function faceHTML(b) {
  return `<a class="face" href="#/book/${b.id}" title="${esc(b.title)}">${coverHTML(b, 240)}</a>`;
}

function pulledHTML(b) {
  const reading = b.progress && !b.progress.finished;
  return `<div class="pulled" data-pulled="${b.id}">
    <a class="pulled-cover" href="#/book/${b.id}" tabindex="-1">${coverHTML(b, 240)}</a>
    <div class="pulled-text">
      <strong>${esc(b.title)}</strong>
      ${b.authors.length ? `<span>${esc(authorLine(b.authors))}</span>` : ""}
      ${b.series ? `<span class="muted">${esc(seriesLine(b))}</span>` : ""}
      ${reading ? `<span class="muted">Page ${b.progress.page + 1} of ${b.progress.pages}</span>` : ""}
      <span class="pulled-actions">
        <a class="btn btn-small btn-primary" href="#/read/${b.id}">${reading ? "Continue" : b.progress ? "Read again" : "Read"}</a>
        <a class="btn btn-small" href="#/book/${b.id}">About</a>
      </span>
    </div>
  </div>`;
}

// On lettered shelves (and the books in no series) a name card stands where one author's books begin.
function shelfHTML(c, view) {
  const one = view === "covers" ? (b) => faceHTML(b) : (b) => spineHTML(b, c.kind === "series");
  if (c.kind !== "letter" && c.kind !== "loose") return c.books.map(one).join("");
  let last = null;
  return c.books.map((b) => {
    const who = b.authors[0] || "No author";
    const card = who !== last ? `<span class="divider" aria-hidden="true"><span>${esc(who)}</span></span>` : "";
    last = who;
    return card + one(b);
  }).join("");
}

function caseLink(c) {
  if (c.kind === "series") return `#/all?kind=series&value=${encodeURIComponent(c.title)}&title=${encodeURIComponent(c.title)}`;
  if (c.kind === "author" && c.title !== "Unknown author") return `#/all?kind=author&value=${encodeURIComponent(c.title)}&title=${encodeURIComponent(c.title)}`;
  return "";
}

export async function renderStacks(main, params) {
  const kept = remembered();
  const pick = (k, fallback = "") => (params.has(k) ? params.get(k) : (kept[k] ?? fallback));
  const state = { by: pick("by", "series"), view: pick("view", "spines") };
  for (const f of FILTERS) state[f] = params.get(f) || "";
  if (!BY.some(([k]) => k === state.by)) state.by = "series";
  try { localStorage.setItem(KEPT, JSON.stringify({ by: state.by, view: state.view })); } catch { /* fine */ }

  const q = new URLSearchParams({ by: state.by });
  for (const f of FILTERS) if (state[f]) q.set(f, state[f]);
  const data = await api(`/stacks?${q}`);
  const active = FILTERS.filter((f) => state[f]).length;

  const go = (change) => {
    const next = { ...state, ...change };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    location.hash = `#/stacks?${p}`;
  };
  const select = (name, label, options) => `<label class="pick${state[name] ? " is-set" : ""}">
      <span class="pick-label">${label}</span>
      <select data-filter="${name}">
        <option value="">All</option>
        ${options.map(([v, text, n]) => `<option value="${esc(v)}" ${state[name] === v ? "selected" : ""} ${n === 0 && state[name] !== v ? "disabled" : ""}>${esc(text)}${n != null ? ` (${n})` : ""}</option>`).join("")}
      </select></label>`;
  const f = data.facets;

  main.innerHTML = `<section class="stacks">
    <header class="stacks-head">
      <h1>The stacks</h1>
      <p class="muted">${data.total} ${data.total === 1 ? "book" : "books"}${active ? " match" : " in the library"}</p>
    </header>
    <div class="stacks-bar">
      <div class="segmented" role="radiogroup" aria-label="Shelve by">${BY.map(([k, label]) =>
        `<button type="button" role="radio" aria-checked="${state.by === k}" data-by="${k}">${label}</button>`).join("")}</div>
      <button class="btn btn-small stacks-filter-toggle" type="button" data-toggle aria-expanded="false">
        Filters${active ? ` <span class="count">${active}</span>` : ""}</button>
      <div class="stacks-filters" data-filters>
        ${select("status", "Reading", Object.entries(STATUS).map(([k, label]) => [k, label, f.status[k]]))}
        ${select("section", "Section", Object.entries(f.section).map(([k, n]) => [k, k, n]))}
        ${select("author", "Author", Object.entries(f.author).map(([k, n]) => [k, k, n]))}
        ${Object.keys(f.format).length > 1 || state.format ? select("format", "Format", Object.entries(f.format).map(([k, n]) => [k, FORMATS[k] || k.toUpperCase(), n])) : ""}
        ${active ? `<button class="link-btn" type="button" data-clear>Clear filters</button>` : ""}
      </div>
      <div class="segmented stacks-view" role="radiogroup" aria-label="Show books">${[["spines", "Spines"], ["covers", "Covers"]].map(([k, label]) =>
        `<button type="button" role="radio" aria-checked="${state.view === k}" data-view="${k}">${label}</button>`).join("")}</div>
    </div>
    ${data.cases.length ? data.cases.map((c) => `<section class="case" aria-label="${esc(c.title)}" data-trail="${esc(c.title)}">
        <header class="case-sign">
          <h2>${esc(c.title)}</h2><span class="case-count">${c.count}</span>
          ${caseLink(c) ? `<a class="see-all" href="${caseLink(c)}">See all</a>` : ""}
        </header>
        <div class="case-shelf ${state.view === "covers" ? "is-faces" : ""}">
          <div class="case-row">${shelfHTML(c, state.view)}</div>
        </div>
      </section>`).join("")
      : `<div class="empty"><p>No books match those filters.</p><button class="btn" type="button" data-clear>Clear filters</button></div>`}
  </section>`;

  const books = new Map(data.cases.flatMap((c) => c.books).map((b) => [String(b.id), b]));
  main.querySelectorAll("[data-by]").forEach((b) => b.addEventListener("click", () => go({ by: b.dataset.by })));
  main.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => go({ view: b.dataset.view })));
  main.querySelectorAll("[data-filter]").forEach((s) => s.addEventListener("change", () => go({ [s.dataset.filter]: s.value })));
  main.querySelectorAll("[data-clear]").forEach((b) => b.addEventListener("click", () => go(Object.fromEntries(FILTERS.map((k) => [k, ""])))));
  const toggle = main.querySelector("[data-toggle]");
  toggle.addEventListener("click", () => {
    const open = main.querySelector("[data-filters]").classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  // Tap a spine: the book slides out beside it; tap again (or another, or Escape) to put it back.
  const putBack = () => {
    main.querySelectorAll(".pulled").forEach((p) => {
      p.classList.remove("is-out");
      setTimeout(() => p.remove(), 260);
    });
    main.querySelectorAll(".spine[aria-expanded=true]").forEach((s) => s.setAttribute("aria-expanded", "false"));
  };
  main.addEventListener("click", (e) => {
    const spine = e.target.closest(".spine");
    if (!spine) return;
    const wasOut = spine.getAttribute("aria-expanded") === "true";
    putBack();
    if (wasOut) return;
    spine.setAttribute("aria-expanded", "true");
    spine.insertAdjacentHTML("afterend", pulledHTML(books.get(spine.dataset.book)));
    const pulled = spine.nextElementSibling;
    requestAnimationFrame(() => {
      pulled.classList.add("is-out");
      setTimeout(() => pulled.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }), 200);
    });
  });
  const onKey = (e) => { if (e.key === "Escape") putBack(); };
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", () => document.removeEventListener("keydown", onKey), { once: true });
}
