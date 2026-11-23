// Library settings → Loft version: which version this is, whether a newer one is out, and (for
// the standalone server) Restart to update once it's downloaded. Restarting reloads the app when
// the new version answers.
import { api, esc } from "./api.js";
import { ago } from "./admin.js";
import { showWhatsNew } from "./whatsnew.js";

function line(u) {
  if (u.ready) return `<strong>Loft ${esc(u.latest)} is ready.</strong> Restarting takes a few seconds; anyone reading carries on where they were.`;
  if (u.downloading) return `Loft ${esc(u.latest)} is out and downloading…`;
  if (u.newer && !u.can_install) return `<strong>Loft ${esc(u.latest)} is out.</strong> Update it the way it was installed (for Docker: <code>docker compose pull && docker compose up -d</code>).`;
  if (u.newer) return `Loft ${esc(u.latest)} is out. It will download by itself.`;
  if (u.error) return esc(u.error);
  return u.checked_at ? `This is the newest version (checked ${ago(u.checked_at)}).` : "Not checked yet.";
}

export function updatesPanelHTML(u, lib) {
  return `<section class="panel" data-updates>
    <h2>Loft version</h2>
    <p class="update-line"><span class="update-version">Loft ${esc(u.current)}</span> <span data-update-line>${line(u)}</span></p>
    <div class="update-actions">
      ${u.ready ? `<button class="btn btn-primary" type="button" data-update-install>Restart to update</button>` : ""}
      <button class="btn btn-small" type="button" data-update-check>Check now</button>
      <button class="btn btn-small" type="button" data-whatsnew>What’s new</button>
    </div>
    <p class="form-error" data-update-error role="alert" hidden></p>
    <label class="switch"><input type="checkbox" data-lib="check_updates" ${lib.check_updates ? "checked" : ""}>
      <span>Check for new versions</span></label>
    <p class="field-hint indent">Once a day Loft asks GitHub whether there’s a newer release (nothing about your library is sent).
      ${u.can_install ? "A new version downloads by itself, then waits for you to restart." : ""}</p>
  </section>`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function wireUpdates(root, redraw, u) {
  const panel = root.querySelector("[data-updates]");
  if (!panel) return;
  panel.querySelector("[data-whatsnew]").addEventListener("click", () =>
    showWhatsNew({ admin: true, current: u.current, upcoming: u.newer ? u.notes || [] : [], ready: u.ready }));
  const error = panel.querySelector("[data-update-error]");
  const fail = (message) => { error.textContent = message; error.hidden = false; };

  panel.querySelector("[data-update-check]").addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Checking…";
    try {
      let u = await api("/updates/check", { method: "POST" });
      while (u.downloading && document.body.contains(panel)) {  // follow the download until it's ready
        panel.querySelector("[data-update-line]").innerHTML = line(u);
        await sleep(2000);
        u = await api("/updates");
      }
      redraw();
    } catch (err) { fail(err.message); e.target.disabled = false; e.target.textContent = "Check now"; }
  });

  panel.querySelector("[data-update-install]")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Restarting…";
    try {
      const { version } = await api("/updates/install", { method: "POST" });
      // Wait for the new version to answer, then load its web app.
      for (let i = 0; i < 90; i++) {
        await sleep(2000);
        try {
          const r = await fetch("/api/ping", { cache: "no-store" });
          if (r.ok && (await r.json()).version === version) { location.reload(); return; }
        } catch { /* still restarting */ }
      }
      fail("Loft hasn’t come back yet. Check the window or service it runs in.");
    } catch (err) { fail(err.message); e.target.disabled = false; e.target.textContent = "Restart to update"; }
  });
}
