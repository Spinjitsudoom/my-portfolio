// Flowing books (EPUB, Kindle, FB2, text): the text is laid out to fit the page at your font, size
// and margins, then turned like paper. Chapters are measured in hidden CSS columns to know how many
// pages each makes; a page shows one column of its chapter. Places are kept as {chapter, progress}
// so changing the text size or the screen keeps you on the same passage.
import { openZoom } from "./zoom.js";
import { Reader, registerFlowReader } from "./reader.js";
import * as offline from "./offline.js";

const FONTS = {
  literata: '"Literata", Georgia, serif',
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif',
  sans: '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
};
const MARGINS = { narrow: 0.06, normal: 0.09, wide: 0.13 };
const NEAR = 3;
const KEEP = NEAR + 3;       // filled pages further than this from where you are are emptied again
const MAX_CHAPTERS = 16;     // chapter texts kept in memory

class Layout {
  constructor(reader, box) {
    this.r = reader;
    this.box = box;
    this.counts = [];
    this.starts = [];
    this.anchors = [];
    this.total = 0;
  }

  key() {
    const b = this.box, r = this.r.reading;
    return `loft-flow:${this.r.file.id}:${this.r.m.version}:${b.textW}x${b.textH}:${r.epub_font}:${b.fontSize}`;
  }

  async measure(onProgress) {
    const n = this.r.m.chapters.length;
    let cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(this.key()) || "null"); } catch { /* private mode */ }
    if (cached && cached.counts && cached.counts.length === n && !cached.partial) {
      this.counts = cached.counts;
      this.anchors = cached.anchors;
    } else {
      const probe = document.createElement("div");
      probe.className = "flow-measure";
      probe.innerHTML = `<div class="flow-text"></div>`;
      document.body.appendChild(probe);
      const text = probe.firstChild;
      this.r.styleText(text, this.box);
      const step = this.box.textW + this.box.gap;
      let lastYield = performance.now();
      try {
        for (let c = 0; c < n; c++) {
          if (this.cancelled) throw new Error("cancelled");
          const html = await this.r.chapter(c);
          if (performance.now() - lastYield > 16) {  // let the page breathe (and the % repaint) on long books
            await new Promise((done) => setTimeout(done, 0));
            lastYield = performance.now();
          }
          text.innerHTML = html;
          const pages = Math.max(1, Math.ceil((text.scrollWidth + this.box.gap - 2) / step));
          const anchors = Object.create(null);
          text.querySelectorAll("[id]").forEach((el) => {
            anchors[el.id] = Math.min(pages - 1, Math.max(0, Math.floor((el.offsetLeft + 1) / step)));
          });
          this.counts.push(pages);
          this.anchors.push(anchors);
          onProgress((c + 1) / n);
        }
      } finally {
        probe.remove();
      }
      try { sessionStorage.setItem(this.key(), JSON.stringify({ counts: this.counts, anchors: this.anchors })); } catch { /* full */ }
    }
    let at = 0;
    this.starts = this.counts.map((count) => { const s = at; at += count; return s; });
    this.total = at;
  }

  where(page) {
    let c = this.starts.length - 1;
    while (c > 0 && this.starts[c] > page) c--;
    return { chapter: c, k: page - this.starts[c] };
  }

  locatorOf(page) {
    const { chapter, k } = this.where(page);
    return { chapter, progress: this.counts[chapter] ? k / this.counts[chapter] : 0 };
  }

  pageOf(loc) {
    if (!loc) return 0;
    const c = Math.min(Math.max(0, loc.chapter), this.counts.length - 1);
    return this.starts[c] + Math.min(this.counts[c] - 1, Math.floor((loc.progress || 0) * this.counts[c] + 1e-6));
  }

  anchorPage(chapter, anchor) {
    const c = Math.min(Math.max(0, chapter), this.counts.length - 1);
    const pages = this.anchors[c];
    return this.starts[c] + ((anchor && Object.prototype.hasOwnProperty.call(pages, anchor) && pages[anchor]) || 0);
  }
}

class FlowReader extends Reader {
  constructor(...args) {
    super(...args);
    this.texts = new Map();
    this.layout = null;
    this.startLocator = null;
  }

  open(start, progress) {
    this.startLocator = progress && progress.locator ? progress.locator : null;
    this.startPage = start;
    super.open(0);
  }

