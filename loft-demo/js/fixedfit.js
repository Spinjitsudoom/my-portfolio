// Fixed-layout books (fixed.js): where to open one, and how big to draw a page. Kept apart from the
// reader so they can be tested without a browser.

const clamp = (n, count) => Math.max(0, Math.min(count - 1, Math.floor(n) || 0));

/** The reader page to open at, from saved progress, in the book's page plan (plan[i] = [source page,
 *  half or null], a negative source page being a blank). The place names a source page (and, for a
 *  split page, the half), so it holds when pages are split, moved or hidden: a hidden page opens at
 *  the next shown page of the book. Progress saved while the book was read as flowing text names its
 *  chapter (each chapter is a page) or a place out of 1001. */
export function startPage(progress, plan) {
  const count = plan.length;
  if (!progress || count < 1) return 0;
  const locator = progress.locator;
  if (locator && Number.isFinite(locator.chapter)) {
    const chapter = Math.floor(locator.chapter);
    const half = locator.progress >= 0.5 ? 1 : 0;
    let i = plan.findIndex(([src, h]) => src === chapter && (h === null || h === half));
    if (i < 0) i = plan.findIndex(([src]) => src === chapter);
    if (i >= 0) return i;
    let best = -1;   // hidden (or past the end): the shown page that comes next in the book
    plan.forEach(([src], j) => { if (src > chapter && (best < 0 || src < plan[best][0])) best = j; });
    return best >= 0 ? best : count - 1;
  }
  if (progress.pages === count || !(progress.pages > 0)) return clamp(progress.page, count);
  return clamp((progress.page / progress.pages) * count, count);
}

/** Where reader page `page` is, as the server keeps places in books: a chapter (each source page is
 *  one) and how far through it (0.5 for the right half of a split page). A blank is placed at the
 *  page before it, or after it when it comes first. */
export function placeOf(plan, page) {
  const real = (i) => plan[i] && plan[i][0] >= 0;
  let i = page;
  while (i >= 0 && !real(i)) i -= 1;
  if (i < 0) { i = page; while (i < plan.length && !real(i)) i += 1; }
  if (!real(i)) return { chapter: 0, progress: 0 };
  return { chapter: plan[i][0], progress: plan[i][1] === 1 ? 0.5 : 0 };
}

/** The reader page a bookmark is on. A bookmark names its page of the book (its locator, as a place
 *  does); one made by 0.1.6 has none, but its `page` was the book's page (each reader page was one). */
export function bookmarkPage(b, plan) {
  const locator = b.locator && Number.isFinite(b.locator.chapter) ? b.locator : { chapter: b.page, progress: 0 };
  return startPage({ locator }, plan);
}

/** The part of a source page of `size` a reader page shows: all of it, or its left (0) or right (1)
 *  half, shiftX being how far in that half starts. */
export function halfBox([w, h], half) {
  if (half === 0 || half === 1) return { width: w / 2, height: h, shiftX: half === 1 ? w / 2 : 0 };
  return { width: w, height: h, shiftX: 0 };
}

/** How much a page of `size` ([w, h], CSS px) is scaled to fit inside `box` ([w, h]). */
export function pageScale([w, h], [boxW, boxH]) {
  if (!(w > 0 && h > 0) || !(boxW > 0 && boxH > 0)) return 0;
  return Math.min(boxW / w, boxH / h);
}

/** Whether a download suits the book as it's read now. A picture book's download is labelled
 *  layout "fixed" when it holds real pages; one made before Loft read such books as pages (or one
 *  that took old text from the browser's cache) holds text-only chapters and is redone. */
export function downloadFits(kept, outline) {
  if (!kept) return false;
  return (kept.layout === "fixed") === Boolean(outline && outline.fixed);
}

/** Where a chapter (a page, for a picture book) is fetched from. A picture book's pages have their
 *  own address: browsers keep chapters for a week, and one kept from when the book was read as
 *  flowing text must never stand in for a page. */
export function pageUrl(fileId, n, outline) {
  return `/api/files/${fileId}/chapters/${n}?v=${outline.version}${outline.fixed ? "&layout=fixed" : ""}`;
}
