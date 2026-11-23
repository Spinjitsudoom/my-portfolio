// The reader: a book whose pages curl like paper (StPageFlip), or a scrolling column of pages.
// Pages are images from the server; only the ones near where you are get loaded.
import { api, esc, icon } from "./api.js";
import { openZoom } from "./zoom.js";
import * as offline from "./offline.js";
import { wireDiscussion } from "./discussion.js";
import { loadPrefs, patchPrefs } from "./prefs.js";
import { downloadFits } from "./fixedfit.js";

let FlowReaderClass = null;  // set by flow.js (it extends Reader)
export function registerFlowReader(cls) { FlowReaderClass = cls; }
let FixedReaderClass = null;  // set by fixed.js: fixed-layout books, read as pages
export function registerFixedReader(cls) { FixedReaderClass = cls; }

const WIDTHS = [600, 900, 1200, 1800, 2400];
const SPEEDS = { gentle: 1000, normal: 700, quick: 420, off: 1 };

const NEAR = 4;
const SAVE_AFTER = 1500;

function retryOnce() {
  if (this.dataset.retried) return;
  this.dataset.retried = "1";
  const url = this.getAttribute("src");
  setTimeout(() => { if (this.getAttribute("src") === url) this.src = `${url}&retry=1`; }, 1500);
}

const snap = (px) => WIDTHS.find((w) => w >= px) || WIDTHS[WIDTHS.length - 1];