  chapter(c) {
    if (this.texts.has(c)) {
      const hit = this.texts.get(c);
      this.texts.delete(c);  // most recently used last
      this.texts.set(c, hit);
      return hit;
    }
    const url = `/api/files/${this.file.id}/chapters/${c}?v=${this.m.version}`;
    // A downloaded book's chapters come from this device, their pictures too.
    const kept = this.stored ? offline.chapterText(this.book.id, this.file.id, c) : Promise.resolve(null);
    const p = kept.then((text) => text ?? fetch(url, { credentials: "same-origin" }).then((r) => {
      if (!r.ok) throw new Error(`chapter ${c}: ${r.status}`);
      return r.text();
    }));
    // A failed fetch is forgotten, so the next try asks the server again.
    p.catch(() => { if (this.texts.get(c) === p) this.texts.delete(c); });
    this.texts.set(c, p);
    while (this.texts.size > MAX_CHAPTERS) this.texts.delete(this.texts.keys().next().value);
    return p;
  }

  // ---------- page size and type ----------

  pageBox() {
    const W = this.stage.clientWidth, H = this.stage.clientHeight;
    const phone = W < 700;
    const two = this.reading.spread && !phone && W > H * 1.05;
    let pageW, pageH;
    if (phone) { pageW = W; pageH = H; }
    else if (two) { pageH = H; pageW = Math.floor(Math.min(W / 2, H * 0.72)); }
    else { pageH = H; pageW = Math.floor(Math.min(W, H * 0.72)); }
    const mx = Math.round(pageW * (MARGINS[this.reading.epub_margins] || MARGINS.normal));
    const my = Math.round(pageH * 0.07);
    const fontSize = Math.round((phone ? 17 : 18) * (this.reading.epub_size || 100) / 100 * 10) / 10;
    return { two, pageW, pageH, mx, my, textW: pageW - 2 * mx, textH: pageH - 2 * my - 14, gap: 2 * mx, fontSize };
  }

  styleText(el, box) {
    el.style.width = `${box.textW}px`;
    el.style.height = `${box.textH}px`;
    el.style.columnWidth = `${box.textW}px`;
    el.style.columnGap = `${box.gap}px`;
    el.style.fontFamily = FONTS[this.reading.epub_font] || FONTS.literata;
    el.style.fontSize = `${box.fontSize}px`;
    el.style.setProperty("--text-h", `${box.textH}px`);
  }

  // ---------- building ----------

  async build() {
    try {
      await this.buildInner();
    } catch (e) {
      if (!this.root.isConnected || (e && e.message === "cancelled")) return;
      this.stage.innerHTML = `<div class="reader-message"><div><p>This book couldn’t be laid out just now.</p>
        <button class="btn" type="button" data-retry>Try again</button></div></div>`;
      this.stage.querySelector("[data-retry]").addEventListener("click", () => this.build());
    }
  }

  close() {
    if (this.measuring) this.measuring.cancelled = true;
    this.buildToken = (this.buildToken || 0) + 1;
    super.close();
  }

  currentLocator() {
    if (this.wasScroll && this.scrollLoc) return this.scrollLoc;
    if (this.layout) return this.layout.locatorOf(this.page);
    return this.startLocator;
  }

  async buildInner() {
    const keep = this.currentLocator();
    const keepPage = this.layout || this.wasScroll ? null : this.startPage;
    if (this.measuring) this.measuring.cancelled = true;
    this.destroyBook();
    this.filled = new Set();
    this.wasScroll = this.reading.mode === "scroll";
    if (this.wasScroll) return this.buildFlowScroll(keep);
    const box = this.pageBox();
    this.box = box;
    this.spread = box.two;
    const note = document.createElement("p");
    note.className = "reader-loading";
    note.textContent = "Laying out the book…";
    this.stage.appendChild(note);
    await (document.fonts ? document.fonts.ready : Promise.resolve());
    const layout = new Layout(this, box);
    this.measuring = layout;
    const token = (this.buildToken = (this.buildToken || 0) + 1);
    await layout.measure((f) => { note.textContent = `Laying out the book… ${Math.round(f * 100)}%`; });
    if (token !== this.buildToken || !this.root.isConnected) return;
    this.measuring = null;
    note.remove();
    this.layout = layout;
    this.count = layout.total;
    const scrubber = this.root.querySelector(".scrubber");
    scrubber.max = Math.max(0, this.count - 1);

    const holder = document.createElement("div");
    holder.className = "flip-book flow-book";
    holder.style.width = `${box.two ? box.pageW * 2 : box.pageW}px`;
    holder.style.height = `${box.pageH}px`;
    holder.style.margin = "0 auto";
    holder.innerHTML = Array.from({ length: this.count }, (_, i) =>
      `<div class="leaf flow-leaf" data-density="soft"><div class="flow-page" style="left:${box.mx}px;top:${box.my}px;width:${box.textW}px;height:${box.textH}px"></div><span class="folio">${i + 1}</span></div>`).join("");
    this.stage.appendChild(holder);
    this.flip = new St.PageFlip(holder, {
      width: box.pageW, height: box.pageH, size: "fixed", usePortrait: true, showCover: false,
      drawShadow: true, maxShadowOpacity: 0.35, mobileScrollSupport: false, disableFlipByClick: true,
      showPageCorners: true, flippingTime: { gentle: 1000, normal: 700, quick: 420, off: 1 }[this.reading.turn_speed] || 700,
    });
    this.flip.loadFromHTML(holder.querySelectorAll(".leaf"));
    this.flip.on("flip", (e) => this.onPage(e.data));
    const target = keep ? layout.pageOf(keep) : Math.min(keepPage || 0, this.count - 1);
    this.goTo(target, false);
  }

