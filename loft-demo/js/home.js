// The cover wall: a lamplit book at the top, then shelves of covers.
import { api, authorLine, esc, icon, seriesLine } from "./api.js";
import { coverHTML } from "./cover.js";
import { state } from "./main.js";

export const canRead = (book) => (book.files || []).some((f) => f.readable);

function progressBar(p) {
  return p ? `<span class="cover-progress" aria-label="${Math.round(p.position * 100)}% read"><i style="width:${(p.position * 100).toFixed(1)}%"></i></span>` : "";
}

export function shelfItem(book) {
  const href = book.progress ? `#/read/${book.id}` : `#/book/${book.id}`;
  return `<li class="shelf-item">
    <a href="${href}" class="shelf-link">
      ${coverHTML(book, 240)}
      ${progressBar(book.progress)}
      <span class="shelf-title">${esc(book.title)}</span>
      <span class="shelf-author">${esc(authorLine(book.authors))}</span>
    </a>
  </li>`;
}

function allLink(row) {
  if (row.kind === "recent") return "#/all?sort=added&title=Recently%20added";
  return `#/all?kind=${row.kind}&value=${encodeURIComponent(row.value)}&title=${encodeURIComponent(row.title)}`;
}

export function shelfHTML(row) {
  return `<section class="shelf" aria-label="${esc(row.title)}"${row.trail === false ? "" : ` data-trail="${esc(row.title)}"`}>
    <header class="shelf-head">
      <h2>${esc(row.title)}</h2>
      ${row.kind === "continue" || row.kind === "device" ? "" : `<a class="see-all" href="${allLink(row)}">See all</a>`}
    </header>
    <div class="shelf-frame">
      <button class="shelf-arrow prev" type="button" aria-label="Scroll left" tabindex="-1">${icon("left")}</button>
      <ul class="shelf-row">${row.books.map(shelfItem).join("")}</ul>
      <button class="shelf-arrow next" type="button" aria-label="Scroll right" tabindex="-1">${icon("right")}</button>
    </div>
  </section>`;
}

export function wireShelves(root) {
  for (const frame of root.querySelectorAll(".shelf-frame")) {
    const row = frame.querySelector(".shelf-row");
    const update = () => {
      frame.classList.toggle("at-start", row.scrollLeft < 8);
      frame.classList.toggle("at-end", row.scrollLeft + row.clientWidth > row.scrollWidth - 8);
    };
    frame.querySelector(".prev").addEventListener("click", () => row.scrollBy({ left: -row.clientWidth * 0.85, behavior: "smooth" }));
    frame.querySelector(".next").addEventListener("click", () => row.scrollBy({ left: row.clientWidth * 0.85, behavior: "smooth" }));
    row.addEventListener("scroll", update, { passive: true });
    update();
  }
}

function heroHTML(home, detail) {
  const book = home.hero;
  const p = home.hero_progress;
  const description = (detail && detail.description) || "";
  const readable = detail ? canRead(detail) : false;
  const label = home.hero_kind === "continue" ? "Continue reading" : "Newly shelved";
  return `<section class="hero" style="--glow: ${esc(book.color || "#3a2a1e")}">
    <a class="hero-cover" href="#/book/${book.id}" aria-label="${esc(book.title)}">${coverHTML(book, 480, "book-thick")}</a>
    <div class="hero-text">
      <p class="hero-label">${label}</p>
      <h1 class="hero-title">${esc(book.title)}</h1>
      <p class="hero-author">${esc(authorLine(book.authors))}</p>
      ${book.series ? `<p class="hero-series">${esc(seriesLine(book))}</p>` : ""}
      ${p ? `<div class="hero-progress"><span class="bar"><i style="width:${(p.position * 100).toFixed(1)}%"></i></span>
        <span>Page ${p.page + 1} of ${p.pages}</span></div>`
        : description ? `<p class="hero-blurb">${esc(description.split("\n\n")[0])}</p>` : ""}
      <div class="hero-actions">
        ${readable ? `<a class="btn btn-primary" href="#/read/${book.id}${p ? "" : "?page=0"}">${p ? "Continue" : "Read"}</a>` : ""}
        <a class="btn ${readable ? "" : "btn-primary"}" href="#/book/${book.id}">About this book</a>
      </div>
    </div>
  </section>`;
}

export async function renderHome(main) {
  const home = await api("/home");
  if (!home.hero) {
    main.innerHTML = state.me.admin
      ? `<div class="empty"><h1>The shelves are empty</h1>
        <p>Add books here, or point Loft at the folders that hold them in Library settings.</p>
        <div class="hero-actions"><a class="btn btn-primary" href="#/add">Add books</a><a class="btn" href="#/admin">Library settings</a></div></div>`
      : `<div class="empty"><h1>The shelves are empty</h1><p>Nothing’s been added yet. Check back soon.</p></div>`;
    return;
  }
  const detail = await api(`/books/${home.hero.id}`).catch(() => null);
  const { deviceBooks } = await import("./downloads.js");
  const onDevice = (await deviceBooks()).filter((b) => !b.downloading);
  const rows = [...home.rows];
  if (onDevice.length) rows.splice(rows[0] && rows[0].kind === "continue" ? 1 : 0, 0, { kind: "device", title: "On this device", books: onDevice });
  main.innerHTML = heroHTML(home, detail) + rows.map(shelfHTML).join("")
    + `<p class="home-more"><a class="btn" href="#/stacks">${icon("shelf")}Browse the whole library</a></p>`;
  wireShelves(main);
}
