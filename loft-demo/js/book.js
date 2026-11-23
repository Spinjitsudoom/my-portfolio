// A book's own page. Admins can turn it into its own edit form: the same page, with fields in place.
import { api, esc, icon, putRaw, seriesLine } from "./api.js";
import { coverHTML } from "./cover.js";
import { canRead, shelfHTML, wireShelves } from "./home.js";
import { clearErrors, detailFields, fillEmpty, readDetails, showError, showLookup } from "./edit.js";
import { shelfButtonHTML, wireShelfMenu } from "./shelfmenu.js";
import { statusButtonHTML, wireStatusMenu } from "./statusmenu.js";
import { state } from "./main.js";
import { wireDownload } from "./downloads.js";
import { wireDiscussion } from "./discussion.js";
import { searchTitle } from "./titles.js";
import { trailFor, trailHTML, wireTrail } from "./trail.js";

function size(bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function readLabel(p) {
  if (!p) return "Read";
  if (p.finished) return "Read again";
  return `Continue from page ${p.page + 1}`;
}

function link(kind, value, label = value) {
  return `<a href="#/all?kind=${kind}&value=${encodeURIComponent(value)}&title=${encodeURIComponent(value)}">${esc(label)}</a>`;
}

function publishedText(value) {
  if (!value) return "";
  const parts = value.split("-").map(Number);
  if (parts.length === 1) return String(parts[0]);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] || 1));
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", ...(parts[2] ? { day: "numeric" } : {}), timeZone: "UTC" });
}

