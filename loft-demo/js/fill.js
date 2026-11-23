// Looking up books that are missing details, one after another (admins, from the library check):
// each book is looked up online, the admin picks the match, and only what's missing is filled in
// (and the cover, if it has none). Nothing already there changes, and nothing changes unpicked.
import { api, authorLine, esc } from "./api.js";
import { coverHTML } from "./cover.js";
import { showLookup } from "./edit.js";
import { saved } from "./settings.js";
import { searchTitle, seriesFromTitle } from "./titles.js";

const KINDS = { no_tags: "Books with no tags", no_cover: "Books with no cover" };
const FIELD_NAMES = { tags: "tags", description: "description", publisher: "publisher", published: "date",
  language: "language", authors: "author", series: "series", series_index: "number" };


// What a match adds to a book: only the details it doesn't have yet.
async function additions(b, c) {
  const patch = {};
  if (!b.tags.length && c.tags && c.tags.length) patch.tags = c.tags;
  if (!b.authors.length && c.authors && c.authors.length) patch.authors = c.authors;
  for (const k of ["publisher", "published", "language"]) if (!b[k] && c[k]) patch[k] = c[k];
  if (!b.series) {
    const s = c.series ? { series: c.series, index: c.series_index ?? null } : seriesFromTitle(b.title) || seriesFromTitle(c.title);
    if (s) { patch.series = s.series; patch.series_index = s.index; }
  }
  if (!b.description) {
    let text = c.description || "";
    if (!text && c.key) text = (await api(`/lookup/description?key=${encodeURIComponent(c.key)}`).catch(() => ({}))).description || "";
    if (text) patch.description = text;
  }
  return patch;
}

export async function renderFill(main, params) {
  const kind = KINDS[params.get("kind")] ? params.get("kind") : "no_tags";
  const { items } = await api("/check");
  const queue = items.filter((i) => i.kind === kind).map((i) => i.book);
  let at = 0;
  let filled = 0;

  main.innerHTML = `<section class="page narrow fill-page">
    <header class="page-head"><h1>Look them up</h1>
      <p class="muted"><span data-progress></span> <a href="#/check">Back to the library check</a></p></header>
    <div data-card></div>
  </section>`;
  const card = main.querySelector("[data-card]");
  const progress = main.querySelector("[data-progress]");

  async function show() {
    if (at >= queue.length) {
      progress.textContent = `${KINDS[kind]}: done.`;
      card.innerHTML = `<div class="empty"><p>${filled ? `Filled in ${filled} ${filled === 1 ? "book" : "books"}.` : "Nothing was changed."}
        ${queue.length - filled > 0 ? `${queue.length - filled} skipped; they’re still in the library check.` : ""}</p>
        <a class="btn btn-primary" href="#/check">Back to the library check</a>
        <a class="btn" href="#/stacks?by=section">See the stacks</a></div>`;
      return;
    }
    progress.textContent = `${KINDS[kind]}: ${at + 1} of ${queue.length}.`;
    card.innerHTML = `<p class="muted">Opening the book…</p>`;
    let b;
    try { b = await api(`/books/${queue[at].id}`); } catch { at += 1; return show(); }
    const missing = [!b.tags.length && "tags", !b.description && "description", !b.has_cover && "cover",
      !b.authors.length && "author"].filter(Boolean);
    card.innerHTML = `<article class="fill-book">
      <div class="fill-cover">${coverHTML(b, 240)}</div>
      <div class="fill-text">
        <h2>${esc(b.title)}</h2>
        ${b.authors.length ? `<p>${esc(authorLine(b.authors))}</p>` : ""}
        <p class="muted">Missing: ${missing.join(", ") || "nothing"}${b.tags.length ? ` · tagged ${esc(b.tags.join(", "))}` : ""}</p>
        <div class="fill-actions">
          <button class="btn btn-small" type="button" data-skip>Skip</button>
          <button class="btn btn-small" type="button" data-never>Don’t ask again</button>
          <a class="btn btn-small" href="#/book/${b.id}?edit=1">Edit by hand</a>
        </div>
        <form class="fill-search" data-search novalidate>
          <label>Title<input name="title" value="${esc(searchTitle(b.title))}" autocomplete="off"></label>
          <label>Author<input name="author" value="${esc(b.authors[0] || "")}" autocomplete="off" placeholder="Leave empty to search by title"></label>
          <button class="btn btn-small" type="submit">Search</button>
        </form>
        <div class="lookup" data-picks></div>
      </div>
    </article>`;
    card.querySelector("[data-skip]").addEventListener("click", () => { at += 1; show(); });
    card.querySelector("[data-never]").addEventListener("click", async () => {
      await api("/check/ignored", { method: "POST", body: { kind, key: String(b.id) } }).catch(() => {});
      at += 1;
      show();
    });
    const comic = b.files.some((f) => f.readable === "pages");
    const picks = card.querySelector("[data-picks]");
    const form = card.querySelector("[data-search]");
    // Search with the cleaned title and the author; nothing found, and an author was given: by title alone.
    const search = async () => {
      const title = form.elements.title.value.trim();
      const author = form.elements.author.value.trim();
      if (!title) return;
      await showLookup(picks, { title, author, comic }, pick);
      if (author && !picks.querySelector("[data-pick]")) {
        await showLookup(picks, { title, author: "", comic }, pick);
        if (picks.querySelector("[data-pick]")) {
          picks.insertAdjacentHTML("afterbegin", `<p class="lookup-note">Nothing by ${esc(author)}; these match the title.</p>`);
        }
      }
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); search(); });
    search();

    async function pick(c) {
      card.querySelector("[data-picks]").innerHTML = `<p class="lookup-note">Saving…</p>`;
      const changed = [];
      try {
        const patch = await additions(b, c);
        if (Object.keys(patch).length) {
          await api(`/books/${b.id}`, { method: "PATCH", body: patch });
          changed.push(...Object.keys(patch).map((k) => FIELD_NAMES[k] || k));
        }
        if (!b.has_cover && c.cover_url) {
          await api(`/books/${b.id}/cover/lookup`, { method: "POST", body: { url: c.cover_url } });
          changed.push("cover");
        }
      } catch (err) {
        card.querySelector("[data-picks]").innerHTML = `<p class="form-error">${esc(err.message)}</p>`;
        return;
      }
      if (changed.length) filled += 1;
      saved(changed.length ? `${b.title}: added ${changed.join(", ")}` : `${b.title}: nothing new to add`);
      at += 1;
      show();
    }
  }
  show();
}