  loadNear(i) {
    if (!this.flip || !this.layout) return;
    const leaves = this.stage.querySelectorAll(".flow-leaf .flow-page");
    const step = this.box.textW + this.box.gap;
    for (const j of [...this.filled]) {
      if (Math.abs(j - i) > KEEP && leaves[j]) {
        leaves[j].replaceChildren();
        delete leaves[j].dataset.filled;
        this.filled.delete(j);
      }
    }
    for (let j = Math.max(0, i - NEAR); j <= Math.min(this.count - 1, i + NEAR + 1); j++) {
      const page = leaves[j];
      if (!page || page.dataset.filled) continue;
      page.dataset.filled = "1";
      this.filled.add(j);
      const { chapter, k } = this.layout.where(j);
      this.chapter(chapter).then((html) => {
        if (!page.dataset.filled) return;  // emptied again before it arrived
        const text = document.createElement("div");
        text.className = "flow-text";
        this.styleText(text, this.box);
        text.style.transform = `translateX(${-k * step}px)`;
        text.innerHTML = html;
        page.replaceChildren(text);
      }).catch(() => {
        delete page.dataset.filled;  // try again next time this page comes near
        this.filled.delete(j);
      });
    }
  }

  visiblePages() {
    if (this.flip && this.flip.getOrientation() === "landscape") {
      const left = this.page - (this.page % 2);
      return [left, left + 1].filter((p) => p < this.count);
    }
    return [this.page];
  }

  rescaleSpread() {
    if (this.reading.mode !== "pages" || !this.box) return false;
    const now = this.pageBox();
    return Math.abs(now.pageW - this.box.pageW) > 2 || Math.abs(now.pageH - this.box.pageH) > 2 || now.two !== this.box.two;
  }

  relayoutFor(key) { return ["mode", "spread", "epub_font", "epub_size", "epub_margins"].includes(key); }

  // ---------- scrolling instead of pages ----------

  async buildFlowScroll(keep) {
    this.layout = null;
    const col = document.createElement("div");
    col.className = "scroll-book flow-scroll";
    col.style.fontFamily = FONTS[this.reading.epub_font] || FONTS.literata;
    col.style.fontSize = `${Math.round(18 * (this.reading.epub_size || 100)) / 100}px`;
    const n = this.m.chapters.length;
    col.innerHTML = Array.from({ length: n }, (_, c) => `<section class="flow-chapter" data-c="${c}"><p class="reader-loading-inline">…</p></section>`).join("");
    this.stage.appendChild(col);
    this.scroller = col;
    this.count = n;
    this.root.querySelector(".scrubber").max = Math.max(0, n - 1);
    const sections = [...col.querySelectorAll(".flow-chapter")];
    const token = (this.buildToken = (this.buildToken || 0) + 1);
    for (let c = 0; c < n; c++) {
      const html = await this.chapter(c);
      if (token !== this.buildToken || !col.isConnected) return;  // a newer build or the reader closed
      sections[c].innerHTML = html;
    }
    const target = keep || { chapter: 0, progress: 0 };
    const sec = sections[Math.min(target.chapter, n - 1)];
    this.quiet = true;
    // The place is the line in the middle of the screen: put it back there.
    col.scrollTop = sec.offsetTop + target.progress * sec.offsetHeight - col.clientHeight / 2;
    setTimeout(() => { this.quiet = false; }, 400);
    this.onScroll = () => {
      if (!col.isConnected) return;
      const mid = col.scrollTop + col.clientHeight / 2;
      const s = sections.find((el) => el.offsetTop + el.offsetHeight > mid) || sections[n - 1];
      const height = Math.max(1, s.offsetHeight);
      this.scrollLoc = { chapter: Number(s.dataset.c), progress: Math.min(1, Math.max(0, (mid - s.offsetTop) / height)) };
      this.atEnd = col.scrollTop + col.clientHeight >= col.scrollHeight - 4;
      this.onPage(this.scrollLoc.chapter);
    };
    col.addEventListener("scroll", this.onScroll, { passive: true });
    this.onScroll();
  }

  onPage(i, save = true) {
    super.onPage(i, save);
    if (this.reading.mode === "scroll") {
      const t = this.m.chapters[i] && this.m.chapters[i].title;
      this.root.querySelector(".reader-where").textContent = t || `Chapter ${i + 1} of ${this.m.chapters.length}`;
    }
  }

