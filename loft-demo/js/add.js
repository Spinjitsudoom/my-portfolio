// The + page. Tabs:
// - Add books (admins): drop files, check each one's details (read from the file, filled from the
//   lookups if wanted), then save it into the books folder. Members get "Submit a book" instead:
//   the same, but it's sent to an admin for approval, and their sent books are listed below.
// - Requests: books people would like (requests.js).
// - Approvals (admins): members' books waiting, each reviewed like an upload, then approved or declined.
import { api, esc } from "./api.js";
import { coverHTML, generatedStyle } from "./cover.js";
import { clearErrors, detailFields, fillEmpty, readDetails, showError, showLookup } from "./edit.js";
import { state } from "./main.js";
import { renderRequests } from "./requests.js";
import { searchTitle } from "./titles.js";

const PAGE_FORMATS = ["pdf", "cbz", "cbr", "cb7"];

const ACCEPT = ".epub,.pdf,.cbz,.cbr,.cb7,.mobi,.azw,.azw3,.fb2,.txt";
const queue = [];
let sending = false;

function mb(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`;
}

export async function renderAdd(main, params = new URLSearchParams()) {
  const admin = state.me.admin;
  const tabs = [["add", admin ? "Add books" : "Submit a book"], ["requests", "Requests"], ...(admin ? [["approvals", "Approvals"]] : [])];
  const tab = tabs.some(([k]) => k === params.get("tab")) ? params.get("tab") : "add";
  const waiting = admin ? await api("/submissions").catch(() => []) : [];
  main.innerHTML = `<section class="page narrow add-page">
    <nav class="tabs" aria-label="Adding books">${tabs.map(([k, label]) => `<a href="#/add?tab=${k}" class="tab${k === tab ? " is-on" : ""}"
      ${k === tab ? 'aria-current="page"' : ""}>${label}${k === "approvals" && waiting.length ? ` <span class="count">${waiting.length}</span>` : ""}</a>`).join("")}</nav>
    <div data-tab></div>
  </section>`;
  const box = main.querySelector("[data-tab]");
  if (tab === "requests") return renderRequests(box);
  if (tab === "approvals") return renderApprovals(box, waiting);
  return admin ? renderUpload(box) : renderSubmit(box);
}

async function renderUpload(box) {
  const lib = await api("/library");
  box.innerHTML = `
    <header class="page-head"><h1>Add books</h1>
      <p class="muted">Each book is saved into <code>${esc(lib.upload_dir || "your books folder")}</code> as Author / Title / file,
        once you’ve checked its details. Your existing files are never changed.</p></header>
    ${dropHTML(lib.allow_txt)}
    <ol class="add-list" data-list></ol>`;
  wireDrop(box, "save");
}

async function renderSubmit(box) {
  box.innerHTML = `
    <header class="page-head"><h1>Submit a book</h1>
      <p class="muted">Send a book for the library. Fill in its details, then an admin looks it over and adds it;
        you’ll be told when they have. Until then only you can see it.</p></header>
    ${dropHTML(false)}
    <ol class="add-list" data-list></ol>
    <section class="sent" data-sent></section>`;
  wireDrop(box, "submit");
  drawSent(box.querySelector("[data-sent]"));
}

const STATUS = { waiting: "Waiting for an admin", approved: "Added to the library", declined: "Not added" };

async function drawSent(section) {
  const mine = await api("/submissions/mine").catch(() => []);
  if (!mine.length) { section.innerHTML = ""; return; }
  section.innerHTML = `<h2>Books you’ve sent</h2>
    <ul class="sent-list">${mine.map((s) => `<li>
      <span class="sent-title">${s.book_id ? `<a href="#/book/${s.book_id}">${esc(s.title)}</a>` : esc(s.title)}</span>
      <span class="sent-status status-${s.status}">${STATUS[s.status] || s.status}${s.reason ? `: ${esc(s.reason)}` : ""}</span>
      ${s.status === "waiting" ? `<button class="btn btn-small" type="button" data-withdraw="${s.id}">Take back</button>` : ""}
    </li>`).join("")}</ul>`;
  section.querySelectorAll("[data-withdraw]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/submissions/${b.dataset.withdraw}`, { method: "DELETE" }).catch(() => {});
    drawSent(section);
  }));
}

