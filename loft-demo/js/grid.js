// Every book on one shelf, or a search: a grid of covers that loads more as you scroll.
import { api, authorLine, esc } from "./api.js";
import { coverHTML } from "./cover.js";

const PAGE = 60;

export function gridItem(book) {
  return `<li><a href="#/book/${book.id}" class="grid-link">
    ${coverHTML(book, 240)}
    <span class="shelf-title">${esc(book.title)}</span>
    <span class="shelf-author">${esc(authorLine(book.authors))}</span>
  </a></li>`;
}

export async function renderGrid(main, { kind, value, title, query }) {
  const sort = new URLSearchParams(location.hash.split("?")[1] || "").get("sort") || "title";
  if (query !== undefined) {
    const books = await api(`/search?q=${encodeURIComponent(query)}`);
    main.innerHTML = `<section class="page">
      <header class="page-head"><h1>${books.length ? `Results for “${esc(query)}”` : `Nothing matches “${esc(query)}”`}</h1>
      ${books.length ? "" : `<p class="muted">Try part of a title, an author’s surname or a series name.</p>`}</header>
      <ul class="grid" data-trail="${esc(`Results for “${query}”`)}">${books.map(gridItem).join("")}</ul></section>`;
    return;
  }

  const base = `/books?sort=${sort}${kind ? `&kind=${encodeURIComponent(kind)}&value=${encodeURIComponent(value || "")}` : ""}`;
  const first = await api(`${base}&offset=0&limit=${PAGE}`);
  const heading = title || "All books";
  const shelf = kind === "shelf" ? (await api("/shelves")).find((x) => String(x.id) === String(value)) : null;
  const empty = kind === "shelf" ? "Nothing on this shelf yet. Add books from their pages."
    : kind === "finished" ? "Books you read to the end show up here."
    : kind === "status" ? "No books have this status yet. Loft sets it as you read, or set it on a book’s page." : "";
  main.innerHTML = `<section class="page">
    <header class="page-head"><h1>${esc(shelf ? shelf.name : heading)}</h1>
      <p class="muted">${first.total || !empty ? `${first.total} ${first.total === 1 ? "book" : "books"}` : empty}</p>
      ${shelf && shelf.kind === "own" ? `<div class="head-actions">
        <button class="btn btn-small" type="button" data-rename>Rename</button>
        <button class="btn btn-small" type="button" data-delete>Remove shelf</button></div>` : ""}</header>
    <ul class="grid" data-trail="${esc(shelf ? shelf.name : heading)}" data-more="${esc(base)}" data-total="${first.total}">${first.books.map(gridItem).join("")}</ul>
    <div class="grid-more" aria-hidden="true"></div>
  </section>`;
  main.querySelector("[data-rename]")?.addEventListener("click", async () => {
    const name = prompt("New name for this shelf", shelf.name);
    if (!name || name.trim() === shelf.name) return;
    try {
      const renamed = await api(`/shelves/${shelf.id}`, { method: "PATCH", body: { name } });
      location.hash = `#/all?kind=shelf&value=${shelf.id}&title=${encodeURIComponent(renamed.name)}`;
    } catch (e) { alert(e.message); }
  });
  main.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Remove the shelf “${shelf.name}”? The books stay in the library.`)) return;
    await api(`/shelves/${shelf.id}`, { method: "DELETE" });
    location.hash = "#/";
  });

  const list = main.querySelector(".grid");
  let loaded = first.books.length;
  let busy = false;
  const sentinel = main.querySelector(".grid-more");
  if (loaded >= first.total) return;
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting || busy || !document.body.contains(sentinel)) return;
    busy = true;
    const next = await api(`${base}&offset=${loaded}&limit=${PAGE}`);
    list.insertAdjacentHTML("beforeend", next.books.map(gridItem).join(""));
    loaded += next.books.length;
    busy = false;
    if (loaded >= next.total || !next.books.length) observer.disconnect();
  }, { rootMargin: "600px" });
  observer.observe(sentinel);
}
