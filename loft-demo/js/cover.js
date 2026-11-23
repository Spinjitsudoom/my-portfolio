// A book cover drawn as a bound book. When there's no cover image (or it fails to load), a cover
// is generated from the title: the same book always gets the same colours.
import { esc } from "./api.js";

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

export function generatedStyle(title) {
  const h = hash(title || "?");
  const hue = h % 360;
  const sat = 28 + (h >> 9) % 25;
  return `--g1: hsl(${hue} ${sat}% 30%); --g2: hsl(${(hue + 25) % 360} ${sat}% 13%)`;
}

export function coverHTML(book, width = 240, extra = "") {
  const author = (book.authors && book.authors[0]) || "";
  // cover_src: a downloaded book's cover kept on this device, for when the server can't be reached.
  const src = book.cover_src || `/api/books/${book.id}/cover?w=${width}&v=${book.cover_v || 0}`;
  const img = book.has_cover
    ? `<img src="${src}" alt="" loading="lazy" decoding="async"
         onerror="this.remove()">`
    : "";
  return `<div class="book ${extra}" data-book="${book.id ?? ""}" style="${generatedStyle(book.title)}">
    <div class="gen" aria-hidden="true"><span class="gen-title">${esc(book.title)}</span><span class="gen-author">${esc(author)}</span></div>
    ${img}
  </div>`;
}
