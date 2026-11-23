// Library settings, for admins: the library itself, its folders and scanning, the people in it,
// backups and updates.
import { updatesPanelHTML, wireUpdates } from "./updates.js";
import { backupsPanelHTML, wireBackups } from "./backups.js";
import { api, esc, icon } from "./api.js";
import { state } from "./main.js";
import { saved } from "./settings.js";

const INTERVALS = [[5, "5 minutes"], [10, "10 minutes"], [30, "30 minutes"], [60, "hour"], [360, "6 hours"], [1440, "day"]];

export function ago(seconds) {
  const s = Math.max(0, Date.now() / 1000 - seconds);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function scanText(scan) {
  if (scan.running) return "Scanning…";
  const r = scan.report;
  if (!r) return "Loft checks the folders for new, changed and removed books every few minutes.";
  const counts = !r.added && !r.updated && !r.removed ? "everything was already up to date"
    : `${r.added} added, ${r.updated} updated, ${r.removed} removed`;
  const trouble = r.unreachable.length + r.unreadable.length;
  return `Last scan ${ago(r.at)}: ${counts}.${trouble ? ` ${trouble} ${trouble === 1 ? "folder" : "folders"} couldn’t be read (see the library check).` : ""}`;
}

// A saved key (or token) is never sent back to the app: only whether there is one.
const KEY_FIELDS = { google_books: "google_books_key", hardcover: "hardcover_token", isbndb: "isbndb_key" };

function keyForm(name, isSaved, label, placeholder, hint) {
  return `<div class="key-source"><form class="inline-form" data-key-form="${name}" novalidate>
        <label>${label}<input name="key" type="password" autocomplete="off" spellcheck="false"
          placeholder="${isSaved ? "Saved. Paste a new one to replace it" : placeholder}"></label>
        <button class="btn" type="submit">Save</button>
        ${isSaved ? `<button class="btn" type="button" data-key-remove>Remove</button>` : ""}
      </form>
      <p class="form-error" data-key-error="${name}" role="alert" hidden></p>
      <p class="field-hint">${hint}</p></div>`;
}

export async function renderAdmin(main) {
  const [users, scan, lib, check, joining, sections, waiting, wanted, auto, update, saves] = await Promise.all([api("/users"), api("/scan"),
    api("/library"), api("/check"), api("/join-requests"), api("/sections"), api("/submissions"), api("/requests"),
    api("/autofill"), api("/updates"), api("/backups")]);
  const autoText = auto.filled.length || auto.unsure.length
    ? [auto.filled.length && `${auto.filled.length} ${auto.filled.length === 1 ? "book" : "books"} filled in`,
      auto.unsure.length && `${auto.unsure.length} without a sure match`].filter(Boolean).join(", ")
    : lib.auto_lookup && lib.online_lookups ? "New books get their details by themselves" : "Off";
  const admins = users.filter((u) => u.admin).length;
  const attention = check.items.length;
  const interval = INTERVALS.some(([m]) => m === lib.scan_interval_minutes) ? INTERVALS
    : [...INTERVALS, [lib.scan_interval_minutes, `${lib.scan_interval_minutes} minutes`]].sort((a, b) => a[0] - b[0]);

  main.innerHTML = `<section class="page narrow">
    <header class="page-head"><h1>Library settings</h1></header>

    <a class="check-link ${attention ? "" : "quiet"}" href="#/check">
      ${icon("check")}<span><strong>Library check</strong>
      <span class="muted">${attention ? `${attention} ${attention === 1 ? "thing needs" : "things need"} attention` : "Nothing needs attention"}</span></span>
      ${icon("right")}</a>
    <a class="check-link ${waiting.length ? "" : "quiet"}" href="#/add?tab=approvals">
      ${icon("plus")}<span><strong>Approvals</strong>
      <span class="muted">${waiting.length ? `${waiting.length} ${waiting.length === 1 ? "book" : "books"} sent by members, waiting for you` : "No books waiting"}</span></span>
      ${icon("right")}</a>
    <a class="check-link ${wanted.length ? "" : "quiet"}" href="#/add?tab=requests">
      ${icon("bell")}<span><strong>Requests</strong>
      <span class="muted">${wanted.length ? `${wanted.length} ${wanted.length === 1 ? "book" : "books"} asked for` : "Nobody is asking for anything"}</span></span>
      ${icon("right")}</a>
    <a class="check-link ${auto.unsure.length ? "" : "quiet"}" href="#/filled">
      ${icon("edit")}<span><strong>Filled in automatically</strong>
      <span class="muted">${autoText}</span></span>
      ${icon("right")}</a>

    <section class="panel">
      <h2>The library</h2>
      <form class="inline-form" data-name novalidate>
        <label>Name<input name="name" value="${esc(lib.name)}" placeholder="Loft" maxlength="40" autocomplete="off"></label>
        <button class="btn" type="submit">Save name</button>
      </form>
      <p class="field-hint">Shown at the top of every page and on the sign-in page.</p>
      <label class="switch"><input type="checkbox" data-lib="allow_txt" ${lib.allow_txt ? "checked" : ""}>
        <span>Show plain-text (.txt) files as books</span></label>
      <p class="field-hint indent">Off by default: a notes or passwords file in the books folder would show up for everyone.</p>
      <label class="switch"><input type="checkbox" data-lib="online_lookups" ${lib.online_lookups ? "checked" : ""}>
        <span>Look up details and covers online</span></label>
      <p class="field-hint indent">When you ask for a lookup, and for new books if the switch below is on. Open Library and any source below with a key get the title, author and ISBN; AniList, asked for comics and manga, gets just the title.</p>
      <label class="switch"><input type="checkbox" data-lib="auto_lookup" ${lib.auto_lookup ? "checked" : ""} ${lib.online_lookups ? "" : "disabled"}>
        <span>Fill in new books’ details by themselves</span></label>
      <p class="field-hint indent">After each scan, new books missing a description, tags, an author or a cover are looked up. Only a sure match is used (the same title, and the same author when the book has one), only what’s missing is filled in, and each can be undone from <a href="#/filled">Filled in automatically</a>.</p>
      <h3>More places to look</h3>
      <p class="muted section-hint">Open Library and AniList need nothing. These need a key of your own; each one saved is asked too.</p>
      ${keyForm("google_books", lib.google_books, "Google Books key", "Paste a key to add Google Books",
        "Google Books has the editions themselves, such as English manga volumes with their covers and ISBNs. It needs a free key from Google Cloud with the Books API turned on.")}
      ${keyForm("hardcover", lib.hardcover, "Hardcover token", "Paste a token to add Hardcover",
        `Hardcover knows which series a book is in and its number, and has descriptions for most modern books. Free: on <a href="https://hardcover.app/account/api" target="_blank" rel="noreferrer noopener">hardcover.app</a>, Settings, Hardcover API, make a key, and paste it here. Tokens expire; make a new one when it does.`)}
      ${keyForm("isbndb", lib.isbndb, "ISBNdb key", "Paste a key to add ISBNdb",
        "ISBNdb is strongest for books with an ISBN: publisher, date and a synopsis for the edition. Its keys come with a paid plan (they start with a trial); when the key stops working, Loft just asks the others.")}
    </section>

    <section class="panel" data-sections-panel>
      <h2>Sections</h2>
      <p class="muted">The stacks shelve books by section. A book stands in the first section whose tags it has, so order matters; books with none of them go in Other.
        ${sections.suggested ? "These are suggested from your books’ tags. Change anything and they’re yours." : ""}</p>
      <ol class="section-list" data-sections></ol>
      <div class="section-tools">
        <button class="btn btn-small" type="button" data-section-add>${icon("plus")}Add a section</button>
        <button class="btn btn-small btn-primary" type="button" data-section-save>Save sections</button>
        ${sections.suggested ? "" : `<button class="btn btn-small" type="button" data-section-reset>Use the suggestions again</button>`}
      </div>
      <p class="form-error" data-section-error role="alert" hidden></p>
      ${sections.other.count ? `<h3>Other holds ${sections.other.count} ${sections.other.count === 1 ? "book" : "books"}</h3>
        <p class="muted section-hint">${sections.other.untagged ? `${sections.other.untagged} of them have no tags; give them some on their pages (or with Look up details) to shelve them. ` : ""}${sections.other.tags.length ? "The rest are tagged as below. Tap a tag to add it to the section you last clicked in." : ""}</p>` : ""}
      ${sections.other.tags.length ? `
        <ul class="tag-cloud">${sections.other.tags.map(([t, n]) => `<li><button type="button" class="tag-chip" data-tag="${esc(t)}">${esc(t)} <span>${n}</span></button></li>`).join("")}</ul>` : ""}
    </section>

    <section class="panel">
      <h2>Books folders</h2>
      <ul class="folders">${lib.books_dirs.map((d) => `<li>
        <code>${esc(d)}</code>
        <span class="folder-actions">
          ${d === lib.upload_dir ? `<span class="badge">New books go here</span>`
            : `<button class="btn btn-small" type="button" data-upload-dir="${esc(d)}">Put new books here</button>`}
          ${lib.books_dirs.length > 1 ? `<button class="btn btn-small" type="button" data-remove-dir="${esc(d)}">Remove</button>` : ""}
        </span></li>`).join("")}</ul>
      <form class="inline-form" data-add-dir novalidate>
        <label>Add a folder<input name="path" placeholder="/path/to/more/books" autocomplete="off" spellcheck="false"></label>
        <button class="btn" type="submit">Add folder</button>
      </form>
      <p class="form-error" data-dir-error role="alert" hidden></p>
      <h3>Scanning</h3>
      <div class="scan-row">
        <label class="select-label">Look for changes every
          <select data-interval>${interval.map(([m, label]) => `<option value="${m}" ${m === lib.scan_interval_minutes ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <button class="btn" type="button" data-rescan>Rescan now</button>
      </div>
      <p class="muted scan-status" data-scan-status>${scanText(scan)}</p>
    </section>

    <section class="panel">
      <h2>People</h2>
      <ul class="people">${users.map((u) => `<li data-user="${u.id}">
        <span class="person">${esc(u.username)}${u.admin ? ` <span class="badge">Admin</span>` : ""}${u.id === state.me.id ? ` <span class="muted">(you)</span>` : ""}</span>
        <span class="person-actions">
          ${u.admin
            ? (admins > 1 ? `<button class="btn btn-small" type="button" data-admin="false">Make member</button>` : "")
            : `<button class="btn btn-small" type="button" data-admin="true">Make admin</button>`}
          ${u.id === state.me.id ? "" : `<button class="btn btn-small" type="button" data-reset>Reset password</button>
          <button class="btn btn-small" type="button" data-remove data-name="${esc(u.username)}">Remove</button>`}
        </span>
        <form class="reset-form" novalidate hidden>
          <label>New password for ${esc(u.username)}<input name="password" type="text" autocomplete="new-password" minlength="6"></label>
          <button class="btn btn-primary btn-small" type="submit">Set password</button>
          <p class="form-error" role="alert" hidden></p>
        </form>
      </li>`).join("")}</ul>
      <p class="form-error" data-people-error role="alert" hidden></p>
      ${joining.length ? `<h3>Asking to join</h3>
        <ul class="people joining">${joining.map((j) => `<li data-join="${j.id}">
          <span class="person">${esc(j.username)}${j.note ? `<span class="muted join-note">${esc(j.note)}</span>` : ""}</span>
          <span class="person-actions">
            <button class="btn btn-small btn-primary" type="button" data-join-yes>Let them in</button>
            <button class="btn btn-small" type="button" data-join-no>Decline</button>
          </span></li>`).join("")}</ul>` : ""}
      <label class="switch"><input type="checkbox" data-lib="join_requests" ${lib.join_requests ? "checked" : ""}>
        <span>Let people ask to join from the sign-in page</span></label>
      <p class="field-hint indent">You decide who gets in. Anyone who can reach this server can ask.</p>
      <form class="add-person" novalidate>
        <h3>Add a person</h3>
        <div class="row">
          <label>Name<input name="username" autocomplete="off" required></label>
          <label>Password<input name="password" type="text" autocomplete="new-password" required></label>
          <button class="btn btn-primary" type="submit">Add person</button>
        </div>
        <p class="form-error" role="alert" hidden></p>
      </form>
    </section>
    ${backupsPanelHTML(saves)}
    ${updatesPanelHTML(update, lib)}
  </section>`;
  wireBackups(main, () => renderAdmin(main));
  wireUpdates(main, () => renderAdmin(main), update);

  const fail = (el, message) => { el.textContent = message; el.hidden = false; };
  const patch = async (body, errorBox) => {
    try {
      const updated = await api("/library", { method: "PATCH", body });
      saved();
      return updated;
    } catch (e) {
      if (errorBox) fail(errorBox, e.message); else saved(e.message);
      return null;
    }
  };

  main.querySelector("[data-name]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const updated = await patch({ name: e.target.name.value });
    if (updated) {
      state.libraryName = updated.name;
      const brand = document.querySelector(".brand");
      if (brand) brand.textContent = updated.name || "Loft";
      document.title = updated.name || "Loft";
    }
  });
  main.querySelectorAll("[data-key-form]").forEach((form) => {
    const name = form.dataset.keyForm;
    const error = main.querySelector(`[data-key-error="${name}"]`);
    const save = async (value) => {
      error.hidden = true;
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      button.textContent = "Checking…";  // the key is tried once before it's kept
      const ok = await patch({ [KEY_FIELDS[name]]: value }, error);
      button.disabled = false;
      button.textContent = "Save";
      if (ok) renderAdmin(main);
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (form.elements.key.value.trim()) save(form.elements.key.value);
    });
    form.querySelector("[data-key-remove]")?.addEventListener("click", () => save(""));
  });
  main.querySelectorAll("[data-lib]").forEach((c) => c.addEventListener("change", async () => {
    if (!(await patch({ [c.dataset.lib]: c.checked }))) c.checked = !c.checked;
    else if (c.dataset.lib === "online_lookups") renderAdmin(main);  // the switch below it follows
  }));

  main.querySelectorAll("[data-join]").forEach((li) => {
    const id = li.dataset.join;
    li.querySelector("[data-join-yes]").addEventListener("click", async () => {
      try { await api(`/join-requests/${id}/approve`, { method: "POST" }); renderAdmin(main); }
      catch (e) { fail(main.querySelector("[data-people-error]"), e.message); }
    });
    li.querySelector("[data-join-no]").addEventListener("click", async () => {
      try { await api(`/join-requests/${id}`, { method: "DELETE" }); renderAdmin(main); }
      catch (e) { fail(main.querySelector("[data-people-error]"), e.message); }
    });
  });

  // Sections: edited here as a list, saved together.
  let list = sections.sections.map((s) => ({ name: s.name, tags: s.tags.join(", "), count: s.count }));
  let lastRow = Math.max(0, list.length - 1);
  const box = main.querySelector("[data-sections]");
  const sectionError = main.querySelector("[data-section-error]");
  const drawSections = () => {
    box.innerHTML = list.map((s, i) => `<li data-row="${i}">
      <input class="section-name" data-k="name" value="${esc(s.name)}" maxlength="40" aria-label="Section name" placeholder="Name">
      <input class="section-tags" data-k="tags" value="${esc(s.tags)}" aria-label="Tags for ${esc(s.name || "this section")}" placeholder="Tags, separated by commas">
      <span class="muted section-count">${s.count == null ? "" : `${s.count} ${s.count === 1 ? "book" : "books"}`}</span>
      <span class="section-moves">
        <button class="icon-btn" type="button" data-move-row="-1" aria-label="Move ${esc(s.name)} up" ${i === 0 ? "disabled" : ""}>${icon("up")}</button>
        <button class="icon-btn" type="button" data-move-row="1" aria-label="Move ${esc(s.name)} down" ${i === list.length - 1 ? "disabled" : ""}>${icon("down")}</button>
        <button class="icon-btn" type="button" data-drop-row aria-label="Remove ${esc(s.name)}">×</button>
      </span></li>`).join("");
  };
  drawSections();
  box.addEventListener("input", (e) => {
    const row = e.target.closest("[data-row]");
    if (row) { list[row.dataset.row][e.target.dataset.k] = e.target.value; lastRow = Number(row.dataset.row); }
  });
  box.addEventListener("focusin", (e) => { const row = e.target.closest("[data-row]"); if (row) lastRow = Number(row.dataset.row); });
  box.addEventListener("click", (e) => {
    const row = e.target.closest("[data-row]");
    if (!row) return;
    const i = Number(row.dataset.row);
    const move = e.target.closest("[data-move-row]");
    if (move) {
      const j = i + Number(move.dataset.moveRow);
      [list[i], list[j]] = [list[j], list[i]];
      lastRow = j;
    } else if (e.target.closest("[data-drop-row]")) {
      list.splice(i, 1);
      lastRow = Math.max(0, Math.min(lastRow, list.length - 1));
    } else return;
    drawSections();
  });
  main.querySelector("[data-section-add]").addEventListener("click", () => {
    list.push({ name: "", tags: "", count: null });
    lastRow = list.length - 1;
    drawSections();
    box.querySelector(`[data-row="${lastRow}"] .section-name`).focus();
  });
  main.querySelectorAll("[data-tag]").forEach((chip) => chip.addEventListener("click", () => {
    if (!list.length) list.push({ name: chip.dataset.tag, tags: "", count: null });
    const row = list[Math.min(lastRow, list.length - 1)];
    const tags = row.tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (!tags.includes(chip.dataset.tag)) row.tags = [...tags, chip.dataset.tag].join(", ");
    chip.closest("li").remove();
    drawSections();
  }));
  main.querySelector("[data-section-save]").addEventListener("click", async () => {
    sectionError.hidden = true;
    const body = list.filter((s) => s.name.trim() || s.tags.trim())
      .map((s) => ({ name: s.name, tags: s.tags.split(",").map((t) => t.trim()).filter(Boolean) }));
    if (await patch({ sections: body }, sectionError)) renderAdmin(main);
  });
  main.querySelector("[data-section-reset]")?.addEventListener("click", async () => {
    if (await patch({ sections: null }, sectionError)) renderAdmin(main);
  });

  const dirError = main.querySelector("[data-dir-error]");
  main.querySelectorAll("[data-upload-dir]").forEach((b) => b.addEventListener("click", async () => {
    if (await patch({ upload_dir: b.dataset.uploadDir }, dirError)) renderAdmin(main);
  }));
  main.querySelectorAll("[data-remove-dir]").forEach((b) => b.addEventListener("click", async () => {
    const dir = b.dataset.removeDir;
    if (!confirm(`Take ${dir} out of the library?\n\nIts books leave Loft, along with everyone’s reading progress, bookmarks and shelf places in them. The files themselves aren’t touched.`)) return;
    if (await patch({ books_dirs: lib.books_dirs.filter((d) => d !== dir) }, dirError)) renderAdmin(main);
  }));
  main.querySelector("[data-add-dir]").addEventListener("submit", async (e) => {
    e.preventDefault();
    dirError.hidden = true;
    const path = e.target.path.value.trim();
    if (!path) return;
    if (await patch({ books_dirs: [...lib.books_dirs, path] }, dirError)) {
      await api("/scan", { method: "POST" }).catch(() => {});
      renderAdmin(main);
    }
  });
  main.querySelector("[data-interval]").addEventListener("change", (e) => patch({ scan_interval_minutes: Number(e.target.value) }));

  main.querySelector("[data-rescan]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    await api("/scan", { method: "POST" });
    const status = main.querySelector("[data-scan-status]");
    status.textContent = "Scanning…";
    const poll = setInterval(async () => {
      if (!document.body.contains(status)) return clearInterval(poll);
      const s = await api("/scan").catch(() => null);
      if (!s || s.running) return;
      clearInterval(poll);
      status.textContent = scanText(s);
      e.target.disabled = false;
    }, 1500);
  });

  const peopleError = main.querySelector("[data-people-error]");
  main.querySelectorAll("[data-user]").forEach((row) => {
    const id = Number(row.dataset.user);
    const name = row.querySelector(".person").firstChild.textContent;
    row.querySelector("[data-admin]")?.addEventListener("click", async (e) => {
      const admin = e.target.dataset.admin === "true";
      if (id === state.me.id && !confirm("Make yourself a member? You won’t be able to change library settings any more.")) return;
      try {
        await api(`/users/${id}`, { method: "PATCH", body: { admin } });
        if (id === state.me.id) { state.me = null; location.hash = "#/"; return; }
        renderAdmin(main);
      } catch (err) { fail(peopleError, err.message); }
    });
    row.querySelector("[data-remove]")?.addEventListener("click", async () => {
      if (!confirm(`Remove ${name}? They won’t be able to sign in any more, and their progress and shelves go.`)) return;
      try { await api(`/users/${id}`, { method: "DELETE" }); renderAdmin(main); }
      catch (err) { fail(peopleError, err.message); }
    });
    const reset = row.querySelector(".reset-form");
    row.querySelector("[data-reset]")?.addEventListener("click", () => { reset.hidden = !reset.hidden; if (!reset.hidden) reset.password.focus(); });
    reset.addEventListener("submit", async (e) => {
      e.preventDefault();
      const error = reset.querySelector(".form-error");
      error.hidden = true;
      try {
        await api(`/users/${id}/password`, { method: "POST", body: { password: reset.password.value } });
        reset.hidden = true;
        reset.reset();
        saved(`New password set. ${name} is signed out everywhere.`);
      } catch (err) { fail(error, err.message); }
    });
  });

  const form = main.querySelector(".add-person");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = form.querySelector(".form-error");
    error.hidden = true;
    try {
      await api("/users", { method: "POST", body: { username: form.username.value, password: form.password.value } });
      renderAdmin(main);
    } catch (err) { fail(error, err.message); }
  });
}
