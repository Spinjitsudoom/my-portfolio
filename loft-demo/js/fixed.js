// Fixed-layout books (picture books, many children's books): read as pages, like comics, but each
// page is the book's own page (its pictures, fonts and words where the designer put them), sent
// whole and cleaned by the server (src/loft/fixedpage.py) and shown in a sandboxed frame where
// nothing can run. Turning, spreads, scrolling, bookmarks and settings are the comics reader's.
// The admin's page settings come as a plan (outline.fixed.plan): reader page i shows source page
// plan[i][0], or the left (0) or right (1) half of it, or a blank (a negative source page).
import { Reader, registerFixedReader } from "./reader.js";
import { openZoom } from "./zoom.js";
import * as offline from "./offline.js";
import { bookmarkPage, halfBox, pageScale, pageUrl, placeOf, startPage } from "./fixedfit.js";

const NEAR = 4;           // pages either side kept loaded
const KEEP = 3 * NEAR;    // pages further away than this are emptied, to save memory
const TEXTS = 24;         // page documents kept in memory

class FixedReader extends Reader {
  constructor(app, book, file, outline, reading) {
    const plan = outline.fixed.plan || outline.fixed.sizes.map((_, i) => [i, null]);
    super(app, book, file, { ...outline, count: plan.length, sizes: outline.fixed.page_sizes || outline.fixed.sizes, rtl: outline.rtl }, reading);
    this.plan = plan;
    this.texts = new Map();
    this.sizer = new ResizeObserver((entries) => entries.forEach((e) => this.fit(e.target)));
  }

  open(start, progress = null) {
    super.open(progress ? startPage(progress, this.plan) : start);
  }

  close() {
    this.sizer.disconnect();
    super.close();
  }

  destroyBook() {
    if (this.sizer) this.sizer.disconnect();
    super.destroyBook();
  }

  size(i) { return this.m.sizes[i] || [1000, 1500]; }

  entry(i) { return this.plan[i] || [i, null]; }

  // The source page reader page i shows ({size, shiftX}: all of it, or half of it), or null for a blank.
  source(i) {
    const [src, half] = this.entry(i);
    if (src < 0) return null;
    const size = this.m.fixed.sizes[src] || [1000, 1500];
    return { src, size, shiftX: halfBox(size, half).shiftX };
  }

  twoPages() { return this.m.fixed.spread && super.twoPages(); }

  pageInner(i) {
    const [src, half] = this.entry(i);
    if (src < 0) return `<div class="fixed-page fixed-blank" data-page="${i}"></div>`;
    const [w, h] = this.m.fixed.sizes[src] || [1000, 1500];
    return `<div class="fixed-page" data-page="${i}" data-src="${src}" data-half="${half ?? ""}"><iframe sandbox="allow-same-origin" tabindex="-1" scrolling="no"
      title="Page ${i + 1}" style="width:${w}px;height:${h}px"></iframe></div>`;
  }

  // The source page's frame at its own size, scaled so the part shown (all of it, or a half) fills
  // its space, centred in it; the holder clips the other half away.
  fit(holder) {
    const frame = holder.querySelector("iframe");
    if (!frame) return;
    const [src, half] = this.entry(Number(holder.dataset.page));
    const box = halfBox(this.m.fixed.sizes[src] || [1000, 1500], half);
    const s = pageScale([box.width, box.height], [holder.clientWidth, holder.clientHeight]);
    frame.style.transform = `translate(${(holder.clientWidth - box.width * s) / 2 - box.shiftX * s}px, ${(holder.clientHeight - box.height * s) / 2}px) scale(${s})`;
  }

  // A source page's document: from this device for a downloaded book, else from the server.
  text(i) {
    if (this.texts.has(i)) return this.texts.get(i);
    const kept = this.stored ? offline.chapterText(this.book.id, this.file.id, i) : Promise.resolve(null);
    const p = kept.then((t) => t ?? fetch(pageUrl(this.file.id, i, this.m), { credentials: "same-origin" })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`page ${i + 1}: ${r.status}`)))));
    this.texts.set(i, p);
    p.catch(() => this.texts.delete(i));   // try again next time
    while (this.texts.size > TEXTS) this.texts.delete(this.texts.keys().next().value);
    return p;
  }

  // Fill a frame with source page `src` (a blank, src < 0, stays empty).
  async fill(src, frame) {
    if (src < 0) { this.empty(frame); return; }
    const doc = await this.text(src);
    if (frame.dataset.page !== String(src)) { frame.dataset.page = String(src); frame.srcdoc = doc; }
  }

  empty(frame) {
    if (frame.dataset.page) { delete frame.dataset.page; frame.srcdoc = ""; }
  }

  holders() { return [...this.stage.querySelectorAll(".fixed-page")]; }

  loadNear(i) {
    for (const holder of this.holders()) {
      const p = Number(holder.dataset.page);
      const frame = holder.querySelector("iframe");
      if (!frame) continue;  // a blank
      if (!holder.dataset.watched) { holder.dataset.watched = "1"; this.sizer.observe(holder); }
      if (Math.abs(p - i) <= NEAR + 1) this.fill(this.entry(p)[0], frame).catch(() => {});
      else if (Math.abs(p - i) > KEEP) this.empty(frame);
    }
  }

  fillScrollPage(el, i) {
    const holder = el.querySelector(".fixed-page");
    const frame = holder.querySelector("iframe");
    if (frame) {
      if (!holder.dataset.watched) { holder.dataset.watched = "1"; this.sizer.observe(holder); }
      this.fill(this.entry(i)[0], frame).catch(() => {});
    }
    // Far from here: let the frames go (the scroll column has one per page).
    for (const other of this.holders()) {
      const far = other.querySelector("iframe");
      if (far && Math.abs(Number(other.dataset.page) - i) > KEEP) this.empty(far);
    }
  }

  zoom() {
    if (this.zoomView) return;
    this.zoomView = openZoom({
      frame: { size: (i) => this.size(i), source: (i) => this.source(i), fill: (i, frame) => this.fill(this.entry(i)[0], frame) },
      index: this.page, count: this.count, rtl: this.rtl,
      onClose: (i) => { this.zoomView = null; if (i !== this.page) this.goTo(i); },
    });
  }

  progressBody() {
    const page = Math.max(...this.visiblePages());
    return { file_id: this.file.id, page, pages: this.count, locator: placeOf(this.plan, page) };
  }

  tocPage(t) { return t.page ?? t.chapter; }

  // A bookmark names its page of the book (as a place does), so it stays on that page when the admin
  // splits, moves or hides pages. One made by 0.1.6 (no locator) or while the book was read as
  // flowing text (its locator names its chapter) still finds its page (fixedfit.js bookmarkPage).
  bookmarkBody() { return { file_id: this.file.id, page: this.page, locator: placeOf(this.plan, this.page) }; }

  bookmarkPage(b) { return bookmarkPage(b, this.plan); }
}

registerFixedReader(FixedReader);
