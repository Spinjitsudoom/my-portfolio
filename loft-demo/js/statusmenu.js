// The Status button on a book's page: where you are with this book (Want to read, Not started,
// Reading, Incomplete, Abandoned, Finished). Loft keeps it up to date as you read (statuses.py on the
// server); choosing one here sets it by hand. Want to read is also a shelf, so this and the Shelves
// button tell each other when either changes it ("loft:shelves" on the page).
import { api, esc, icon } from "./api.js";

export const STATUS_LABELS = {
  want: "Want to read", unread: "Not started", reading: "Reading",
  incomplete: "Incomplete", abandoned: "Abandoned", finished: "Finished",
};

export function statusButtonHTML(book) {
  return `<div class="status-menu">
    <button class="btn" type="button" data-status-toggle aria-expanded="false" aria-haspopup="true">
      ${icon("bookmark")}<span data-status-label>${esc(STATUS_LABELS[book.status] || STATUS_LABELS.unread)}</span></button>
    <div class="status-pop" role="menu" aria-label="Reading status" hidden></div>
  </div>`;
}

export function wireStatusMenu(root, book) {
  const wrap = root.querySelector(".status-menu");
  if (!wrap) return;
  const toggle = wrap.querySelector("[data-status-toggle]");
  const label = wrap.querySelector("[data-status-label]");
  const pop = wrap.querySelector(".status-pop");

  const show = (answer) => {
    book.status = answer.status;
    book.shelves = answer.shelves;
    label.textContent = STATUS_LABELS[book.status] || STATUS_LABELS.unread;
  };
  const close = () => { pop.hidden = true; toggle.setAttribute("aria-expanded", "false"); };

  function draw() {
    pop.innerHTML = `<ul class="status-choices">${Object.entries(STATUS_LABELS).map(([k, text]) => `<li>
        <button type="button" role="menuitemradio" aria-checked="${book.status === k}" data-status-choice="${k}">
          <span>${esc(text)}</span>${book.status === k ? icon("check") : ""}</button></li>`).join("")}</ul>
      <p class="muted status-hint">Loft keeps this up to date as you read: Incomplete after 15 days unread, Abandoned after 30.</p>
      <p class="form-error" role="alert" hidden></p>`;
    pop.querySelectorAll("[data-status-choice]").forEach((b) => b.addEventListener("click", async () => {
      try {
        show(await api(`/books/${book.id}/status`, { method: "PUT", body: { status: b.dataset.statusChoice } }));
        close();
        toggle.focus();
        root.dispatchEvent(new CustomEvent("loft:shelves", { detail: { from: "status" } }));
      } catch (e) {
        const error = pop.querySelector(".form-error");
        error.textContent = e.message;
        error.hidden = false;
      }
    }));
  }

  toggle.addEventListener("click", () => {
    if (!pop.hidden) return close();
    draw();
    pop.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    (pop.querySelector('[aria-checked="true"]') || pop.querySelector("button"))?.focus();
  });
  // Want to read ticked or unticked in the Shelves menu changes the status too.
  root.addEventListener("loft:shelves", async (e) => {
    if (e.detail?.from === "status") return;
    try { show(await api(`/books/${book.id}/status`)); } catch { /* the label stays as it was */ }
  });
  root.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });  // root goes with the page
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { close(); toggle.focus(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...pop.querySelectorAll("[data-status-choice]")];
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    e.preventDefault();
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
  });
}
