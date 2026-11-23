// A page up close: pan by dragging, zoom by pinching, the wheel or the buttons. Turning pages here
// keeps the zoom and starts at the top of the next page. Pinching back out past 1× closes it.
// A page is a picture (src), or, for a fixed-layout book, the page itself in a frame (frame: its
// size and a way to fill the frame).
import { icon } from "./api.js";

const MAX = 5;

export function openZoom({ src, frame = null, index, count, onClose, rtl = false }) {
  const prev = `<button class="icon-btn" type="button" data-prev aria-label="Previous page">${icon(rtl ? "right" : "left")}</button>`;
  const next = `<button class="icon-btn" type="button" data-next aria-label="Next page">${icon(rtl ? "left" : "right")}</button>`;
  const turns = rtl ? next + prev : prev + next;  // a manga's next page is to the left
  const layer = document.createElement("div");
  layer.className = "zoom";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-label", "Page close-up");
  layer.innerHTML = `
    ${frame ? `<div class="zoom-img zoom-frame"><iframe sandbox="allow-same-origin" tabindex="-1" scrolling="no" title="Page"></iframe></div>`
      : `<img class="zoom-img" alt="" draggable="false">`}
    <div class="zoom-bar">
      <button class="zoom-btn" type="button" data-close>Back to book</button>
      <span class="zoom-page"></span>
      ${turns}
      <button class="icon-btn" type="button" data-out aria-label="Zoom out">−</button>
      <button class="icon-btn" type="button" data-in aria-label="Zoom in">+</button>
    </div>`;
  document.body.appendChild(layer);
  const img = layer.querySelector(".zoom-img");
  const inner = frame && img.querySelector("iframe");
  const label = layer.querySelector(".zoom-page");
  let page = index, scale = 2, x = 0, y = 0;
  const natural = () => (frame ? frame.size(page) : [img.naturalWidth, img.naturalHeight]);

  const fit = () => {
    const vw = innerWidth, vh = innerHeight;
    const [nw, nh] = natural();
    const r = Math.min(vw / nw, vh / nh) || 1;
    return { w: nw * r, h: nh * r, r, vw, vh };
  };
  const clamp = () => {
    const { w, h, vw, vh } = fit();
    const sw = w * scale, sh = h * scale;
    x = sw <= vw ? (vw - sw) / 2 : Math.min(0, Math.max(vw - sw, x));
    y = sh <= vh ? (vh - sh) / 2 : Math.min(0, Math.max(vh - sh, y));
  };
  const draw = () => {
    const { w, h, r } = fit();
    clamp();
    if (frame) {   // the frame stays at the page's own size and is scaled as a whole
      const [nw, nh] = natural();
      // The source page it shows: all of it, or a half (the frame is the whole page, shifted so that
      // half is in view, and the rest clipped); none for a blank page.
      const source = frame.source ? frame.source(page) : { size: [nw, nh], shiftX: 0 };
      img.classList.toggle("zoom-blank", !source);
      img.style.width = `${nw}px`;
      img.style.height = `${nh}px`;
      inner.hidden = !source;
      if (source) {
        inner.style.width = `${source.size[0]}px`;
        inner.style.height = `${source.size[1]}px`;
        inner.style.left = `${-source.shiftX}px`;
      }
      img.style.transform = `translate(${x}px, ${y}px) scale(${scale * r})`;
      return;
    }
    img.style.width = `${w}px`;
    img.style.height = `${h}px`;
    img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  const zoomAt = (next, cx, cy) => {
    next = Math.min(MAX, next);
    if (next < 1) return close();
    x = cx - (cx - x) * (next / scale);
    y = cy - (cy - y) * (next / scale);
    scale = next;
    draw();
  };
  const show = (i, top = false) => {
    page = Math.max(0, Math.min(count - 1, i));
    label.textContent = `Page ${page + 1} of ${count}`;
    // A turned-to page starts where reading starts: top left, or top right in a manga.
    const ready = () => { if (top) { x = rtl ? -Infinity : 0; y = 0; } else { const { w, h, vw, vh } = fit(); x = (vw - w * scale) / 2; y = (vh - h * scale) / 2; } draw(); };
    if (frame) { frame.fill(page, inner).then(ready, ready); return; }
    img.onload = ready;
    img.src = src(page);
  };
  function close(silent = false) {
    if (!layer.isConnected) return;
    layer.remove();
    removeEventListener("keydown", onKey, true);
    removeEventListener("resize", draw);
    if (silent !== true) onClose(page);
  }

  const pointers = new Map();
  let pinch = null;
  layer.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".zoom-bar")) return;
    layer.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale };
    }
  });
  layer.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      zoomAt(pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pointers.size === 1) {
      x += e.clientX - prev.x;
      y += e.clientY - prev.y;
      draw();
    }
  });
  const lift = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  layer.addEventListener("pointerup", lift);
  layer.addEventListener("pointercancel", lift);
  layer.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(scale * Math.exp(-e.deltaY / 200), e.clientX, e.clientY);
    else { x -= e.deltaX; y -= e.deltaY; draw(); }
  }, { passive: false });
  layer.addEventListener("dblclick", (e) => (scale > 1.5 ? close() : zoomAt(2.5, e.clientX, e.clientY)));

  layer.querySelector("[data-close]").addEventListener("click", () => close());
  layer.querySelector("[data-prev]").addEventListener("click", () => show(page - 1, true));
  layer.querySelector("[data-next]").addEventListener("click", () => show(page + 1, true));
  layer.querySelector("[data-in]").addEventListener("click", () => zoomAt(scale * 1.4, innerWidth / 2, innerHeight / 2));
  layer.querySelector("[data-out]").addEventListener("click", () => zoomAt(scale / 1.4, innerWidth / 2, innerHeight / 2));
  const onKey = (e) => {
    if (e.key === "Escape") close();
    else if (e.key === (rtl ? "ArrowLeft" : "ArrowRight") || e.key === "PageDown") show(page + 1, true);
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft") || e.key === "PageUp") show(page - 1, true);
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  addEventListener("keydown", onKey, true);
  addEventListener("resize", draw);
  show(page);
  layer.querySelector("[data-close]").focus();
  return { close };
}
