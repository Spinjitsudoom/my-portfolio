// "What's new": after Loft is updated, once, a pop-up with what's new and what's fixed (from
// whatsnew.json, one entry per release, newest first). A device that has never opened Loft
// skips it. Library settings and Your settings show it again any time; before an update,
// Library settings also shows the next version's notes, which the server fetched with it.
import { esc } from "./api.js";

const SEEN = "loft-whatsnew";   // the last version whose notes were shown here
const knownDevice = (() => {    // read before main.js signs anyone in: was Loft used here before?
  try { return typeof localStorage !== "undefined" && localStorage.getItem("loft-me") !== null; } catch { return false; }
})();

const parts = (v) => String(v || "0").split(".").map((n) => parseInt(n, 10) || 0);
export function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

/** The releases after `seen`, up to `current`, newest first (at most three). */
export function notesSince(all, seen, current) {
  return all.filter((n) => newer(n.version, seen) && !newer(n.version, current)).slice(0, 3);
}

/** What to show when Loft opens: nothing on a new device or without an update, otherwise
 *  the releases since the last ones shown (or just this one, if Loft never showed any here). */
export function toShowOnOpen(all, seen, current, known) {
  if (!current) return [];
  if (!seen) return known ? all.filter((n) => n.version === current) : [];
  return newer(current, seen) ? notesSince(all, seen, current) : [];
}

/** A release's items for this person: members don't see what only admins can use (an item or
 *  fix marked "admin"). Fixes come back as plain text. */
export function forReader(n, admin) {
  const fixed = (n.fixed || []).filter((f) => admin || typeof f === "string" || !f.admin)
    .map((f) => (typeof f === "string" ? f : f.text));
  return { ...n, new: (n.new || []).filter((i) => admin || !i.admin), fixed };
}

async function localNotes() {
  try {
    const r = await fetch("/whatsnew.json", { cache: "no-cache" });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

function open(releases, { admin, heading, labels = {} }) {
  // What this person would notice, three releases at most.
  const list = releases.map((n) => forReader(n, admin)).filter((n) => n.new.length || n.fixed.length).slice(0, 3);
  const section = (n) => `
    <section class="wn-release">
      <h3>Loft ${esc(n.version)}${labels[n.version] ? ` <span class="wn-label">${esc(labels[n.version])}</span>` : ""}</h3>
      ${n.new.length ? `<h4>New</h4><ul class="wn-new">${n.new.map((i) => `<li><b>${esc(i.title)}</b><span>${esc(i.text)}</span></li>`).join("")}</ul>` : ""}
      ${n.fixed.length ? `<h4>Fixed</h4><ul class="wn-fixed">${n.fixed.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    </section>`;
  const d = document.createElement("dialog");
  d.className = "whatsnew";
  d.setAttribute("aria-labelledby", "wn-title");
  d.innerHTML = `
    <form method="dialog">
      <header class="wn-head"><img class="wn-mark" src="icons/icon.svg" alt="" width="56" height="56">
        <h2 id="wn-title">${esc(heading)}</h2></header>
      <div class="wn-body">${list.length ? list.map(section).join("")
        : `<p class="muted">Nothing you’d notice: this version’s changes are behind the scenes.</p>`}</div>
      <div class="wn-actions"><button class="btn btn-primary" value="ok">Got it</button></div>
    </form>`;
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });   // a tap outside closes it
  d.showModal();
  d.querySelector(".btn-primary").focus();
}

/** When Loft opens: after an update, show what changed, once. */
export async function maybeShowWhatsNew({ version, admin }) {
  let seen = null;
  try { seen = localStorage.getItem(SEEN); } catch { return; }   // nowhere to remember it: never nag
  if (!version || (seen && !newer(version, seen))) return;
  const list = toShowOnOpen(await localNotes(), seen, version, knownDevice);
  try { localStorage.setItem(SEEN, version); } catch { /* fine */ }
  const shown = list.map((n) => forReader(n, admin)).filter((n) => n.new.length || n.fixed.length);
  if (shown.length && !document.querySelector("dialog[open]")) {
    open(list, { admin, heading: list.length > 1 ? "Loft has been updated" : "What’s new" });
  }
}

/** From settings: this version's notes and the two before it, after any newer version's
 *  (`upcoming`, from the update check; `ready` when it's downloaded and waiting). */
export async function showWhatsNew({ admin, current, upcoming = [], ready = false }) {
  const here = (await localNotes()).filter((n) => !newer(n.version, current));
  const labels = Object.fromEntries(upcoming.map((n) => [n.version, ready ? "ready to install" : "coming"]));
  if (here[0]?.version === current && upcoming.length) labels[current] = "this version";
  open([...upcoming, ...here], { admin, heading: "What’s new", labels });
}