function commonRatio(sizes) {
  const counts = new Map();
  for (const [w, h] of sizes) {
    const r = Math.round((w / h) * 100) / 100;
    counts.set(r, (counts.get(r) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function unreadableCard(app, book, message) {
  const file = book.files[0];
  app.innerHTML = `<main class="reader-message"><div>
    <h1>${esc(book.title)}</h1>
    <p>${esc(message)}</p>
    <div class="hero-actions">
      <a class="btn" href="#/book/${book.id}">Back to the book</a>
      ${file ? `<a class="btn btn-primary" href="/api/files/${file.id}" download>${icon("download")}Download</a>` : ""}
    </div></div></main>`;
}

export async function renderReader(app, bookId, params, isCurrent = () => true) {
  app.innerHTML = `<div class="reader" data-theme="dark"><p class="reader-loading">Opening the book…</p></div>`;
  const stale = () => !isCurrent();
  const kept = await offline.record(bookId);
  let book;
  try {
    book = await api(`/books/${bookId}`);
    // A book that had stopped (Incomplete, Abandoned) is Reading again once it's opened (statuses.py).
    if (book.status === "incomplete" || book.status === "abandoned") api(`/books/${bookId}/opened`, { method: "POST" }).catch(() => {});
  } catch (e) {
    if (!offline.unreachable(e) || !kept || !kept.complete) throw e;
    offline.setOffline(true);
    book = kept.book;
  }
  if (stale()) return () => {};
  const wanted = (offline.isOffline() && kept && kept.fileId) || Number(params.get("file")) || (book.progress && book.progress.file_id);
  const file = book.files.find((f) => f.id === wanted && f.readable)
    || book.files.find((f) => f.readable === "pages") || book.files.find((f) => f.readable);
  if (!file) {
    if (stale()) return () => {};
    unreadableCard(app, book, "This kind of book can’t be read here yet; download it instead.");
    return () => {};
  }
  const flowing = file.readable === "flow";
  let manifest;
  try {
    manifest = await api(flowing ? `/files/${file.id}/flow` : `/files/${file.id}/manifest`);
  } catch (e) {
    if (offline.unreachable(e) && kept && kept.complete && kept.fileId === file.id) {
      offline.setOffline(true);
      manifest = kept.manifest;
    } else {
      if (!stale()) unreadableCard(app, book, e.message);
      return () => {};
    }
  }
  // A downloaded book reads from this device (quicker, and the same with no connection), unless
  // it has changed on the server since it was downloaded.
  const stored = kept && kept.complete && kept.fileId === file.id && kept.version === manifest.version
    && downloadFits(kept, manifest) ? kept : null;
  const prefs = await loadPrefs();
  if (stale()) return () => {};
  const Cls = flowing ? (manifest.fixed && FixedReaderClass ? FixedReaderClass : FlowReaderClass) : Reader;
  const r = new Cls(app, book, file, manifest, prefs.reading);
  r.stored = stored;
  if (stored && manifest.fixed) offline.keepOutline(book.id, manifest);  // new page settings, same pages
  if (stored && !flowing) r.storedPages = await offline.pageUrls(book.id, file.id, manifest.version);
  if (stale()) return () => {};
  const fromLink = params.get("page");
  const progress = book.progress && book.progress.file_id === file.id ? book.progress : null;
  r.open(fromLink !== null ? Number(fromLink) : progress ? progress.page : 0, fromLink !== null ? null : progress);
  return () => r.close();
}

export class Reader {
  constructor(app, book, file, manifest, reading) {
    this.app = app;
    this.book = book;
    this.file = file;
    this.m = manifest;
    this.count = manifest.count || 0;
    this.reading = { ...reading };
    this.ratio = manifest.sizes ? commonRatio(manifest.sizes) : 0.7;
    this.page = 0;
    this.flip = null;
    this.bookmarks = [];
    this.saveTimer = null;
    this.listeners = [];
    this.dirty = false;   // read past a page since the last save
    this.pageAt = 0;      // when that happened (seconds)
    this.quiet = false;   // moving the book ourselves (opening it), not the reader turning pages
    this.zoomView = null;
    // Manga read right to left. The page-curl book only turns one way, so its pages are laid out
    // last to first and it opens at the far end; turning "back" through them reads forwards.
    this.rtl = Boolean(manifest.rtl);
    this.leaves = this.count + (this.rtl && this.count % 2 ? 1 : 0);  // a blank keeps the cover on its own
  }

  leafOf(page) { return this.rtl ? this.leaves - 1 - page : page; }
  pageOf(leaf) { return this.rtl ? Math.min(this.count - 1, this.leaves - 1 - leaf) : leaf; }

  src(i, cssWidth) {
    if (this.storedPages && this.storedPages[i]) return this.storedPages[i];
    return `/api/files/${this.file.id}/pages/${i}?w=${snap(cssWidth * (devicePixelRatio || 1))}&v=${this.m.version}`;
  }

  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.listeners.push(() => target.removeEventListener(type, fn, opts));
  }

  open(start, _progress = null) {
    this.page = Math.max(0, Math.min(Math.max(0, this.count - 1), start || 0));
    this.app.innerHTML = `<div class="reader" data-theme="${this.reading.theme}">
      <div class="reader-stage" aria-label="${esc(this.book.title)}"></div>
      <header class="reader-top">
        <a class="icon-btn" href="#/book/${this.book.id}" aria-label="Back to the book">${icon("left")}</a>
        <h1 class="reader-title">${esc(this.book.title)}</h1>
        <button class="icon-btn" type="button" data-panel="contents" aria-label="Contents and bookmarks">${icon("list")}</button>
        <button class="icon-btn" type="button" data-bookmark aria-label="Bookmark this page" aria-pressed="false">${icon("bookmark")}</button>
        <button class="icon-btn" type="button" data-panel="talk" aria-label="Discussion">${icon("chat")}</button>
        <button class="icon-btn" type="button" data-panel="prefs" aria-label="Reading settings">${icon("type")}</button>
      </header>
      <footer class="reader-bottom">
        <input class="scrubber" type="range" min="0" max="${Math.max(0, this.count - 1)}" value="${this.page}" aria-label="Go to page"${this.rtl ? ` dir="rtl"` : ""}>
        <span class="reader-where"></span>
      </footer>
      <aside class="reader-panel" data-for="contents" hidden></aside>
      <aside class="reader-panel" data-for="prefs" hidden></aside>
      <aside class="reader-panel reader-talk" data-for="talk" hidden><h2>Discussion</h2><div data-talk></div></aside>
    </div>`;
    this.root = this.app.querySelector(".reader");
    this.stage = this.root.querySelector(".reader-stage");
    this.wire();
    this.build();
    this.loadBookmarks();
    this.showControls(true);
    this.hideTimer = setTimeout(() => this.showControls(false), 2200);
  }

  close() {
    if (this.zoomView) { this.zoomView.close(true); this.zoomView = null; }
    if (this.talkStop) this.talkStop();
    this.saveNow(true);
    clearTimeout(this.saveTimer);
    clearTimeout(this.hideTimer);
    this.listeners.forEach((off) => off());
    this.destroyBook();
  }

  // ---------- building the book ----------

  build() {
    this.destroyBook();
    if (this.reading.mode === "scroll") this.buildScroll();
    else this.buildPages();
    this.goTo(this.page, false);
  }

  destroyBook() {
    if (this.flip) { try { this.flip.destroy(); } catch {} this.flip = null; }
    if (this.observer) { this.observer.disconnect(); this.observer = null; }
    if (this.stage) this.stage.innerHTML = "";
  }

  twoPages() {
    const { clientWidth: w, clientHeight: h } = this.stage;
    return this.reading.spread && w >= 2 * h * this.ratio * 0.8;
  }

  buildPages() {
    this.spread = this.twoPages();
    const holder = document.createElement("div");
    holder.className = "flip-book";
    holder.innerHTML = Array.from({ length: this.leaves }, (_, leaf) => {
      const i = this.rtl ? this.leaves - 1 - leaf : leaf;
      return i >= this.count ? `<div class="leaf" data-density="soft"></div>`
        : `<div class="leaf" data-density="soft">${this.pageInner(i)}</div>`;
    }).join("");
    this.stage.appendChild(holder);
    const stageW = this.stage.clientWidth;
    this.flip = new St.PageFlip(holder, {
      width: 600, height: Math.round(600 / this.ratio), size: "stretch",
      minWidth: this.spread ? 60 : stageW + 1, maxWidth: 5000, minHeight: 60, maxHeight: 5000,
      showCover: true, usePortrait: true, drawShadow: true, maxShadowOpacity: 0.5,
      mobileScrollSupport: false, disableFlipByClick: true, showPageCorners: true,
      flippingTime: SPEEDS[this.reading.turn_speed] || 700, startPage: this.leafOf(this.page),
    });
    this.flip.loadFromHTML(holder.querySelectorAll(".leaf"));
    this.flip.on("flip", (e) => {
      // Two pages side by side report their left leaf; a manga's left page is the later one.
      const pair = this.rtl && this.flip.getOrientation() === "landscape" && e.data % 2 === 1 && e.data < this.leaves - 1;
      this.onPage(this.pageOf(pair ? e.data + 1 : e.data));
    });
    this.flip.on("init", () => this.loadNear(this.page));
    this.flip.on("changeOrientation", () => this.loadNear(this.page));
  }

  buildScroll() {
    const col = document.createElement("div");
    col.className = "scroll-book";
    col.innerHTML = this.m.sizes.map(([w, h], i) =>
      `<div class="scroll-page" data-i="${i}" style="aspect-ratio: ${w} / ${h}">${this.pageInner(i)}</div>`).join("");
    this.stage.appendChild(col);
    this.scroller = col;
    const width = () => col.querySelector(".scroll-page").clientWidth;
    const loader = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) this.fillScrollPage(e.target, Number(e.target.dataset.i), width());
      }
    }, { root: col, rootMargin: "150% 0px" });
    const current = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.onPage(Number(e.target.dataset.i));
    }, { root: col, rootMargin: "-50% 0px -50% 0px" });
    col.querySelectorAll(".scroll-page").forEach((el) => { loader.observe(el); current.observe(el); });
    this.observer = { disconnect: () => { loader.disconnect(); current.disconnect(); } };
  }

  // What a page holds (a picture of it, for comics and PDFs; fixed.js puts the page itself there).
  pageInner(i) { return `<img alt="Page ${i + 1}" data-page="${i}" draggable="false" decoding="async">`; }

  fillScrollPage(el, i, width) {
    const img = el.querySelector("img");
    if (!img.getAttribute("src")) { img.onerror = retryOnce; img.src = this.src(i, width); }
  }

  pageWidthCss() {
    try {
      const rect = this.flip && this.flip.getBoundsRect();
      if (rect && rect.pageWidth) return rect.pageWidth;
    } catch { /* not laid out yet */ }
    return null;
  }

  loadNear(i) {
    if (!this.flip) return;
    const imgs = [];
    this.stage.querySelectorAll(".leaf img").forEach((img) => { imgs[Number(img.dataset.page)] = img; });
    const w = this.pageWidthCss();
    if (!w) return; // the book isn't laid out yet; "init" calls back
    for (let j = Math.max(0, i - NEAR); j <= Math.min(this.count - 1, i + NEAR + 1); j++) {
      const want = this.src(j, w);
      const img = imgs[j];
      if (img && img.dataset.want !== want) {
        img.dataset.want = want;
        img.onerror = retryOnce;
        img.src = want;
      }
    }
  }

  // ---------- moving through the book ----------

  goTo(i, save = true) {
    i = Math.max(0, Math.min(this.count - 1, i));
    this.quiet = !save;  // turnToPage fires "flip" straight away; that isn't the reader turning a page
    try {
      if (this.flip) this.flip.turnToPage(this.leafOf(i));
      else if (this.scroller) {
        const el = this.scroller.querySelector(`[data-i="${i}"]`);
        if (el) this.scroller.scrollTop = el.offsetTop - 16;
      }
    } finally {
      this.quiet = false;
    }
    this.onPage(i, save);
    if (!save && this.scroller) {  // scrolling to the saved page fires the observer too
      this.quiet = true;
      setTimeout(() => { this.quiet = false; }, 400);
    }
  }

  step(dir) {
    if (this.flip) {
      if (this.reading.turn_speed === "off") {
        const seen = this.visiblePages();
        this.goTo(dir > 0 ? Math.max(...seen) + 1 : Math.max(0, Math.min(...seen) - 1));
      } else if ((dir > 0) !== this.rtl) this.flip.flipNext("bottom");
      else this.flipBack();
    } else if (this.scroller) {
      this.scroller.scrollBy({ top: dir * this.scroller.clientHeight * 0.9, behavior: "smooth" });
    }
  }

  flipBack() {
    // StPageFlip's flipPrev() aims 10px from the left of its whole area. When the book is centred
    // with space beside it, that point misses the book, and with disableFlipByClick a miss is
    // silently dropped: turning back did nothing. Aim at the book's own bottom-left corner instead.
    const r = this.flip.getBoundsRect();
    this.flip.getFlipController().flip({ x: r.left + 10, y: r.top + r.height - 2 });
  }

  onPage(i, save = true) {
    this.page = i;
    this.loadNear(i);
    const scrubber = this.root.querySelector(".scrubber");
    if (document.activeElement !== scrubber) scrubber.value = i;
    this.root.querySelector(".reader-where").textContent = `Page ${i + 1} of ${this.count}`;
    this.markBookmarkButton();
    if (save && !this.quiet) {
      this.dirty = true;
      this.pageAt = Date.now() / 1000;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), SAVE_AFTER);
    }
  }

  saveNow(leaving = false) {
    clearTimeout(this.saveTimer);
    if (!this.dirty) return;  // nothing read since the last save: never overwrite another device's place
    this.dirty = false;
    // Sent with the time it was read, so a save that arrives late (kept while offline) never
    // overwrites reading done since on another device.
    return offline.send("PUT", `/books/${this.book.id}/progress`, { ...this.progressBody(), at: this.pageAt })
      .then((r) => { if (r && !r.ok) this.dirty = true; }).catch(() => { this.dirty = true; });
  }

  progressBody() {
    // The last page in view, so reaching the final spread of a two-page book counts as finished.
    return { file_id: this.file.id, page: Math.max(...this.visiblePages()), pages: this.count };
  }

  bookmarkBody() { return { file_id: this.file.id, page: this.page }; }
  bookmarkPage(b) { return b.page; }
  tocEntries() {
    return this.m.toc.length ? this.m.toc
      : Array.from({ length: Math.ceil(this.count / 10) }, (_, k) => ({ title: `Page ${k * 10 + 1}`, page: k * 10, level: 0 }));
  }
  tocPage(t) { return t.page; }
  goToEntry(t) { this.goTo(this.tocPage(t)); }
  extraPrefs() { return ""; }
  relayoutFor(key) { return key === "mode" || key === "spread"; }
  wireExtraPrefs(_panel) {}
  handleTap(_e) { return false; }  // true when the tap was a link or picture the reader dealt with
  rescaleSpread() { return this.reading.mode === "pages" && this.twoPages() !== this.spread; }

  // ---------- taps, keys, gestures ----------

  wire() {
    let down = null, lastTap = 0, tapTimer = null;
    this.on(this.stage, "pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    this.on(this.stage, "pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 350;
      down = null;
      if (moved > 8 || !quick) return;
      if (this.handleTap(e)) return;
      const x = e.clientX / innerWidth;
      const now = performance.now();
      if (x > 0.3 && x < 0.7) {
        if (now - lastTap < 300) { clearTimeout(tapTimer); lastTap = 0; this.zoom(); return; }
        lastTap = now;
        tapTimer = setTimeout(() => this.toggleControls(), 260);
        return;
      }
      if (this.reading.mode === "scroll") return;
      const forward = (x >= 0.7) !== this.reading.left_handed !== this.rtl;
      if (e.pointerType === "mouse" && this.flip) {
        // StPageFlip turns the page itself when a corner is clicked (its mouseup comes after ours).
        setTimeout(() => { if (this.flip && this.flip.getState() === "read") this.step(forward ? 1 : -1); }, 0);
      } else {
        this.step(forward ? 1 : -1);
      }
    });
    this.on(this.stage, "touchstart", (e) => { if (e.touches.length === 2) { e.preventDefault(); this.zoom(); } }, { passive: false });
    this.on(this.stage, "wheel", (e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom(); } }, { passive: false });
    this.on(window, "keydown", (e) => {
      if (e.target.closest && e.target.closest("input, textarea, select")) return;
      const [ahead, behind] = this.rtl ? ["ArrowLeft", "ArrowRight"] : ["ArrowRight", "ArrowLeft"];
      if ([ahead, "PageDown", " "].includes(e.key)) { e.preventDefault(); this.step(1); }
      else if ([behind, "PageUp"].includes(e.key)) { e.preventDefault(); this.step(-1); }
      else if (e.key === "Escape") {
        if (!this.closePanels()) location.hash = `#/book/${this.book.id}`;
      }
    });
    let resizeTimer;
    this.on(window, "resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (this.rescaleSpread()) this.build();
        else this.loadNear(this.page);
      }, 200);
    });
    this.on(window, "pagehide", () => this.saveNow(true));
    this.on(document, "visibilitychange", () => { if (document.visibilityState === "hidden") this.saveNow(true); });

    const scrubber = this.root.querySelector(".scrubber");
    scrubber.addEventListener("input", () => {
      this.root.querySelector(".reader-where").textContent = `Page ${Number(scrubber.value) + 1} of ${this.count}`;
    });
    scrubber.addEventListener("change", () => { this.goTo(Number(scrubber.value)); scrubber.blur(); });

    this.root.querySelectorAll("[data-panel]").forEach((b) =>
      b.addEventListener("click", () => this.togglePanel(b.dataset.panel)));
    this.root.querySelector("[data-bookmark]").addEventListener("click", () => this.toggleBookmark());
    this.root.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".reader-top, .reader-bottom, .reader-panel")) clearTimeout(this.hideTimer);
    });
  }

  zoom() {
    if (this.zoomView) return;
    this.zoomView = openZoom({
      src: (i) => (offline.isOffline() && this.storedPages ? this.storedPages[i] : `/api/files/${this.file.id}/pages/${i}?w=2400&v=${this.m.version}`),
      index: this.page, count: this.count, rtl: this.rtl,
      onClose: (i) => { this.zoomView = null; if (i !== this.page) this.goTo(i); },
    });
  }

  showControls(on) {
    this.root.classList.toggle("controls-on", on);
    if (!on) this.closePanels();
  }

  toggleControls() {
    clearTimeout(this.hideTimer);
    this.showControls(!this.root.classList.contains("controls-on"));
  }

  closePanels() {
    let closed = false;
    this.root.querySelectorAll(".reader-panel").forEach((p) => { if (!p.hidden) { p.hidden = true; closed = true; } });
    return closed;
  }

  togglePanel(name) {
    const panel = this.root.querySelector(`.reader-panel[data-for="${name}"]`);
    const opening = panel.hidden;
    this.closePanels();
    if (!opening) return;
    if (name === "contents") this.drawContents(panel);
    else if (name === "talk") {
      // Your place is saved first, so what you write is stamped with where you are.
      if (!this.talkStop) this.talkStop = wireDiscussion(panel.querySelector("[data-talk]"), this.book.id, { beforePost: () => this.saveNow() });
    } else this.drawPrefs(panel);
    panel.hidden = false;
  }

  // ---------- contents and bookmarks ----------

  async loadBookmarks() {
    let marks;
    try {
      marks = await api(`/books/${this.book.id}/bookmarks`);
      if (this.stored) offline.refreshBook(this.book, marks);
    } catch {
      marks = this.stored ? this.stored.bookmarks || [] : [];
    }
    this.bookmarks = marks.filter((b) => b.file_id === this.file.id);
    this.markBookmarkButton();
  }

  // Add or take away a bookmark; with no connection, kept on this device and sent later.
  async addBookmark() {
    const body = this.bookmarkBody();
    const tag = `local-${Date.now()}`;
    const r = await offline.send("POST", `/books/${this.book.id}/bookmarks`, body, tag);
    if (r && !r.ok) throw new Error("That bookmark wasn’t saved");
    const mark = r ? await r.json() : { ...body, id: tag, note: "", created_at: Date.now() / 1000 };
    this.bookmarks.push(mark);
    this.keepBookmarks();
  }

  async removeBookmark(b) {
    if (String(b.id).startsWith("local-")) await offline.forget(String(b.id));
    else {
      const r = await offline.send("DELETE", `/bookmarks/${b.id}`);
      if (r && !r.ok && r.status !== 404) throw new Error("That bookmark wasn’t removed");
    }
    this.bookmarks = this.bookmarks.filter((m) => m !== b);
    this.keepBookmarks();
  }

  keepBookmarks() {
    if (this.stored) offline.refreshBook(this.book, this.bookmarks);
  }

  visiblePages() {
    if (this.flip && this.flip.getOrientation() === "landscape") {
      // Leaf 0 is on its own (the cover, or a manga's last page); the rest come in pairs.
      const leaf = this.leafOf(this.page);
      if (leaf > 0 && !(this.rtl && leaf === this.leaves - 1)) {
        const left = leaf % 2 === 1 ? leaf : leaf - 1;
        return [left, left + 1].map((l) => (this.rtl ? this.leaves - 1 - l : l))
          .filter((p) => p >= 0 && p < this.count).sort((a, b) => a - b);
      }
    }
    return [this.page];
  }

  markBookmarkButton() {
    const on = this.bookmarks.some((b) => this.visiblePages().includes(this.bookmarkPage(b)));
    const button = this.root && this.root.querySelector("[data-bookmark]");
    if (!button) return;
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Remove bookmark" : "Bookmark this page");
  }

  async toggleBookmark() {
    const here = this.bookmarks.filter((b) => this.visiblePages().includes(this.bookmarkPage(b)));
    if (here.length) {
      for (const b of here) await this.removeBookmark(b);
    } else {
      await this.addBookmark();
      this.bookmarks.sort((a, b) => this.bookmarkPage(a) - this.bookmarkPage(b));
    }
    this.markBookmarkButton();
    const panel = this.root.querySelector('.reader-panel[data-for="contents"]');
    if (!panel.hidden) this.drawContents(panel);
  }

  drawContents(panel) {
    const toc = this.tocEntries();
    panel.innerHTML = `
      <h2>Contents</h2>
      <ol class="toc">${toc.map((t, n) => { const pg = this.tocPage(t); return `<li style="--level:${Math.min(t.level, 4)}">
        <button type="button" data-go="${pg}" data-entry="${n}"><span>${esc(t.title)}</span><span class="toc-page">${pg + 1}</span></button></li>`; }).join("")}</ol>
      <h2>Bookmarks</h2>
      ${this.bookmarks.length ? `<ol class="toc marks">${this.bookmarks.map((b) => { const pg = this.bookmarkPage(b); return `<li>
        <button type="button" data-go="${pg}"><span>Page ${pg + 1}${b.note ? ` · ${esc(b.note)}` : ""}</span></button>
        <button type="button" class="icon-btn" data-unmark="${b.id}" aria-label="Remove bookmark on page ${pg + 1}">×</button></li>`; }).join("")}</ol>`
        : `<p class="muted">Tap the bookmark at the top to keep your place on a page.</p>`}`;
    panel.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.entry !== undefined) this.goToEntry(toc[Number(b.dataset.entry)]);
      else this.goTo(Number(b.dataset.go));
      this.closePanels();
    }));
    panel.querySelectorAll("[data-unmark]").forEach((b) => b.addEventListener("click", async () => {
      const mark = this.bookmarks.find((m) => String(m.id) === b.dataset.unmark);
      if (mark) await this.removeBookmark(mark);
      this.markBookmarkButton();
      this.drawContents(panel);
    }));
  }

  // ---------- reading settings ----------

  drawPrefs(panel) {
    const r = this.reading;
    const seg = (key, options) => `<div class="segmented" role="radiogroup">${options.map(([v, label]) =>
      `<button type="button" role="radio" aria-checked="${r[key] === v}" data-set="${key}" data-value="${v}">${label}</button>`).join("")}</div>`;
    const sw = (key, label) => `<label class="switch"><input type="checkbox" data-toggle="${key}" ${r[key] ? "checked" : ""}><span>${label}</span></label>`;
    panel.innerHTML = `
      <h2>Reading</h2>
      <h3>Colours</h3>
      <div class="swatches" role="radiogroup">${[["dark", "Dark"], ["sepia", "Sepia"], ["white", "White"], ["black", "Black"]].map(([v, label]) =>
        `<button type="button" role="radio" class="swatch swatch-${v}" aria-checked="${r.theme === v}" data-set="theme" data-value="${v}"><span>${label}</span></button>`).join("")}</div>
      <h3>Pages</h3>
      ${seg("mode", [["pages", "Turn pages"], ["scroll", "Scroll"]])}
      <h3>Page turn</h3>
      ${seg("turn_speed", [["gentle", "Gentle"], ["normal", "Normal"], ["quick", "Quick"], ["off", "Instant"]])}
      ${this.extraPrefs()}
      ${sw("spread", "Two pages side by side when there’s room")}
      ${sw("left_handed", "Left-handed: tap the left edge to go forward")}`;
    panel.querySelectorAll("[data-set]").forEach((b) => b.addEventListener("click", () => this.setPref(b.dataset.set, b.dataset.value, panel)));
    panel.querySelectorAll("[data-toggle]").forEach((c) => c.addEventListener("change", () => this.setPref(c.dataset.toggle, c.checked, panel)));
    this.wireExtraPrefs(panel);
  }

  async setPref(key, value, panel) {
    const before = { ...this.reading };
    this.reading[key] = value;
    if (key === "theme") this.root.dataset.theme = value;
    if (key === "turn_speed" && this.flip) this.flip.getSettings().flippingTime = SPEEDS[value];
    if (this.relayoutFor(key)) this.build();
    this.drawPrefs(panel);
    try {
      await patchPrefs({ reading: { [key]: value } });
    } catch {
      this.reading = before;
      this.root.dataset.theme = before.theme;
      this.drawPrefs(panel);
    }
  }
}
