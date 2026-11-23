// The library check (admin): what needs attention, grouped, each with the fix one tap away.
import { api, authorLine, esc, icon } from "./api.js";
import { coverHTML } from "./cover.js";
import { saved } from "./settings.js";

const GROUPS = {
  damaged: ["Files that won’t open", "These files are damaged. Download one to check it, or replace it in the books folder."],
  protected: ["Protected books", "These have copy protection (DRM), so Loft can’t open them. They can still be downloaded."],
  unreachable_folder: ["Folders Loft can’t reach", "Their books stay as they were until the folder is back. Is the share mounted?"],
  unreadable_folder: ["Folders Loft isn’t allowed to read", "Books inside them stay as they were. Check the folder’s permissions."],
  calibre_missing: ["Files Calibre lists that aren’t there", "Calibre’s library mentions these files, but they’re missing from the folder."],
  no_cover: ["No cover", "Loft draws a cover from the title; find a real one or upload a picture."],
  no_author: ["No author", "Add who wrote them, so they shelve and search properly."],
  no_tags: ["No tags", "Tags put a book in a section of the stacks; without any it stands in Other. Edit, then Look up details, or add a few by hand."],
  filename_title: ["Titles taken from the file name", "These files had no title of their own. Check they read right."],
  duplicate: ["Possibly the same book twice", "Same title and author. Make them one book (both files are kept), or keep both."],
  series_gap: ["Gaps in a series", "Numbers missing from a series you have."],
};

export function bookLine(b, extra = "") {
  return `<a class="check-book" href="#/book/${b.id}">
    <span class="check-cover">${coverHTML(b, 240)}</span>
    <span class="check-text"><strong>${esc(b.title)}</strong><span class="muted">${esc(authorLine(b.authors)) || "No author"}${extra}</span></span>
  </a>`;
}

const ignoreBtn = (item) => `<button class="btn btn-small" type="button" data-ignore="${esc(item.kind)}" data-key="${esc(item.key)}">Ignore</button>`;

function itemHTML(item) {
  const k = item.kind;
  if (k === "damaged" || k === "protected") {
    return `<li>${bookLine(item.book, ` · ${esc(item.format.toUpperCase())}`)}
      <span class="check-actions"><a class="btn btn-small" href="/api/files/${item.file_id}" download>${icon("download")}Download</a>${ignoreBtn(item)}</span></li>`;
  }
  if (k.endsWith("_folder") || k === "calibre_missing") {
    return `<li><code class="check-path">${esc(item.path)}</code>
      <span class="check-actions">${k === "calibre_missing" ? "" : `<a class="btn btn-small" href="#/admin">Library settings</a>`}${ignoreBtn(item)}</span></li>`;
  }
  if (k === "duplicate") {
    return `<li class="check-dup">${item.books.map((b) => `<div class="dup-row">${bookLine(b)}
        <button class="btn btn-small" type="button" data-merge="${b.id}" data-others="${item.books.filter((x) => x.id !== b.id).map((x) => x.id).join(",")}">Keep this one</button></div>`).join("")}
      <span class="check-actions">${ignoreBtn(item).replace("Ignore", "Keep both")}</span></li>`;
  }
  if (k === "series_gap") {
    const missing = item.missing.map((n) => `#${n}`).join(", ");
    return `<li><a class="check-book" href="#/all?kind=series&value=${encodeURIComponent(item.series)}&title=${encodeURIComponent(item.series)}">
        <span class="check-text"><strong>${esc(item.series)}</strong><span class="muted">${item.books.length} books · missing ${missing}</span></span></a>
      <span class="check-actions">${item.missing.slice(0, 3).map((n) => `<button class="btn btn-small" type="button" data-ask-for="${esc(`${item.series} #${n}`)}">Ask for #${n}</button>`).join("")}${ignoreBtn(item)}</span></li>`;
  }
  const fix = k === "no_cover" ? `<a class="btn btn-small" href="#/book/${item.book.id}?edit=cover">Find a cover</a>`
    : `<a class="btn btn-small" href="#/book/${item.book.id}?edit=1">${icon("edit")}Edit</a>`;
  return `<li>${bookLine(item.book)}<span class="check-actions">${fix}${ignoreBtn(item)}</span></li>`;
}

export async function renderCheck(main) {
  const result = await api("/check");
  const groups = {};
  for (const item of result.items) (groups[item.kind] ||= []).push(item);

  main.innerHTML = `<section class="page narrow check-page">
    <header class="page-head"><h1>Library check</h1>
      <p class="muted">${result.items.length ? `${result.items.length} ${result.items.length === 1 ? "thing needs" : "things need"} attention.` : "Nothing needs attention."}
        ${result.ignored ? `<button class="link-btn" type="button" data-show-ignored>${result.ignored} ignored</button>` : ""}</p></header>
    ${Object.keys(GROUPS).filter((k) => groups[k]).map((k) => `<section class="panel check-group">
      <h2>${GROUPS[k][0]} <span class="count">${groups[k].length}</span></h2>
      <p class="muted">${GROUPS[k][1]}</p>
      ${k === "no_tags" || k === "no_cover" ? `<a class="btn btn-small btn-primary check-fill" href="#/fill?kind=${k}">Look them up one by one</a>` : ""}
      <ul class="check-list">${groups[k].map(itemHTML).join("")}</ul>
    </section>`).join("")}
    <section class="panel" data-ignored hidden></section>
  </section>`;

  // A gap in a series becomes a request: everyone who wants it can vote, and is told when it's added.
  main.querySelectorAll("[data-ask-for]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await api("/requests", { method: "POST", body: { title: b.dataset.askFor, note: "Missing from the series" } });
      b.textContent = "Asked";
      saved(`Asked for ${b.dataset.askFor}: it’s in Requests`);
    } catch (e) {
      saved(e.message);
      b.disabled = false;
    }
  }));
  main.querySelectorAll("[data-ignore]").forEach((b) => b.addEventListener("click", async () => {
    await api("/check/ignored", { method: "POST", body: { kind: b.dataset.ignore, key: b.dataset.key } });
    renderCheck(main);
  }));
  main.querySelectorAll("[data-merge]").forEach((b) => b.addEventListener("click", async () => {
    const into = Number(b.dataset.merge);
    if (!confirm("Make these one book? Its files, everyone’s progress and shelf places all move to the one you keep.")) return;
    try {
      for (const other of b.dataset.others.split(",").map(Number)) {
        await api(`/books/${into}/merge`, { method: "POST", body: { other } });
      }
      saved("Made into one book");
      renderCheck(main);
    } catch (e) { saved(e.message); }
  }));
  main.querySelector("[data-show-ignored]")?.addEventListener("click", async () => {
    const box = main.querySelector("[data-ignored]");
    const ignored = await api("/check/ignored");
    box.hidden = false;
    box.innerHTML = `<h2>Ignored</h2><ul class="check-list">${ignored.map((i) => `<li>
      <span class="check-text"><strong>${esc(GROUPS[i.kind]?.[0] || i.kind)}</strong><span class="muted">${esc(i.label || i.key)}</span></span>
      <span class="check-actions"><button class="btn btn-small" type="button" data-unignore="${esc(i.kind)}" data-key="${esc(i.key)}">Bring back</button></span></li>`).join("")}</ul>`;
    box.querySelectorAll("[data-unignore]").forEach((b) => b.addEventListener("click", async () => {
      await api("/check/ignored", { method: "DELETE", body: { kind: b.dataset.unignore, key: b.dataset.key } });
      renderCheck(main);
    }));
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
