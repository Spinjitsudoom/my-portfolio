// Library settings → Backups: how often Loft backs up the library, where to, how many to keep,
// Back up now, and each backup to download or restore (src/loft/backups.py).
import { api, esc } from "./api.js";
import { ago } from "./admin.js";
import { saved } from "./settings.js";

const EVERY = [["day", "Every day"], ["week", "Every week"], ["off", "Off"]];
const KEEP = [[0, "A week of daily backups, then weekly"], [5, "The newest 5"], [10, "The newest 10"], [30, "The newest 30"]];

const when = (at) => new Date(at * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const size = (bytes) => bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`;

function lastLine(b) {
  if (b.error) return "";
  if (b.last_at) return `Last backup ${ago(b.last_at)}.`;
  return b.every === "off" ? "Backups are off." : "No backups yet. The first is made a few minutes after Loft starts.";
}

export function backupsPanelHTML(b) {
  const options = (list, value) => list.map(([v, label]) => `<option value="${v}" ${v === value ? "selected" : ""}>${label}</option>`).join("");
  return `<section class="panel" data-backups>
    <h2>Backups</h2>
    <p class="muted">Everything a rescan can’t bring back: people, reading progress, shelves, bookmarks, edits and filled-in details, covers you chose, and books waiting for approval.</p>
    <p class="backup-last" data-backup-last>${esc(lastLine(b))}</p>
    ${b.error ? `<p class="form-error" role="alert">${esc(b.error)}</p>` : ""}
    <div class="backup-choices">
      <label class="select-label">Back up <select data-backup="backup_every">${options(EVERY, b.every)}</select></label>
      <label class="select-label">Keep <select data-backup="backup_keep">${options(KEEP, b.keep)}</select></label>
    </div>
    <h3>Folder</h3>
    <p class="backup-folder"><code>${esc(b.folder)}</code></p>
    <form class="inline-form" data-backup-folder novalidate>
      <label>Back up to<input name="path" placeholder="/path/on/another/drive" autocomplete="off" spellcheck="false"></label>
      <button class="btn" type="submit">Change folder</button>
      ${b.folder_is_default ? "" : `<button class="btn" type="button" data-backup-default>Use Loft’s data folder</button>`}
    </form>
    <p class="field-hint">Another drive is safer: a backup on the same disk goes with it. Loft leaves a small file there to know the drive is connected; if it isn’t, Loft doesn’t back up anywhere else and tells you. Backups hold the lookup keys saved above, so pick a folder only you can open.</p>
    <p class="form-error" data-backup-error role="alert" hidden></p>
    <div class="update-actions"><button class="btn btn-primary" type="button" data-backup-now>Back up now</button></div>
    ${b.backups.length ? `<ul class="folders backup-list">${b.backups.map((x) => `<li>
      <span class="backup-when">${esc(when(x.at))}<span class="muted">${size(x.size)}${x.before_restore ? ", made before a restore" : ""}${x.mine ? "" : ", made by another Loft"}</span></span>
      <span class="folder-actions">
        <a class="btn btn-small" href="/api/backups/${encodeURIComponent(x.name)}" download>Download</a>
        <button class="btn btn-small" type="button" data-backup-restore="${esc(x.name)}" data-when="${esc(when(x.at))}">Restore</button>
      </span></li>`).join("")}</ul>` : ""}
  </section>`;
}

export function wireBackups(root, redraw) {
  const panel = root.querySelector("[data-backups]");
  if (!panel) return;
  const error = panel.querySelector("[data-backup-error]");
  const fail = (message) => { error.textContent = message; error.hidden = false; };
  const save = async (body) => {
    error.hidden = true;
    try { await api("/library", { method: "PATCH", body }); saved(); redraw(); }
    catch (e) { fail(e.message); }
  };

  panel.querySelectorAll("[data-backup]").forEach((s) => s.addEventListener("change", () => {
    const key = s.dataset.backup;
    save({ [key]: key === "backup_keep" ? Number(s.value) : s.value });
  }));
  panel.querySelector("[data-backup-folder]").addEventListener("submit", (e) => {
    e.preventDefault();
    const path = e.target.path.value.trim();
    if (path) save({ backup_dir: path });
  });
  panel.querySelector("[data-backup-default]")?.addEventListener("click", () => save({ backup_dir: "" }));

  panel.querySelector("[data-backup-now]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Backing up…";
    try { await api("/backups", { method: "POST" }); saved("Backed up"); redraw(); }
    catch (err) { fail(err.message); e.target.disabled = false; e.target.textContent = "Back up now"; }
  });

  panel.querySelectorAll("[data-backup-restore]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm(`Put the library back as it was on ${b.dataset.when}?\n\nWhat’s there now is backed up first, so this can be undone. Everyone, you included, signs in again afterwards.`)) return;
    b.disabled = true;
    b.textContent = "Restoring…";
    try {
      await api(`/backups/${encodeURIComponent(b.dataset.backupRestore)}/restore`, { method: "POST" });
      location.reload();   // everyone signs in again, and everything on the page may have changed
    } catch (err) { fail(err.message); b.disabled = false; b.textContent = "Restore"; }
  }));
}
