// Requests: books people would like. Anyone asks; others vote; the most wanted come first. An
// admin links the book once it's in the library (everyone who wanted it is told), or says why not.
import { api, authorLine, esc, icon } from "./api.js";
import { state } from "./main.js";

export async function renderRequests(box) {
  box.innerHTML = `
    <header class="page-head"><h1>Requests</h1>
      <p class="muted">Books people would like in the library. Vote for the ones you want too; you’ll be told when one arrives.</p></header>
    <form class="ask-form" data-ask novalidate>
      <h2>Ask for a book</h2>
      <div class="field-row">
        <label class="field grow"><span class="field-label">Title</span><input name="title" maxlength="300" autocomplete="off" required></label>
        <label class="field grow"><span class="field-label">Author</span><input name="author" maxlength="200" autocomplete="off" placeholder="If you know"></label>
      </div>
      <label class="field"><span class="field-label">Note <span class="muted">(optional)</span></span><input name="note" maxlength="500" autocomplete="off" placeholder="Which edition, or why"></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">Ask for it</button>
    </form>
    <section data-open></section>
    <section data-closed></section>`;

  const form = box.querySelector("[data-ask]");
  const error = form.querySelector(".form-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      // form.elements, not form.title: a form's own .title is its tooltip, not the Title box.
      const f = form.elements;
      await api("/requests", { method: "POST", body: { title: f.title.value, author: f.author.value, note: f.note.value } });
      form.reset();
      draw(box);
    } catch (err) { error.textContent = err.message; error.hidden = false; }
  });
  draw(box);
}

async function draw(box) {
  const [open, closed] = await Promise.all([api("/requests"), api("/requests?closed=true")]);
  const admin = state.me.admin;
  const openBox = box.querySelector("[data-open]");
  openBox.innerHTML = `<h2>Wanted</h2>${open.length ? `<ul class="requests">${open.map((r) => `<li data-request="${r.id}">
      <button class="vote" type="button" data-vote aria-pressed="${r.voted}" aria-label="${r.voted ? "Take back your vote" : "Vote for this"}, ${r.votes} ${r.votes === 1 ? "vote" : "votes"}">
        ${icon("up")}<span>${r.votes}</span></button>
      <div class="request-text">
        <strong>${esc(r.title)}</strong>${r.author ? ` <span class="muted">by ${esc(r.author)}</span>` : ""}
        ${r.note ? `<p class="request-note">${esc(r.note)}</p>` : ""}
        <p class="request-by">Asked by ${r.mine ? "you" : esc(r.by)}</p>
        <div class="request-tools">
          ${admin ? `<button class="btn btn-small" type="button" data-found>It’s in the library</button>
            <button class="btn btn-small" type="button" data-no>Decline</button>` : ""}
          ${r.mine && !admin ? `<button class="btn btn-small" type="button" data-takeback>Take back</button>` : ""}
        </div>
        <div class="request-act" data-act hidden></div>
      </div></li>`).join("")}</ul>`
    : `<p class="muted">Nobody has asked for anything yet.</p>`}`;
  const closedBox = box.querySelector("[data-closed]");
  // Finished ones can be cleared away: by an admin, or by whoever asked.
  const removable = (r) => admin || r.mine;
  closedBox.innerHTML = closed.length ? `<div class="done-head"><h2>Lately</h2>
      ${admin ? `<button class="btn btn-small" type="button" data-clear-done>Clear the list</button>` : ""}</div>
    <ul class="requests done">${closed.map((r) => `<li data-done="${r.id}">
      <span class="request-text"><strong>${r.book_id ? `<a href="#/book/${r.book_id}">${esc(r.title)}</a>` : esc(r.title)}</strong>
      <span class="request-by">${r.status === "added" ? "Added to the library" : `Not added${r.reason ? `: ${esc(r.reason)}` : ""}`}</span></span>
      ${removable(r) ? `<button class="btn btn-small" type="button" data-remove-done aria-label="Remove ${esc(r.title)} from the list">Remove</button>` : ""}
    </li>`).join("")}</ul>` : "";
  closedBox.querySelectorAll("[data-remove-done]").forEach((b) => b.addEventListener("click", async () => {
    await api(`/requests/${b.closest("[data-done]").dataset.done}`, { method: "DELETE" }).catch(() => {});
    draw(box);
  }));
  closedBox.querySelector("[data-clear-done]")?.addEventListener("click", async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Clear every one?"; return; }
    b.disabled = true;
    for (const r of closed) await api(`/requests/${r.id}`, { method: "DELETE" }).catch(() => {});
    draw(box);
  });

  openBox.querySelectorAll("[data-request]").forEach((li) => {
    const id = li.dataset.request;
    const act = li.querySelector("[data-act]");
    const fail = (err) => { act.hidden = false; act.innerHTML = `<p class="form-error" role="alert">${esc(err.message)}</p>`; };
    li.querySelector("[data-vote]").addEventListener("click", async (e) => {
      const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
      try { await api(`/requests/${id}/vote`, { method: "POST", body: { on } }); draw(box); } catch (err) { fail(err); }
    });
    li.querySelector("[data-takeback]")?.addEventListener("click", async () => {
      try { await api(`/requests/${id}`, { method: "DELETE" }); draw(box); } catch (err) { fail(err); }
    });
    li.querySelector("[data-no]")?.addEventListener("click", () => {
      act.hidden = false;
      act.innerHTML = `<form class="inline-form" novalidate><label>Why not? <span class="muted">(everyone who asked sees this)</span>
        <input name="reason" maxlength="500" autocomplete="off" placeholder="Not out in English yet"></label>
        <button class="btn" type="submit">Decline it</button></form>`;
      const f = act.querySelector("form");
      f.reason.focus();
      f.addEventListener("submit", async (e) => {
        e.preventDefault();
        try { await api(`/requests/${id}/decline`, { method: "POST", body: { reason: f.reason.value } }); draw(box); } catch (err) { fail(err); }
      });
    });
    li.querySelector("[data-found]")?.addEventListener("click", () => {
      // Pick the book it became: search the library, choose one.
      act.hidden = false;
      act.innerHTML = `<form class="inline-form" novalidate><label>Which book is it?
        <input name="q" type="search" autocomplete="off" value="${esc(li.querySelector("strong").textContent)}"></label>
        <button class="btn" type="submit">Search</button></form><ul class="pick-book" data-picks></ul>`;
      const f = act.querySelector("form");
      const search = async () => {
        const found = await api(`/search?q=${encodeURIComponent(f.q.value)}`).catch(() => []);
        const picks = act.querySelector("[data-picks]");
        picks.innerHTML = found.length ? found.slice(0, 8).map((b) => `<li><button type="button" class="link-btn" data-book="${b.id}">
          ${esc(b.title)}${b.authors && b.authors.length ? ` <span class="muted">by ${esc(authorLine(b.authors))}</span>` : ""}</button></li>`).join("")
          : `<li class="muted">Nothing in the library matches. Add the book first, then come back.</li>`;
        picks.querySelectorAll("[data-book]").forEach((b) => b.addEventListener("click", async () => {
          try { await api(`/requests/${id}/fulfil`, { method: "POST", body: { book_id: Number(b.dataset.book) } }); draw(box); } catch (err) { fail(err); }
        }));
      };
      f.addEventListener("submit", (e) => { e.preventDefault(); search(); });
      search();
    });
  });
}
