// Talking about a book: on its page and in the reader. Each message shows where its writer was.
// One from further into the book than you is blurred until you get there; tap to read it anyway.
// While the thread is open it asks for new messages every 10 seconds.
import { api, esc, icon } from "./api.js";
import { state } from "./main.js";

const EVERY = 10000;

function ago(seconds) {
  const s = Math.max(0, Date.now() / 1000 - seconds);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  const d = new Date(seconds * 1000);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

const paragraphs = (text) => text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

// Fill `box` with the thread for `bookId`. beforePost: called before writing (the reader saves
// your place first, so the message is stamped where you are). Returns a function that stops it.
export function wireDiscussion(box, bookId, { beforePost = async () => {} } = {}) {
  let messages = [];
  let you = { position: 0, place: "" };
  const revealed = new Set();
  let replyTo = null;
  let editing = null;
  let timer = null;
  let stopped = false;

  box.innerHTML = `<div class="talk">
    <div class="talk-list" data-list aria-live="polite"><p class="muted">Loading…</p></div>
    <form class="talk-form" data-form novalidate>
      <p class="talk-replying" data-replying hidden></p>
      <label class="visually-hidden" for="talk-${bookId}">Your message</label>
      <textarea id="talk-${bookId}" name="body" rows="3" maxlength="4000" placeholder="Say something about this book"></textarea>
      <div class="talk-send">
        <span class="muted talk-where" data-where></span>
        <button class="btn btn-primary btn-small" type="submit">Post</button>
      </div>
      <p class="form-error" role="alert" hidden></p>
    </form>
  </div>`;
  const list = box.querySelector("[data-list]");
  const form = box.querySelector("[data-form]");
  const error = form.querySelector(".form-error");

  function messageHTML(m, reply = false) {
    if (m.removed) return `<li class="msg is-removed" data-msg="${m.id}"><p class="muted">Message removed</p>${repliesHTML(m)}</li>`;
    const hidden = m.ahead && !revealed.has(m.id);
    return `<li class="msg${hidden ? " is-ahead" : ""}${m.mine ? " is-mine" : ""}" data-msg="${m.id}">
      <header class="msg-head">
        <strong>${m.mine ? "You" : esc(m.by)}</strong>
        ${m.place ? `<span class="msg-place" title="Where they were when they wrote this">${esc(m.place)}</span>` : ""}
        <span class="muted">${ago(m.at)}${m.edited ? " · edited" : ""}</span>
      </header>
      <div class="msg-body">${editing === m.id
        ? `<form class="msg-edit" data-edit-form><textarea name="body" rows="3" maxlength="4000">${esc(m.body)}</textarea>
            <div class="talk-send"><button class="btn btn-small btn-primary" type="submit">Save</button>
            <button class="btn btn-small" type="button" data-edit-cancel>Cancel</button></div></form>`
        : paragraphs(m.body)}</div>
      ${hidden ? `<button class="msg-reveal" type="button" data-reveal>
        <span>From further on than you are${m.place ? ` (${esc(m.place)})` : ""}.</span> <span class="msg-reveal-tap">Show it anyway</span></button>` : ""}
      ${hidden || editing === m.id ? "" : `<div class="msg-tools">
        ${reply ? "" : `<button class="link-btn" type="button" data-reply>Reply</button>`}
        ${m.mine ? `<button class="link-btn" type="button" data-edit>Edit</button>` : ""}
        ${m.mine || state.me.admin ? `<button class="link-btn" type="button" data-remove>Remove</button>` : ""}
      </div>`}
      ${reply ? "" : repliesHTML(m)}
    </li>`;
  }

  function repliesHTML(m) {
    const replies = messages.filter((r) => r.parent_id === m.id);
    return replies.length ? `<ol class="msg-replies">${replies.map((r) => messageHTML(r, true)).join("")}</ol>` : "";
  }

  function draw() {
    const top = messages.filter((m) => !m.parent_id);
    list.innerHTML = top.length ? `<ol class="msgs">${top.map((m) => messageHTML(m)).join("")}</ol>`
      : `<p class="muted talk-empty">No one has said anything yet. Messages are marked with where you are in the book, and anyone behind you sees yours blurred until they catch up.</p>`;
    box.querySelector("[data-where]").textContent = you.finished ? "You’ve finished it"
      : you.place ? `Posting from ${you.place}` : "Posting from the start";
  }

  async function load(full = false) {
    if (stopped || !box.isConnected) return stop();
    const after = full ? 0 : messages.reduce((n, m) => Math.max(n, m.id), 0);
    try {
      const r = await api(`/books/${bookId}/discussion?after=${after}`);
      you = r.you;
      if (full) messages = r.messages;
      else if (r.messages.length) messages = [...messages, ...r.messages];
      else if (!full) return;
      if (!editing) draw();
    } catch {
      if (full) list.innerHTML = `<p class="muted">The discussion can’t be loaded just now.</p>`;
    }
  }

  list.addEventListener("click", async (e) => {
    const li = e.target.closest("[data-msg]");
    if (!li) return;
    const id = Number(li.dataset.msg);
    const m = messages.find((x) => x.id === id);
    if (e.target.closest("[data-reveal]")) { revealed.add(id); draw(); }
    else if (e.target.closest("[data-reply]")) {
      replyTo = m;
      const note = form.querySelector("[data-replying]");
      note.hidden = false;
      note.innerHTML = `Replying to ${m.mine ? "yourself" : esc(m.by)} <button class="link-btn" type="button" data-unreply>Cancel</button>`;
      form.body.focus();
    } else if (e.target.closest("[data-edit]")) { editing = id; draw(); li.querySelector("textarea")?.focus(); }
    else if (e.target.closest("[data-edit-cancel]")) { editing = null; draw(); }
    else if (e.target.closest("[data-remove]")) {
      const b = e.target.closest("[data-remove]");
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Remove it?"; return; }
      try { await api(`/messages/${id}`, { method: "DELETE" }); await load(true); } catch (err) { error.textContent = err.message; error.hidden = false; }
    }
  });
  list.addEventListener("submit", async (e) => {
    if (!e.target.matches("[data-edit-form]")) return;
    e.preventDefault();
    try {
      const updated = await api(`/messages/${editing}`, { method: "PATCH", body: { body: e.target.body.value } });
      messages = messages.map((m) => (m.id === updated.id ? updated : m));
      editing = null;
      draw();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  });
  form.addEventListener("click", (e) => {
    if (e.target.closest("[data-unreply]")) { replyTo = null; form.querySelector("[data-replying]").hidden = true; }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await beforePost();
      await api(`/books/${bookId}/discussion`, { method: "POST", body: { body: form.body.value, parent_id: replyTo ? replyTo.id : null } });
      form.body.value = "";
      replyTo = null;
      form.querySelector("[data-replying]").hidden = true;
      await load();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
    button.disabled = false;
  });
  form.body.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) form.requestSubmit();
  });

  function stop() { stopped = true; clearInterval(timer); }
  load(true);
  timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, EVERY);
  return stop;
}

export const discussionIcon = () => icon("chat");