  goTo(i, save = true) {
    if (this.reading.mode === "scroll" && this.scroller) {
      const sec = this.scroller.querySelector(`[data-c="${i}"]`);
      if (sec) this.scroller.scrollTop = sec.offsetTop - 16;
      return;
    }
    super.goTo(i, save);
  }

  // ---------- saving and bookmarks ----------

  progressBody() {
    if (this.reading.mode === "scroll" || !this.layout) {
      const loc = this.scrollLoc || { chapter: 0, progress: 0 };
      const n = this.m.chapters.length;
      // Scrolled to the very bottom of the book counts as finished.
      const page = this.atEnd ? 1000 : Math.min(999, Math.round(((loc.chapter + loc.progress) / n) * 1000));
      return { file_id: this.file.id, page, pages: 1001, locator: loc };
    }
    return { file_id: this.file.id, page: Math.max(...this.visiblePages()), pages: this.count,
             locator: this.layout.locatorOf(this.page) };
  }

  bookmarkBody() {
    const body = this.progressBody();
    return { file_id: this.file.id, page: this.layout ? this.page : body.page, locator: body.locator };
  }

  bookmarkPage(b) {
    if (this.layout && b.locator) return this.layout.pageOf(b.locator);
    if (!this.layout && b.locator) return b.locator.chapter;
    return b.page;
  }

  tocEntries() {
    return this.m.toc.length ? this.m.toc
      : this.m.chapters.map((c, i) => ({ title: c.title || `Chapter ${i + 1}`, chapter: i, anchor: "", level: 0 }));
  }

  tocPage(t) { return this.layout ? this.layout.anchorPage(t.chapter, t.anchor) : t.chapter; }

  goToEntry(t) { this.goToPlace(t.chapter, t.anchor); }

  goToPlace(chapter, anchor) {
    if (this.layout) return this.goTo(this.layout.anchorPage(chapter, anchor));
    if (!this.scroller) return;
    const sec = this.scroller.querySelector(`[data-c="${chapter}"]`);
    if (!sec) return;
    const target = anchor ? sec.querySelector(`[id="${CSS.escape(anchor)}"]`) : null;
    const top = (target || sec).getBoundingClientRect().top - this.scroller.getBoundingClientRect().top;
    this.scroller.scrollTop += top - 16;
  }

  // ---------- taps on links and pictures ----------

  handleTap(e) {
    const link = e.target.closest && e.target.closest("a");
    if (link) {
      if (link.dataset.chapter !== undefined) {
        e.preventDefault();
        this.goToPlace(Number(link.dataset.chapter), link.dataset.anchor);
      }
      return true;  // external links open in a new tab by themselves
    }
    const img = e.target.closest && e.target.closest(".flow-text img, .flow-chapter img");
    if (img) {
      this.zoomView = openZoom({ src: () => img.src, index: 0, count: 1, onClose: () => { this.zoomView = null; } });
      return true;
    }
    return false;
  }

  zoom() {}  // text gets bigger with the text size setting, not by zooming

  wire() {
    super.wire();
    // Links inside pages are handled on tap; stop the browser following "#".
    this.on(this.stage, "click", (e) => { if (e.target.closest && e.target.closest("a[data-chapter]")) e.preventDefault(); });
  }

  // ---------- text settings ----------

  extraPrefs() {
    const r = this.reading;
    const seg = (key, options) => `<div class="segmented" role="radiogroup">${options.map(([v, label]) =>
      `<button type="button" role="radio" aria-checked="${r[key] === v}" data-set="${key}" data-value="${v}">${label}</button>`).join("")}</div>`;
    return `
      <h3>Font</h3>
      ${seg("epub_font", [["literata", "Literata"], ["serif", "Serif"], ["sans", "Sans"]])}
      <h3>Text size</h3>
      <div class="segmented size-steps">
        <button type="button" data-size="-10" aria-label="Smaller text" ${r.epub_size <= 80 ? "disabled" : ""}>A−</button>
        <span class="size-now">${r.epub_size}%</span>
        <button type="button" data-size="10" aria-label="Bigger text" ${r.epub_size >= 160 ? "disabled" : ""}>A+</button>
      </div>
      <h3>Margins</h3>
      ${seg("epub_margins", [["narrow", "Narrow"], ["normal", "Normal"], ["wide", "Wide"]])}`;
  }

  wireExtraPrefs(panel) {
    panel.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", () => {
      const next = Math.min(160, Math.max(80, (this.reading.epub_size || 100) + Number(b.dataset.size)));
      this.setPref("epub_size", next, panel);
    }));
  }
}

registerFlowReader(FlowReader);