export async function renderBook(main, id, params = new URLSearchParams()) {
  const b = await api(`/books/${id}`);
  const editing = state.me.admin && params.get("edit");
  if (editing) return renderEditor(main, b, params.get("edit") === "cover");

  const authors = b.authors.map((a) => link("author", a)).join(" and ");
  const paragraphs = (b.description || "").split(/\n{2,}/).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const facts = [
    b.publisher && ["Publisher", esc(b.publisher)],
    b.published && ["Published", esc(publishedText(b.published))],
    b.language && ["Language", esc(b.language)],
  ].filter(Boolean);
  const trail = trailHTML(await trailFor(b), b.id);

  main.innerHTML = `${trail}<article class="book-page${trail ? " has-trail" : ""}" style="--glow: ${esc(b.color || "#3a2a1e")}">
    <div class="book-page-cover">${coverHTML(b, 480, "book-thick")}</div>
    <div class="book-page-text">
      <h1 class="book-page-title">${esc(b.title)}</h1>
      ${authors ? `<p class="book-page-author">${authors}</p>` : ""}
      ${b.series ? `<p class="book-page-series">${link("series", b.series, seriesLine(b))}</p>` : ""}
      <div class="files">
        ${canRead(b) ? `<a class="btn btn-primary" href="#/read/${b.id}${b.progress && b.progress.finished ? "?page=0" : ""}">${readLabel(b.progress)}</a>` : ""}
        ${canRead(b) ? `<span class="download-slot" data-download></span>` : ""}
        ${b.files.map((f) => `<a class="btn ${!canRead(b) && f === b.files[0] ? "btn-primary" : ""}" href="/api/files/${f.id}" download
          title="Save the ${esc(f.format.toUpperCase())} file itself, to read in another app">
          ${icon("file")}Save ${esc(f.format.toUpperCase())} file<span class="file-size">${size(f.size)}</span></a>`).join("")}
        ${statusButtonHTML(b)}
        ${shelfButtonHTML(b)}
        ${state.me.admin ? `<a class="btn" href="#/book/${b.id}?edit=1">${icon("edit")}Edit</a>` : ""}
      </div>
      ${paragraphs ? `<div class="description">${paragraphs}</div>` : ""}
      ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>` : ""}
      ${b.tags.length ? `<ul class="tags">${b.tags.map((t) => `<li>${link("tag", t)}</li>`).join("")}</ul>` : ""}
    </div>
  </article>
  <section class="book-talk" id="discussion" aria-labelledby="talk-head">
    <h2 id="talk-head">Discussion</h2>
    <div data-talk></div>
  </section>
  ${b.series_books.length ? shelfHTML({ title: `More in ${b.series}`, kind: "series", value: b.series, books: b.series_books, trail: false }) : ""}`;
  wireShelves(main);
  wireTrail(main);
  wireStatusMenu(main, b);
  wireShelfMenu(main, b);
  const slot = main.querySelector("[data-download]");
  if (slot) wireDownload(slot, b);
  wireDiscussion(main.querySelector("[data-talk]"), b.id);
  if (params.get("discussion")) main.querySelector("#discussion").scrollIntoView({ block: "start" });
}

const SPLIT = [[null, "Automatic"], [true, "Split them"], [false, "Don’t split"]];
const WRAP = [[null, "Automatic"], [true, "Front first"], [false, "As scanned"]];
const DIRECTION = [[false, "Left to right"], [true, "Right to left (manga)"]];
// A picture book's pages are designed, not scanned: Loft never splits them by itself, so splitting
// is off (null, or false from before) or on.
const SPLIT_FIXED = [[null, "Don’t split"], [true, "Split them"]];
const WRAP_FIXED = [[null, "Automatic"], [true, "Front first"], [false, "As the book has it"]];
const PICTURE_BOOK_FORMATS = ["epub", "azw3", "azw", "mobi"];  // flowing formats a picture book can come in

const arrangedNote = (f) => f.arranged ? "You’ve moved or hidden pages in this book." : "As the file has them.";

function layoutHTML(b) {
  const files = b.files.filter((f) => f.layout);
  if (!files.length) return "";
  const seg = (f, key, options, on = (v) => f.layout[key] === v) => `<div class="segmented" role="radiogroup">${options.map(([v, label]) =>
    `<button type="button" role="radio" aria-checked="${on(v)}" data-file="${f.id}" data-layout="${key}" data-value="${v}">${label}</button>`).join("")}</div>`;
  const split = (f) => (f.fixed ? seg(f, "split", SPLIT_FIXED, (v) => (v === true) === (f.layout.split === true)) : seg(f, "split", SPLIT));
  return `<section class="edit-pages">
    <h2>Pages</h2>
    <p class="muted">${files.every((f) => f.fixed) ? "Which way the pages turn, their order, and splitting pages that hold two printed pages."
      : "Which way the pages turn, and fixes for when Loft guesses a scan’s layout wrong."} Changes save at once.</p>
    ${files.map((f) => `
      ${files.length > 1 ? `<h3>${esc(f.format.toUpperCase())}</h3>` : ""}
      <h3>Reading direction</h3>${seg(f, "rtl", DIRECTION)}
      <h3>${f.fixed ? "Two printed pages on one page" : "Two printed pages in one scan"}</h3>${split(f)}
      <p class="muted seg-hint">${f.fixed ? "For books made from scans: cuts only the wide pages in two."
        : "Split them cuts only the wide scans in two; ordinary pages stay whole."}</p>
      <h3>${f.fixed ? "Wraparound cover (back and front on one page)" : "Wraparound cover (back and front in one scan)"}</h3>${seg(f, "wraparound", f.fixed ? WRAP_FIXED : WRAP)}
      <h3>Page order</h3>
      <div class="arrange-row">
        <span class="muted" data-arranged-note="${f.id}">${arrangedNote(f)}</span>
        <button class="btn btn-small" type="button" data-arrange="${f.id}">Arrange pages</button>
      </div>`).join("")}
    <p class="form-error" data-layout-error role="alert" hidden></p>
  </section>`;
}

// Only what the admin actually changed is sent: each field sent is locked against later scans.
function changedDetails(b, now) {
  const same = (key, a, c) => {
    if (key === "authors" || key === "tags") return JSON.stringify(a || []) === JSON.stringify(c || []);
    if (key === "series_index") return (a ?? null) === (c ?? null);
    return String(a ?? "").replace(/\r\n/g, "\n").trim() === String(c ?? "").replace(/\r\n/g, "\n").trim();
  };
  return Object.fromEntries(Object.entries(now).filter(([key, value]) => !same(key, b[key], value)));
}

function renderEditor(main, b, coversFirst) {
  const back = `#/book/${b.id}`;
  main.innerHTML = `<article class="book-page editing" style="--glow: ${esc(b.color || "#3a2a1e")}">
    <div class="book-page-cover">
      <div data-cover>${coverHTML(b, 480, "book-thick")}</div>
      <div class="cover-tools">
        <label class="btn btn-small file-pick">${icon("plus")}Upload a picture<input type="file" accept="image/*" data-cover-file hidden></label>
        <button class="btn btn-small" type="button" data-cover-find>Find covers online</button>
        ${b.has_cover ? `<button class="btn btn-small" type="button" data-cover-none>No cover</button>` : ""}
      </div>
      <p class="form-error" data-cover-error role="alert" hidden></p>
      <div class="lookup" data-cover-picks hidden></div>
    </div>
    <form class="book-page-text edit-form" novalidate>
      <p class="edit-lede">Editing. What you change here is kept, even when the book’s file or Calibre changes.</p>
      ${detailFields(b)}
      <div class="edit-actions">
        <button class="btn btn-primary" type="submit">Save changes</button>
        <a class="btn" href="${back}">Cancel</a>
        <button class="btn" type="button" data-fill>Look up details</button>
      </div>
      <p class="form-error" data-form-error role="alert" hidden></p>
      <div class="lookup" data-fill-picks hidden></div>
      <div data-pages-slot>${layoutHTML(b)}</div>
    </form>
  </article>`;

  const form = main.querySelector(".edit-form");
  const formError = main.querySelector("[data-form-error]");
  const coverError = main.querySelector("[data-cover-error]");
  const fail = (box, message) => { box.textContent = message; box.hidden = false; };
  const comic = b.files.some((f) => f.layout);  // shown page by page: worth asking AniList too

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    formError.hidden = true;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const changed = changedDetails(b, readDetails(form));
      if (Object.keys(changed).length) await api(`/books/${b.id}`, { method: "PATCH", body: changed });
      location.hash = back;
    } catch (err) {
      const left = showError(form, err.message);
      if (left) fail(formError, left);
      button.disabled = false;
    }
  });

  main.querySelector("[data-fill]").addEventListener("click", () => {
    const d = readDetails(form);
    showLookup(main.querySelector("[data-fill-picks]"), { title: searchTitle(d.title), author: d.authors[0] || "", comic }, async (c) => {
      await fillEmpty(form, c);
      main.querySelector("[data-fill-picks]").hidden = true;
    });
  });

  const showCover = (book) => {
    main.querySelector("[data-cover]").innerHTML = coverHTML(book, 480, "book-thick");
    main.querySelector("[data-cover-picks]").hidden = true;
  };
  main.querySelector("[data-cover-file]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    coverError.hidden = true;
    try { showCover(await putRaw(`/books/${b.id}/cover`, file)); }
    catch (err) { fail(coverError, err.message); }
  });
  main.querySelector("[data-cover-find]").addEventListener("click", () => {
    const d = readDetails(form);
    coverError.hidden = true;
    showLookup(main.querySelector("[data-cover-picks]"), { title: searchTitle(d.title), author: d.authors[0] || "", comic }, async (c) => {
      try { showCover(await api(`/books/${b.id}/cover/lookup`, { method: "POST", body: { url: c.cover_url } })); }
      catch (err) { fail(coverError, err.message); }
    }, { covers: true });
  });
  main.querySelector("[data-cover-none]")?.addEventListener("click", async (e) => {
    try { showCover(await api(`/books/${b.id}/cover`, { method: "DELETE" })); e.target.remove(); }
    catch (err) { fail(coverError, err.message); }
  });

  const slot = main.querySelector("[data-pages-slot]");
  const queue = { saving: Promise.resolve() };
  wirePages(slot, b, queue);
  findPictureBooks(slot, b, queue);

  if (coversFirst) main.querySelector("[data-cover-find]").click();
  else form.elements.title.focus();
}

