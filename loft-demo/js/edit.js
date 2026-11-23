// A book's details as fields: used in place on the book page (admin) and on each card when adding books.
// Also the online lookup picker both of them use (Google Books with a key, Open Library, AniList for comics).
import { api, authorLine, esc } from "./api.js";
import { seriesFromTitle } from "./titles.js";

// "it" → "Italian", in the reader's own language.
function languageName(code) {
  if (!code) return "";
  try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(code) || code; } catch { return code; }
}

export const FIELD_LABELS = {
  title: "Title", authors: "Author", series: "Series", series_index: "Number", description: "Description",
  publisher: "Publisher", published: "Published", language: "Language", tags: "Tags",
};

const list = (v) => (v || []).join(", ");
const split = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);

function field(name, value, { label = FIELD_LABELS[name], hint = "", cls = "", input = "", required = false } = {}) {
  return `<label class="field field-${name} ${cls}">
    <span class="field-label">${label}${required ? ` <span class="needed">needed</span>` : ""}</span>
    ${input || `<input name="${name}" value="${esc(value ?? "")}" autocomplete="off" spellcheck="${name === "description"}">`}
    ${hint ? `<span class="field-hint">${hint}</span>` : ""}
    <span class="field-error" role="alert" hidden></span>
  </label>`;
}

// The fields for a book's details. `required` marks title and author as needed (adding books).
export function detailFields(d, { required = false } = {}) {
  const index = d.series_index == null ? "" : String(d.series_index).replace(/\.0$/, "");
  return `
    ${field("title", d.title, { cls: "field-big", required })}
    ${field("authors", list(d.authors), { label: "Author", hint: "Separate several with commas", required })}
    <div class="field-row">
      ${field("series", d.series, { cls: "grow" })}
      ${field("series_index", index, { cls: "narrow", input: `<input name="series_index" value="${esc(index)}" inputmode="decimal" autocomplete="off">` })}
    </div>
    ${field("description", d.description, { input: `<textarea name="description" rows="7">${esc(d.description || "")}</textarea>` })}
    <div class="field-row field-row-3">
      ${field("publisher", d.publisher)}
      ${field("published", d.published, { hint: "A year, or a full date" })}
      ${field("language", d.language)}
    </div>
    ${field("tags", list(d.tags), { hint: "Separate with commas" })}`;
}

export function readDetails(form) {
  const v = (n) => form.elements[n].value.trim();
  const index = v("series_index").replace(",", ".");
  return {
    title: v("title"), authors: split(v("authors")), series: v("series"),
    series_index: index === "" ? null : (Number.isFinite(Number(index)) ? Number(index) : index),
    description: form.elements.description.value, publisher: v("publisher"), published: v("published"),
    language: v("language"), tags: split(v("tags")),
  };
}

export function clearErrors(form) {
  form.querySelectorAll(".field-error").forEach((e) => { e.hidden = true; e.textContent = ""; });
  form.querySelectorAll(".field.has-error").forEach((e) => e.classList.remove("has-error"));
}

// Put the server's message under the field it names ("published must be …"); else return it for the caller.
export function showError(form, message) {
  const m = /^(\w+)\b[: ]?/.exec(message);
  let name = m && FIELD_LABELS[m[1]] ? m[1] : null;
  if (!name && /title and at least one author/.test(message)) {
    name = form.elements.title.value.trim() ? "authors" : "title";
  }
  const box = name && form.querySelector(`.field-${name}`);
  if (!box) return message;
  box.classList.add("has-error");
  const err = box.querySelector(".field-error");
  err.textContent = message.replace(/^(\w+)/, (k) => FIELD_LABELS[k] || k);  // "published must…" → "Published must…"
  err.hidden = false;
  box.querySelector("input, textarea").focus();
  return null;
}

// Matches for a title/author/ISBN, shown in `box`. onPick(candidate) when one is chosen.
// `comic` (a book shown page by page) asks AniList as well as Open Library.
export async function showLookup(box, { title = "", author = "", isbn = "", comic = false }, onPick, { covers = false } = {}) {
  box.hidden = false;
  box.innerHTML = `<p class="lookup-note">Looking it up…</p>`;
  // Editions in your language (and with a description) come first.
  const q = new URLSearchParams({ title, author, isbn, comic, lang: navigator.language || "" });
  let found;
  try {
    found = await api(`/lookup?${q}`);
  } catch (e) {
    box.innerHTML = `<p class="lookup-note">${esc(e.message)}</p>`;
    return;
  }
  if (covers) found = found.filter((c) => c.cover_url);
  if (!found.length) {
    box.innerHTML = `<p class="lookup-note">${covers ? "No cover for this one online. Upload a picture instead."
      : "Nothing online knows this one. Fill the details in by hand."}</p>`;
    return;
  }
  box.innerHTML = covers
    ? `<p class="lookup-note">Pick a cover</p><ul class="cover-picks">${found.map((c, i) => `<li><button type="button" data-pick="${i}" aria-label="${esc(c.title)}${c.published ? `, ${esc(c.published)}` : ""}, from ${esc(c.source)}">
        <img src="${esc(c.thumb_url || c.cover_url.replace("-L.jpg", "-M.jpg"))}" alt="" loading="lazy" onerror="this.closest('li').remove()"></button></li>`).join("")}</ul>`
    : `<p class="lookup-note">Pick the one that matches. Only empty fields are filled.</p><ul class="lookup-list">${found.map((c, i) => `<li><button type="button" data-pick="${i}">
        <span class="lookup-cover">${c.cover_url ? `<img src="${esc(c.thumb_url || c.cover_url.replace("-L.jpg", "-S.jpg"))}" alt="" loading="lazy" onerror="this.remove()">` : ""}</span>
        <span class="lookup-text"><strong>${esc(c.title)}</strong><span>${esc(authorLine(c.authors))}${c.series ? ` · ${esc(c.series)}${c.series_index != null ? ` #${esc(String(c.series_index).replace(/\.0$/, ""))}` : ""}` : ""}${c.published ? ` · ${esc(c.published)}` : ""}${c.language ? ` · ${esc(languageName(c.language))}` : ""}</span><span class="lookup-source">From ${esc(c.source)}${c.source !== "Open Library" && !c.description ? " · no description" : ""}</span></span>
      </button></li>`).join("")}</ul>`;
  box.querySelectorAll("[data-pick]").forEach((b) => b.addEventListener("click", () => onPick(found[Number(b.dataset.pick)])));
}

// Fill only the empty fields from a candidate; its description comes with it (AniList) or is fetched (Open Library).
export async function fillEmpty(form, c) {
  const set = (name, value) => {
    const el = form.elements[name];
    if (el && !el.value.trim() && value) el.value = value;
  };
  set("title", c.title);
  set("authors", list(c.authors));
  set("publisher", c.publisher);
  set("published", c.published);
  set("language", c.language);
  set("tags", list(c.tags));
  // No series yet: the match's own (Hardcover knows them), else read from the title
  // ("#04 Assassin's Creed - Revelations"), or the match's.
  const s = c.series ? { series: c.series, index: c.series_index ?? "" }
    : seriesFromTitle(form.elements.title.value) || seriesFromTitle(c.title);
  if (s) { set("series", s.series); set("series_index", String(s.index)); }
  set("description", c.description);
  if (!form.elements.description.value.trim() && c.key) {
    try {
      const { description } = await api(`/lookup/description?key=${encodeURIComponent(c.key)}`);
      set("description", description);
    } catch { /* a missing blurb isn't worth an error */ }
  }
}
