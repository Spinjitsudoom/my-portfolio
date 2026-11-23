// Previous and next on a book's page. They walk the list the book was opened from (a row on the
// home page, a grid, a search, a bookcase in the stacks); a book opened any other way walks its
// series. The list is kept per tab, so two tabs can browse two different lists.
import { api, esc, icon } from "./api.js";

const KEY = "loft-trail";
const LINK = /^#\/(?:book|read)\/(\d+)/;
const PAGE = 60;

function load() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; }
}

function save(trail) {
  try {
    if (trail) sessionStorage.setItem(KEY, JSON.stringify(trail));
    else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked: the series still works */ }
}

/** The books in a list, in the order they're shown. */
export function idsIn(box) {
  const ids = new Set();
  for (const el of box.querySelectorAll('[data-book], a[href^="#/book/"], a[href^="#/read/"]')) {
    const id = Number(el.dataset.book || (LINK.exec(el.getAttribute("href") || "") || [])[1]);
    if (id) ids.add(id);
  }
  return [...ids];
}

// Opening a book from a list (anything marked data-trail) remembers that list. Opening some other
// book from anywhere else forgets it, so an old list never steers a book it doesn't hold.
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[href^="#/book/"], a[href^="#/read/"]');
  if (!a) return;
  const id = Number(LINK.exec(a.getAttribute("href"))[1]);
  const box = a.closest("[data-trail]");
  if (box) {
    save({ label: box.dataset.trail, back: location.hash || "#/", ids: idsIn(box),
      more: box.dataset.more || "", total: Number(box.dataset.total) || 0 });
  } else if (!(load()?.ids || []).includes(id)) save(null);
}, true);

const seriesKey = (b) => [b.series_index ?? 1e9, (b.title || "").toLocaleLowerCase()];
const before = (a, b) => { const [x, y] = [seriesKey(a), seriesKey(b)]; return x[0] - y[0] || x[1].localeCompare(y[1]); };

/** Where this book stands: {label, back, ids, total}, or null when there's nowhere to step. */
export async function trailFor(b) {
  const t = load();
  if (t && t.ids.includes(b.id)) {
    // At the last book a grid had loaded: fetch its next page, as scrolling would have.
    if (t.more && t.ids.at(-1) === b.id && t.ids.length < t.total) {
      try {
        const next = await api(`${t.more}&offset=${t.ids.length}&limit=${PAGE}`);
        for (const x of next.books) if (!t.ids.includes(x.id)) t.ids.push(x.id);
        save(t);
      } catch { /* stays where it was */ }
    }
    if (t.ids.length > 1) return { label: t.label, back: t.back, ids: t.ids, total: Math.max(t.total, t.ids.length) };
  }
  if (b.series && b.series_books.length) {
    const ids = [...b.series_books, b].sort(before).map((x) => x.id);
    const value = encodeURIComponent(b.series);
    return { label: b.series, back: `#/all?kind=series&value=${value}&title=${value}`, ids, total: ids.length };
  }
  return null;
}

function step(id, dir) {
  if (!id) return `<span class="trail-step is-none" aria-hidden="true"></span>`;
  const word = dir === "prev" ? "Previous" : "Next";
  return `<a class="trail-step ${dir}" href="#/book/${id}" data-step="${dir}" data-id="${id}" aria-label="${word} book">
    ${dir === "prev" ? icon("left") : ""}
    <span class="trail-text"><span class="trail-dir">${word}</span><span class="trail-title" data-title></span></span>
    ${dir === "next" ? icon("right") : ""}
  </a>`;
}

/** The bar above the book, or "" when the book has no neighbours. */
export function trailHTML(trail, id) {
  if (!trail) return "";
  const i = trail.ids.indexOf(id);
  if (i < 0) return "";
  return `<nav class="book-trail" aria-label="Books in ${esc(trail.label)}">
    ${step(trail.ids[i - 1], "prev")}
    <a class="trail-where" href="${esc(trail.back)}"><span class="trail-label">${esc(trail.label)}</span>
      <span class="trail-count">${i + 1} of ${trail.total}</span></a>
    ${step(trail.ids[i + 1], "next")}
  </nav>`;
}

/** Fill in the neighbours' titles, and let the arrow keys step while the page is showing. */
export function wireTrail(root) {
  const nav = root.querySelector(".book-trail");
  if (!nav) return;
  for (const a of nav.querySelectorAll("[data-step]")) {
    api(`/books/${a.dataset.id}`).then((b) => {
      a.querySelector("[data-title]").textContent = b.title;
      a.setAttribute("aria-label", `${a.dataset.step === "prev" ? "Previous" : "Next"}: ${b.title}`);
      a.title = b.title;
    }).catch(() => {});
  }
  const onKey = (e) => {
    if (!document.body.contains(nav)) { document.removeEventListener("keydown", onKey); return; }
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const dir = e.key === "ArrowLeft" ? "prev" : e.key === "ArrowRight" ? "next" : "";
    const a = dir && nav.querySelector(`[data-step="${dir}"]`);
    if (a) { e.preventDefault(); location.hash = a.getAttribute("href"); }
  };
  document.addEventListener("keydown", onKey);
}
