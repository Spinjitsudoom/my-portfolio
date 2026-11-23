// The Shelves button on a book's page: tick the shelves this book is on, or start a new one.
// Want to read is also a reading status, so a change here tells the Status button ("loft:shelves").
import { api, esc, icon } from "./api.js";

export function shelfButtonHTML(book) {
  const on = (book.shelves || []).length;
  return `<div class="shelf-menu">
    <button class="btn" type="button" data-shelf-toggle aria-expanded="false" aria-haspopup="true">
      ${icon("shelf")}${on ? "On your shelves" : "Add to a shelf"}</button>
    <div class="shelf-pop" hidden></div>
  </div>`;
}

export function wireShelfMenu(root, book) {
  const wrap = root.querySelector(".shelf-menu");
  if (!wrap) return;
  const toggle = wrap.querySelector("[data-shelf-toggle]");
  const pop = wrap.querySelector(".shelf-pop");
  let mine = new Set(book.shelves || []);

  const close = () => { pop.hidden = true; toggle.setAttribute("aria-expanded", "false"); };
  const label = () => {
    toggle.innerHTML = `${icon("shelf")}${mine.size ? "On your shelves" : "Add to a shelf"}`;
  };

  const changed = () => {
    book.shelves = [...mine];
    root.dispatchEvent(new CustomEvent("loft:shelves", { detail: { from: "shelf" } }));
  };
  // The Status button put the book on Want to read or took it off.
  root.addEventListener("loft:shelves", (e) => {
    if (e.detail?.from === "shelf") return;
    mine = new Set(book.shelves || []);
    label();
    if (!pop.hidden) draw();
  });

  async function draw() {
    const shelves = await api("/shelves");
    pop.innerHTML = `<ul class="shelf-choices">${shelves.map((s) => `<li>
        <label class="switch"><input type="checkbox" data-shelf="${s.id}" ${mine.has(s.id) ? "checked" : ""}><span>${esc(s.name)}</span></label>
      </li>`).join("")}</ul>
      <form class="new-shelf" novalidate>
        <input name="name" placeholder="New shelf" aria-label="New shelf name" maxlength="40" autocomplete="off">
        <button class="btn btn-small" type="submit">${icon("plus")}Add</button>
      </form>
      <p class="form-error" role="alert" hidden></p>`;
    const error = pop.querySelector(".form-error");
    pop.querySelectorAll("[data-shelf]").forEach((c) => c.addEventListener("change", async () => {
      const id = Number(c.dataset.shelf);
      try {
        await api(`/shelves/${id}/books/${book.id}`, { method: c.checked ? "PUT" : "DELETE" });
        c.checked ? mine.add(id) : mine.delete(id);
        label();
        changed();
      } catch (e) {
        c.checked = !c.checked;
        error.textContent = e.message;
        error.hidden = false;
      }
    }));
    pop.querySelector(".new-shelf").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (!name) return;
      try {
        const shelf = await api("/shelves", { method: "POST", body: { name } });
        await api(`/shelves/${shelf.id}/books/${book.id}`, { method: "PUT" });
        mine.add(shelf.id);
        label();
        changed();
        await draw();
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
      }
    });
  }

  toggle.addEventListener("click", async () => {
    if (!pop.hidden) return close();
    pop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    pop.innerHTML = `<p class="muted">Loading your shelves…</p>`;
    await draw();
    pop.querySelector("input")?.focus();
  });
  root.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });  // root goes with the page
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); toggle.focus(); } });
}