// The Pages section's buttons. The pressed button lights up at once; saves go one after another, in
// the order pressed (queue.saving), so a slow one can't land after a later one and undo it. A save
// that fails puts the old choice back.
function wirePages(slot, b, queue) {
  const fail = (box, message) => { box.textContent = message; box.hidden = false; };
  const choose = (group, value) => group.querySelectorAll("button").forEach((x) =>
    x.setAttribute("aria-checked", String(JSON.parse(x.dataset.value) === value)));
  slot.querySelectorAll("[data-layout]").forEach((btn) => btn.addEventListener("click", () => {
    const layoutError = slot.querySelector("[data-layout-error]");
    const f = b.files.find((x) => x.id === Number(btn.dataset.file));
    const key = btn.dataset.layout;
    const value = JSON.parse(btn.dataset.value);
    const before = f.layout[key];
    if (value === before) return;
    layoutError.hidden = true;
    f.layout = { ...f.layout, [key]: value };
    choose(btn.parentElement, value);
    const layout = f.layout;
    queue.saving = queue.saving.then(() => api(`/files/${f.id}/layout`, { method: "PATCH", body: layout }).catch((err) => {
      if (f.layout[key] === value) {
        f.layout = { ...f.layout, [key]: before };
        choose(btn.parentElement, before);
      }
      fail(layoutError, err.message);  // beside the buttons, not off at the top of the page
    }));
  }));

  slot.querySelectorAll("[data-arrange]").forEach((btn) => btn.addEventListener("click", async () => {
    const layoutError = slot.querySelector("[data-layout-error]");
    const f = b.files.find((x) => x.id === Number(btn.dataset.arrange));
    layoutError.hidden = true;
    btn.disabled = true;
    try {
      const { openArrange } = await import("./arrange.js");
      await openArrange(f, { onClose: (custom) => {
        f.arranged = custom;
        slot.querySelector(`[data-arranged-note="${f.id}"]`).textContent = arrangedNote(f);
      } });
    } catch (err) { fail(layoutError, err.message); }
    btn.disabled = false;
  }));
}

// Which of the book's EPUB and Kindle files are picture books (fixed-layout), read as pages and so
// with page settings too. Only the edit page asks (opening the book to find out); a file that can't
// be opened simply has none.
async function findPictureBooks(slot, b, queue) {
  const files = b.files.filter((f) => f.readable === "flow" && PICTURE_BOOK_FORMATS.includes(f.format) && !f.layout);
  const found = await Promise.all(files.map(async (f) => {
    try {
      const outline = await api(`/files/${f.id}/flow`);
      if (!outline.fixed) return false;
      Object.assign(f, { layout: outline.layout, arranged: outline.arranged, fixed: true });
      return true;
    } catch { return false; }
  }));
  if (!found.some(Boolean) || !slot.isConnected) return;
  slot.innerHTML = layoutHTML(b);
  wirePages(slot, b, queue);
}
