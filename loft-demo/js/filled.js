// Books Loft filled in by itself (admins): what each got and from where, with Undo; and the new
// books it found no sure match for, to do by hand. See autofill.py.
import { api, esc, icon } from "./api.js";
import { ago } from "./admin.js";
import { bookLine } from "./check.js";
import { saved } from "./settings.js";

const NAMES = { title: "title", authors: "author", series: "series", description: "description", tags: "tags",
  publisher: "publisher", published: "date", language: "language", cover: "cover" };

function list(items) {
  const names = items.map((f) => NAMES[f]).filter(Boolean);
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export async function renderFilled(main) {
  const [over, lib] = await Promise.all([api("/autofill"), api("/library")]);
  const on = lib.auto_lookup && lib.online_lookups;

  main.innerHTML = `<section class="page narrow check-page">
    <header class="page-head"><h1>Filled in automatically</h1>
      <p class="muted">${on ? "After each scan, new books missing details are looked up. Only a sure match is used, and only what was missing is filled in."
        : "Switched off in <a href=\"#/admin\">Library settings</a>; nothing new is looked up by itself."}
        ${over.waiting ? ` Looking up ${over.waiting} ${over.waiting === 1 ? "book" : "books"} now.` : ""}</p></header>

    ${on && over.before ? `<section class="panel check-group">
      <h2>Books that were here before</h2>
      <p class="muted">${over.before} ${over.before === 1 ? "book was" : "books were"} in the library before this was on, and ${over.before === 1 ? "is" : "are"} missing details. They can go through the same way.</p>
      <button class="btn btn-small btn-primary" type="button" data-rest>Look ${over.before === 1 ? "it" : "them"} up too</button>
    </section>` : ""}

    <section class="panel check-group">
      <h2>Filled in <span class="count">${over.filled.length}</span></h2>
      ${over.filled.length ? `<p class="muted">Not right? Undo puts the book back as it was (anything you’ve changed since stays).</p>
      <ul class="check-list">${over.filled.map((f) => `<li>
        ${bookLine(f.book, ` · added ${esc(list(f.fields))} from ${esc(f.sources.join(" and "))}, ${esc(ago(f.at))}`)}
        <span class="check-actions">
          <a class="btn btn-small" href="#/book/${f.book.id}?edit=1">${icon("edit")}Edit</a>
          <button class="btn btn-small" type="button" data-undo="${f.book.id}">Undo</button>
        </span></li>`).join("")}</ul>`
        : `<p class="muted">Nothing yet. New books are looked up after each scan.</p>`}
    </section>

    ${over.unsure.length ? `<section class="panel check-group">
      <h2>No sure match <span class="count">${over.unsure.length}</span></h2>
      <p class="muted">Loft found nothing it was sure of, so these weren’t changed. Edit, then Look up details, to pick a match yourself.</p>
      ${on ? `<button class="btn btn-small check-fill" type="button" data-rest>Try them again</button>` : ""}
      <ul class="check-list">${over.unsure.map((b) => `<li>${bookLine(b)}
        <span class="check-actions"><a class="btn btn-small" href="#/book/${b.id}?edit=1">${icon("edit")}Edit</a></span></li>`).join("")}</ul>
    </section>` : ""}
  </section>`;

  main.querySelectorAll("[data-undo]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await api(`/autofill/${b.dataset.undo}/undo`, { method: "POST" });
      saved("Put back as it was");
      renderFilled(main);
    } catch (e) {
      saved(e.message);
      b.disabled = false;
    }
  }));
  main.querySelectorAll("[data-rest]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    const { queued } = await api("/autofill/rest", { method: "POST" }).catch(() => ({ queued: 0 }));
    saved(queued ? `Looking up ${queued} ${queued === 1 ? "book" : "books"}; they’ll show here as they’re done` : "Nothing to look up");
    renderFilled(main);
  }));
}