async function renderApprovals(box, waiting) {
  box.innerHTML = `
    <header class="page-head"><h1>Approvals</h1>
      <p class="muted">Books members sent. Check and correct the details, then add each one or say why not.</p></header>
    ${waiting.length ? "" : `<div class="empty"><p>Nothing is waiting.</p></div>`}
    <ol class="add-list" data-list></ol>`;
  const list = box.querySelector("[data-list]");
  for (const sub of waiting) {
    const li = document.createElement("li");
    li.className = "add-card";
    list.append(li);
    review(li, {
      token: sub.token, filename: sub.filename, format: sub.format, size: null, details: sub.details,
      has_cover: true, isbn: "", same_as: [], has_pages: PAGE_FORMATS.includes(sub.format),
    }, "approve", sub);
  }
}

function dropHTML(allowTxt) {
  return `<label class="drop" data-drop>
      <input type="file" multiple accept="${ACCEPT}" hidden data-files>
      <span class="drop-title">Drop books here</span>
      <span class="drop-sub">or <span class="drop-link">choose files</span></span>
      <span class="drop-sub">EPUB, PDF, comics (CBZ, CBR, CB7), Kindle and FB2${allowTxt ? ", and plain text" : ""}</span>
    </label>`;
}

function wireDrop(box, mode) {
  const drop = box.querySelector("[data-drop]");
  const list = box.querySelector("[data-list]");
  const take = (files) => { for (const f of files) addFile(list, f, mode); };
  box.querySelector("[data-files]").addEventListener("change", (e) => { take(e.target.files); e.target.value = ""; });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); take(e.dataTransfer.files); });
}

function addFile(list, file, mode) {
  const li = document.createElement("li");
  li.className = "add-card";
  li.innerHTML = `<div class="add-status"><strong>${esc(file.name)}</strong><span class="muted">${mb(file.size)} · waiting</span></div>
    <span class="add-bar"><i style="width:0"></i></span>`;
  list.prepend(li);
  queue.push({ file, li, mode });
  pump();
}

async function pump() {
  if (sending) return;
  sending = true;
  while (queue.length) {
    const { file, li, mode } = queue.shift();
    if (!document.body.contains(li)) continue;
    try {
      review(li, await send(file, li), mode);
    } catch (e) {
      li.innerHTML = `<div class="add-status"><strong>${esc(file.name)}</strong><span class="form-error">${esc(e.message)}</span></div>
        <button class="btn btn-small" type="button">Dismiss</button>`;
      li.querySelector("button").addEventListener("click", () => li.remove());
    }
  }
  sending = false;
}

