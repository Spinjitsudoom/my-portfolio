// Arranging a book's pages by hand (admins, from the edit page): choose pages, then move or hide
// them. Made for touch first (tap to choose, then a button); on a computer pages can also be dragged,
// and shift-click chooses a run of pages. Every change saves at once; the book file is never touched.
import { api, esc } from "./api.js";
import { halfBox, pageScale, pageUrl } from "./fixedfit.js";

const key = (e) => `${e[0]}:${e[1] ?? "w"}`;

// Opens over the page. onClose(custom) is told whether the book now has an order of its own.
export async function openArrange(file, { onClose = () => {} } = {}) {
  let m = await api(`/files/${file.id}/manifest`);
  let order = m.arranged.map((e) => [e[0], e[1]]);
  let hidden = new Set(m.hidden.map(key));
  let saved = { order, hidden: new Set(hidden) };
  let selected = new Set();
  let last = null;  // the page chosen last, for shift-click
  const undo = [];
  let saving = Promise.resolve();
  let pending = 0;

  const layer = document.createElement("div");
  layer.className = "arrange";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "Arrange pages");
  layer.innerHTML = `
    <header class="arrange-head">
      <h2>Arrange pages</h2>
      <span class="arrange-status" aria-live="polite" data-status></span>
      <button class="btn btn-small" type="button" data-undo disabled>Undo</button>
      <button class="btn btn-small" type="button" data-reset>Reset</button>
      <button class="btn btn-small btn-primary" type="button" data-done>Done</button>
    </header>
    <p class="arrange-help">Tap pages to choose them, then move or hide them. On a computer you can also drag them. Changes save as you go; the book file itself isn’t changed.</p>
    <p class="form-error" data-error role="alert" hidden></p>
    <ol class="arrange-grid" data-grid="shown"></ol>
    <section class="arrange-hidden" data-hidden-section hidden>
      <h3>Hidden pages</h3>
      <p class="arrange-help">The reader skips these. Choose one and tap Show to put it back where it was.</p>
      <ol class="arrange-grid" data-grid="hidden"></ol>
    </section>
    <div class="arrange-bar" data-bar hidden>
      <span class="arrange-count" data-count></span>
      <button class="btn" type="button" data-move="front">Move to front</button>
      <button class="btn" type="button" data-move="end">Move to end</button>
      <form class="arrange-before" data-before novalidate>
        <label>Before page <input name="n" inputmode="numeric" autocomplete="off"></label>
        <button class="btn" type="submit">Move</button>
      </form>
      <button class="btn" type="button" data-blank>Blank page before</button>
      <button class="btn" type="button" data-hide>Hide</button>
      <button class="btn" type="button" data-show>Show</button>
      <button class="btn" type="button" data-clear>Clear</button>
    </div>`;
  document.body.appendChild(layer);
  const scrollY = window.scrollY;
  document.body.classList.add("arranging");

  const $ = (s) => layer.querySelector(s);
  const errorBox = $("[data-error]");
  const status = $("[data-status]");
  const fail = (message) => { errorBox.textContent = message; errorBox.hidden = false; };

  const shown = () => order.filter((e) => !hidden.has(key(e)));
  const thumb = (e) => `/api/files/${file.id}/piece?src=${e[0]}${e[1] == null ? "" : `&half=${e[1]}`}&w=200&v=${m.file_v}`;
  const isBlank = (e) => e[0] < 0;
  const aspect = (e) => {
    const [w, h] = m.source[isBlank(e) ? 0 : e[0]] || [2, 3];
    return `${e[1] == null ? w : w / 2} / ${h}`;
  };
  // A picture book's pages are documents, not pictures: each tile is the page itself in a sandboxed
  // frame (nothing in it runs), scaled down to the tile (and clipped to its half), filled once in view.
  const frameTile = (e) => {
    const [w, h] = m.source[e[0]] || [1000, 1500];
    return `<span class="arrange-frame" data-src="${e[0]}" data-half="${e[1] ?? ""}" style="aspect-ratio: ${aspect(e)}"><iframe
      sandbox="allow-same-origin" tabindex="-1" scrolling="no" title="" style="width:${w}px;height:${h}px"></iframe></span>`;
  };
  const tile = (e, label) => `<li><button type="button" class="arrange-page${selected.has(key(e)) ? " is-selected" : ""}"
      data-key="${key(e)}" aria-pressed="${selected.has(key(e))}" draggable="${!hidden.has(key(e))}" aria-label="${esc(label)}">
      ${isBlank(e) ? `<span class="arrange-blank" style="aspect-ratio: ${aspect(e)}">Blank</span>`
        : m.fixed ? frameTile(e)
        : `<img src="${thumb(e)}" alt="" loading="lazy" draggable="false" style="aspect-ratio: ${aspect(e)}">`}
      <span class="arrange-num">${esc(label)}</span></button></li>`;

  const docs = new Map();   // source page → its document (a promise), fetched once
  const doc = (src) => {
    if (!docs.has(src)) {
      const p = fetch(pageUrl(file.id, src, { version: m.file_v, fixed: true }), { credentials: "same-origin" })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));
      docs.set(src, p);
      p.catch(() => docs.delete(src));
    }
    return docs.get(src);
  };
  const fitFrame = (holder) => {
    const src = Number(holder.dataset.src);
    const half = holder.dataset.half === "" ? null : Number(holder.dataset.half);
    const box = halfBox(m.source[src] || [1000, 1500], half);
    const s = pageScale([box.width, box.height], [holder.clientWidth, holder.clientHeight]);
    holder.querySelector("iframe").style.transform = `translate(${-box.shiftX * s}px, 0) scale(${s})`;
  };
  const sizer = m.fixed ? new ResizeObserver((entries) => entries.forEach((x) => fitFrame(x.target))) : null;
  // Filled when near the screen and emptied again when well away from it: each frame is a whole page
  // (its full-size pictures too), and a long comic would otherwise keep every one of them alive.
  const seen = m.fixed ? new IntersectionObserver((entries) => entries.forEach((x) => {
    const holder = x.target, frame = holder.querySelector("iframe");
    if (!x.isIntersecting) {
      delete holder.dataset.near;
      if (frame.srcdoc) frame.srcdoc = "";
      return;
    }
    holder.dataset.near = "1";
    // Still near (and still on the page) once it arrives: a quick scroll past doesn't fill it.
    doc(Number(holder.dataset.src)).then((d) => { if (frame.isConnected && holder.dataset.near) frame.srcdoc = d; }, () => {});
  }), { rootMargin: "600px" }) : null;
  const watchFrames = () => {
    if (!m.fixed) return;
    sizer.disconnect(); seen.disconnect();
    layer.querySelectorAll(".arrange-frame").forEach((x) => { sizer.observe(x); seen.observe(x); });
  };

  function render() {
    const visible = shown();
    $("[data-grid=shown]").innerHTML = visible.map((e, i) => tile(e, `Page ${i + 1}`)).join("");
    const gone = order.filter((e) => hidden.has(key(e)));
    $("[data-hidden-section]").hidden = !gone.length;
    $("[data-grid=hidden]").innerHTML = gone.map((e) => tile(e, "Hidden")).join("");
    const chosen = order.filter((e) => selected.has(key(e)));
    const anyHidden = chosen.some((e) => hidden.has(key(e)));
    const anyShown = chosen.some((e) => !hidden.has(key(e)));
    $("[data-bar]").hidden = !chosen.length;
    $("[data-count]").textContent = `${chosen.length} chosen`;
    // Only what applies to the pages chosen: moving and hiding shown pages, showing hidden ones.
    layer.querySelectorAll("[data-move], [data-before], [data-hide], [data-blank]").forEach((b) => { b.hidden = !anyShown; });
    // A blank is taken out rather than hidden.
    $("[data-hide]").textContent = chosen.some((e) => !hidden.has(key(e)) && !isBlank(e)) ? "Hide" : "Remove";
    $("[data-show]").hidden = !anyHidden;
    $("[data-before] input").placeholder = String(visible.length);
    $("[data-undo]").disabled = !undo.length;
    layer.classList.toggle("has-bar", chosen.length > 0);
    watchFrames();
  }

  function save(body) {
    pending += 1;
    status.textContent = "Saving…";
    saving = saving.then(() => api(`/files/${file.id}/arrangement`, { method: "PATCH", body })
      .then((reply) => {
        m = reply;
        saved = { order: reply.arranged.map((e) => [e[0], e[1]]), hidden: new Set(reply.hidden.map(key)) };
        return true;
      })
      .catch((err) => {
        // Back to what the server has, so what's on screen is what the reader will show.
        order = saved.order;
        hidden = new Set(saved.hidden);
        render();
        fail(err.message);
        return false;
      })
      .finally(() => {
        pending -= 1;
        if (!pending) status.textContent = "Saved";
      }));
    return saving;
  }

  // Every change: remember how it was (for Undo), change it, show it, save it.
  function change(next) {
    errorBox.hidden = true;
    undo.push({ order, hidden: new Set(hidden) });
    if (undo.length > 100) undo.shift();
    ({ order, hidden } = next);
    render();
    save({ order, hidden: order.filter((e) => hidden.has(key(e))) });
  }

  // Move the chosen pages (in their current order) to just before `before`, or to the end (null).
  function moveChosen(before) {
    const moving = order.filter((e) => selected.has(key(e)) && !hidden.has(key(e)));
    if (!moving.length) return;
    const rest = order.filter((e) => !moving.includes(e));
    const at = before === "front" ? 0 : before == null ? rest.length : rest.findIndex((e) => key(e) === before);
    selected = new Set();  // done with them: the bar closes and the pages show where they went
    change({ order: [...rest.slice(0, at), ...moving, ...rest.slice(at)], hidden });
  }

  layer.addEventListener("click", (ev) => {
    const page = ev.target.closest(".arrange-page");
    if (!page) return;
    const k = page.dataset.key;
    if (ev.shiftKey && last && last !== k) {
      const list = [...page.closest(".arrange-grid").querySelectorAll(".arrange-page")].map((b) => b.dataset.key);
      const [a, b] = [list.indexOf(last), list.indexOf(k)].sort((x, y) => x - y);
      if (a >= 0) list.slice(a, b + 1).forEach((x) => selected.add(x));
    } else if (selected.has(k)) selected.delete(k);
    else selected.add(k);
    last = k;
    render();
  });

  layer.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
    moveChosen(b.dataset.move === "front" ? "front" : null);
  }));
  $("[data-before]").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const visible = shown().filter((e) => !selected.has(key(e)));
    const all = shown();
    const n = Number(ev.target.n.value.trim());
    if (!Number.isInteger(n) || n < 1 || n > all.length + 1) {
      fail(`Give a page number from 1 to ${all.length + 1}`);
      return;
    }
    // "Before page n" means the page numbered n now; if that page is one being moved, the next one that isn't.
    const target = all.slice(n - 1).find((e) => !selected.has(key(e)));
    moveChosen(target ? key(target) : (visible.length ? null : "front"));
    ev.target.n.value = "";
  });
  $("[data-hide]").addEventListener("click", () => {
    const next = new Set(hidden);
    order.forEach((e) => { if (selected.has(key(e)) && !isBlank(e)) next.add(key(e)); });
    const kept = order.filter((e) => !(isBlank(e) && selected.has(key(e))));
    if (kept.every((e) => next.has(key(e)) || isBlank(e))) {
      fail("A book needs at least one page that isn’t hidden");
      return;
    }
    selected = new Set();
    change({ order: kept, hidden: next });
  });
  // A blank page in front of the first page chosen: behind a cover, it keeps two-page spreads on
  // their pairs, as in the printed book.
  $("[data-blank]").addEventListener("click", () => {
    const first = order.find((e) => selected.has(key(e)) && !hidden.has(key(e)));
    if (!first) return;
    const blank = [Math.min(0, ...order.filter(isBlank).map((e) => e[0])) - 1, null];
    const at = order.indexOf(first);
    selected = new Set();
    change({ order: [...order.slice(0, at), blank, ...order.slice(at)], hidden });
  });
  $("[data-show]").addEventListener("click", () => {
    const next = new Set(hidden);
    selected.forEach((k) => next.delete(k));
    selected = new Set();
    change({ order, hidden: next });
  });
  $("[data-clear]").addEventListener("click", () => { selected = new Set(); render(); });

  $("[data-undo]").addEventListener("click", () => {
    const before = undo.pop();
    if (!before) return;
    errorBox.hidden = true;
    ({ order, hidden } = before);
    selected = new Set();
    render();
    save({ order, hidden: order.filter((e) => hidden.has(key(e))) });
  });
  $("[data-reset]").addEventListener("click", async () => {
    errorBox.hidden = true;
    undo.push({ order, hidden: new Set(hidden) });
    selected = new Set();
    if (await save({ order: null, hidden: [] })) {
      order = saved.order;
      hidden = new Set(saved.hidden);
    }
    render();
  });

  // Dragging, on a computer: drop chosen pages (or the one dragged) before the page dropped on.
  let dropOn = null;
  const clearDrop = () => { dropOn?.classList.remove("drop-before"); dropOn = null; };
  layer.addEventListener("dragstart", (ev) => {
    const page = ev.target.closest(".arrange-page");
    if (!page) return;
    if (!selected.has(page.dataset.key)) {
      selected = new Set([page.dataset.key]);
      layer.querySelectorAll(".arrange-page.is-selected").forEach((b) => b.classList.remove("is-selected"));
      page.classList.add("is-selected");
    }
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", page.dataset.key);
  });
  layer.addEventListener("dragover", (ev) => {
    const page = ev.target.closest("[data-grid=shown] .arrange-page");
    const grid = ev.target.closest("[data-grid=shown]");
    if (!grid) return;
    ev.preventDefault();
    if (page !== dropOn) {
      clearDrop();
      if (page && !selected.has(page.dataset.key)) { dropOn = page; page.classList.add("drop-before"); }
    }
  });
  layer.addEventListener("dragleave", (ev) => { if (!layer.contains(ev.relatedTarget)) clearDrop(); });
  layer.addEventListener("drop", (ev) => {
    const grid = ev.target.closest("[data-grid=shown]");
    if (!grid) return;
    ev.preventDefault();
    const page = ev.target.closest(".arrange-page");
    const target = dropOn ? dropOn.dataset.key : null;
    clearDrop();
    if (page && selected.has(page.dataset.key)) return;  // dropped on itself
    moveChosen(target);
  });
  layer.addEventListener("dragend", clearDrop);

  async function close() {
    await saving;
    if (m.fixed) { sizer.disconnect(); seen.disconnect(); }
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("arranging");
    layer.remove();
    window.scrollTo(0, scrollY);
    onClose(saved.hidden.size > 0 || m.custom);
  }
  const onKey = (ev) => {
    if (ev.key === "Escape") {
      if (selected.size) { selected = new Set(); render(); } else close();
    }
  };
  document.addEventListener("keydown", onKey);
  $("[data-done]").addEventListener("click", close);

  render();
  $("[data-done]").focus();
}