function send(file, li) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const note = li.querySelector(".muted");
    const bar = li.querySelector(".add-bar i");
    xhr.open("PUT", `/api/uploads?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      bar.style.width = `${(e.loaded / e.total) * 100}%`;
      note.textContent = e.loaded < e.total ? `${mb(e.loaded)} of ${mb(e.total)}` : "Reading its details…";
    };
    xhr.onload = () => {
      let json = null;
      try { json = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status === 200 && json) resolve(json);
      else reject(new Error((json && typeof json.detail === "string" && json.detail) || "The upload didn’t finish; try again"));
    };
    xhr.onerror = () => reject(new Error("The upload didn’t finish; check the connection and try again"));
    xhr.send(file);
  });
}

// mode: "save" (an admin's own upload), "submit" (a member sending one), "approve" (an admin
// looking at a member's submission `sub`).
function review(li, draft, mode, sub = null) {
  let coverUrl = sub ? sub.cover_url : null;
  const cover = () => draft.has_cover && !coverUrl
    ? `<div class="book" style="${generatedStyle(draft.details.title)}"><img src="/api/uploads/${draft.token}/cover" alt=""></div>`
    : coverUrl
      ? `<div class="book" style="${generatedStyle(draft.details.title)}"><img src="${esc(coverUrl)}" alt=""></div>`
      : coverHTML({ title: draft.details.title || draft.filename, authors: draft.details.authors });
  li.classList.add("reviewing");
  li.innerHTML = `<div class="add-cover" data-cover>${cover()}</div>
    <form class="add-form" novalidate>
      <p class="add-file"><strong>${esc(draft.filename)}</strong> <span class="muted">${esc(draft.format.toUpperCase())}${draft.size ? ` · ${mb(draft.size)}` : ""}${sub ? ` · sent by ${esc(sub.by)}` : ""}</span></p>
      ${draft.same_as.length ? `<p class="add-same">This looks like ${draft.same_as.map((b) =>
        `<a href="#/book/${b.id}">${esc(b.title)}</a>`).join(", ")}, already in the library.${mode === "submit" ? "" : " Save it anyway to keep both."}</p>` : ""}
      ${detailFields(draft.details, { required: true })}
      ${draft.has_pages ? `<label class="switch add-rtl"><input type="checkbox" name="right_to_left" ${sub && sub.right_to_left ? "checked" : ""}><span>Manga: pages read right to left</span></label>` : ""}
      <div class="edit-actions">
        <button class="btn btn-primary" type="submit">${{ save: "Save to the library", submit: "Send for approval", approve: "Add to the library" }[mode]}</button>
        <button class="btn" type="button" data-fill>Look up details</button>
        <button class="btn" type="button" data-discard>${mode === "approve" ? "Decline" : "Discard"}</button>
      </div>
      ${mode === "approve" ? `<div class="decline" data-decline hidden>
        <label>Why not? <span class="muted">(${esc(sub.by)} sees this)</span><input name="reason" maxlength="500" autocomplete="off" placeholder="We have it already"></label>
        <button class="btn" type="button" data-decline-yes>Decline it</button>
      </div>` : ""}
      <p class="form-error" role="alert" hidden></p>
      <div class="lookup" hidden></div>
    </form>`;

  const form = li.querySelector("form");
  const error = form.querySelector(".form-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);
    error.hidden = true;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    const details = readDetails(form);
    const body = { details, cover_url: coverUrl, right_to_left: Boolean(form.elements.right_to_left && form.elements.right_to_left.checked) };
    try {
      if (mode === "submit") {
        await api(`/uploads/${draft.token}/submit`, { method: "POST", body });
        li.classList.remove("reviewing");
        li.innerHTML = `<div class="add-status"><strong>${esc(details.title)}</strong><span class="muted">Sent for approval. You’ll be told when an admin has looked at it.</span></div>`;
        const sent = document.querySelector("[data-sent]");
        if (sent) drawSent(sent);
        return;
      }
      const { book_id } = mode === "approve"
        ? await api(`/submissions/${sub.id}/approve`, { method: "POST", body })
        : await api(`/uploads/${draft.token}/save`, { method: "POST", body });
      li.classList.remove("reviewing");
      li.innerHTML = `<div class="add-status"><strong>${esc(details.title)}</strong><span class="muted">Added to the library${sub ? `; ${esc(sub.by)} has been told` : ""}</span></div>
        <a class="btn btn-small" href="#/book/${book_id}">Open book</a>`;
    } catch (err) {
      const left = showError(form, err.message);
      if (left) { error.textContent = left; error.hidden = false; }
      button.disabled = false;
    }
  });
  form.querySelector("[data-fill]").addEventListener("click", () => {
    const d = readDetails(form);
    showLookup(form.querySelector(".lookup"), { title: searchTitle(d.title), author: d.authors[0] || "", isbn: draft.isbn, comic: draft.has_pages }, async (c) => {
      await fillEmpty(form, c);
      if (!draft.has_cover && c.cover_url) {
        coverUrl = c.cover_url;
        li.querySelector("[data-cover]").innerHTML = cover();
      }
      form.querySelector(".lookup").hidden = true;
    });
  });
  form.querySelector("[data-discard]").addEventListener("click", async () => {
    if (mode === "approve") {
      const box = form.querySelector("[data-decline]");
      box.hidden = false;
      box.querySelector("input").focus();
      return;
    }
    await api(`/uploads/${draft.token}`, { method: "DELETE" }).catch(() => {});
    li.remove();
  });
  form.querySelector("[data-decline-yes]")?.addEventListener("click", async () => {
    try {
      await api(`/submissions/${sub.id}/decline`, { method: "POST", body: { reason: form.elements.reason.value } });
      li.classList.remove("reviewing");
      li.innerHTML = `<div class="add-status"><strong>${esc(sub.title)}</strong><span class="muted">Declined; ${esc(sub.by)} has been told</span></div>`;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  if (mode !== "approve") form.elements.title.focus({ preventScroll: true });
}

