// Loft's web app: a small hash router that draws one screen at a time into #app.
import { api, esc, icon } from "./api.js";
import { renderLogin } from "./login.js";
import { renderHome } from "./home.js";
import { renderGrid } from "./grid.js";
import { renderBook } from "./book.js";
import { renderAdmin } from "./admin.js";
import { renderAdd } from "./add.js";
import { renderCheck } from "./check.js";
import { renderReader } from "./reader.js";
import "./flow.js";
import "./fixed.js";
import { renderSettings } from "./settings.js";
import { applyLook, loadPrefs } from "./prefs.js";
import * as offline from "./offline.js";
import { needsServer, renderOfflineBook, renderOfflineHome } from "./downloads.js";
import { refreshBell, renderNotifications } from "./notifications.js";
import { renderStacks } from "./stacks.js";
import { renderFill } from "./fill.js";
import { renderFilled } from "./filled.js";
import { maybeShowWhatsNew } from "./whatsnew.js";

const app = document.getElementById("app");
export const state = { me: null, libraryName: "", version: "" };
let whatsNewAsked = false;

const ME = "loft-me";  // who was signed in here last: downloaded books open for them offline

function topbar(query = "") {
  if (offline.isOffline()) {
    return `<header class="topbar">
      <a class="brand" href="#/">${esc(state.libraryName || "Loft")}</a>
      <p class="offline-note" role="status">Offline<span class="offline-more">: showing the books on this device</span></p>
    </header>`;
  }
  return `<header class="topbar">
    <a class="brand" href="#/">${esc(state.libraryName || "Loft")}</a>
    <form class="search" role="search" data-search>
      ${icon("search")}
      <input type="search" name="q" value="${esc(query)}" placeholder="Search books" aria-label="Search the library" autocomplete="off">
    </form>
    <nav class="top-actions">
      <a class="icon-btn" href="#/stacks" title="The stacks: browse the library" aria-label="Browse the library">${icon("shelf")}</a>
      <a class="icon-btn bell" href="#/notifications" data-bell title="Notifications" aria-label="Notifications">${icon("bell")}<span class="bell-count" hidden></span></a>
      <a class="icon-btn" href="#/settings" title="Your settings" aria-label="Your settings">${icon("person")}</a>
      <a class="icon-btn" href="#/add" title="${state.me && state.me.admin ? "Add books" : "Submit or request books"}" aria-label="${state.me && state.me.admin ? "Add books" : "Submit or request books"}">${icon("plus")}</a>
      ${state.me && state.me.admin ? `<a class="icon-btn" href="#/admin" title="Library settings" aria-label="Library settings">${icon("gear")}</a>` : ""}
      <button class="icon-btn topbar-signout" type="button" data-signout title="Sign out" aria-label="Sign out">${icon("out")}</button>
    </nav>
  </header>`;
}

function parse() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { parts: path.split("/").filter(Boolean), params: new URLSearchParams(qs || "") };
}

let renderToken = 0;
let cleanup = null;

async function route() {
  const token = ++renderToken;
  const { parts, params } = parse();
  const [page, arg] = parts;
  if (cleanup) { cleanup(); cleanup = null; }

  if (page === "login" || page === "setup") {
    return renderLogin(app, page === "setup");
  }
  if (!state.me) {
    try {
      const status = await api("/status");
      if (status.setup_needed) { location.hash = "#/setup"; return; }
      state.libraryName = status.name || "";
      state.version = status.version || "";
      document.title = state.libraryName || "Loft";
      state.me = await api("/me");
      offline.setOffline(false);
      try { localStorage.setItem(ME, JSON.stringify({ ...state.me, libraryName: state.libraryName })); } catch { /* private window */ }
      applyLook(await loadPrefs(true));
      offline.setUser(state.me.id);
      offline.flush().then(() => offline.resume());
    } catch (e) {
      // The server can't be reached: whoever was signed in here last can still read what they downloaded.
      let kept = null;
      try { kept = JSON.parse(localStorage.getItem(ME) || "null"); } catch { /* none */ }
      if (!offline.unreachable(e) || !kept) {
        if (offline.unreachable(e)) {
          app.innerHTML = `<main class="reader-message"><div><p>Loft can’t reach its server just now.</p>
            <button class="btn" type="button" onclick="location.reload()">Try again</button></div></main>`;
        } else location.hash = "#/login";
        return;
      }
      state.me = kept;
      state.libraryName = kept.libraryName || "";
      offline.setUser(kept.id);
      offline.setOffline(true);
      loadPrefs().then(applyLook).catch(() => {});
    }
  }
  if (token !== renderToken) return;
  // After an update, once: what's new (not over a book being read; it waits for the next page).
  if (page !== "read" && state.version && !offline.isOffline() && !whatsNewAsked) {
    whatsNewAsked = true;
    maybeShowWhatsNew({ version: state.version, admin: !!state.me.admin });
  }

  if (page === "read" && arg) {
    try {
      const done = await renderReader(app, Number(arg), params, () => token === renderToken);
      if (token === renderToken) cleanup = done; else done();
    } catch (e) {
      if (e.status !== 401) app.innerHTML = `<main class="reader-message"><div><p>${esc(e.message)}</p><a class="btn" href="#/">Back to the library</a></div></main>`;
    }
    return;
  }

  const query = page === "search" ? params.get("q") || "" : "";
  app.innerHTML = `${topbar(query)}<main id="main" tabindex="-1"></main>`;
  const main = app.querySelector("#main");
  wireTopbar();
  refreshBell();
  window.scrollTo(0, 0);

  if (offline.isOffline()) {
    if (!page) await renderOfflineHome(main);
    else if (page === "book" && arg) await renderOfflineBook(main, Number(arg));
    else needsServer(main);
    return;
  }

  try {
    if (!page) await renderHome(main);
    else if (page === "book" && arg) await renderBook(main, Number(arg), params);
    else if (page === "all") await renderGrid(main, { kind: params.get("kind"), value: params.get("value"), title: params.get("title") });
    else if (page === "search") await renderGrid(main, { query });
    else if (page === "admin" && state.me.admin) await renderAdmin(main);
    else if (page === "add") await renderAdd(main, params);
    else if (page === "notifications") await renderNotifications(main);
    else if (page === "stacks") await renderStacks(main, params);
    else if (page === "check" && state.me.admin) await renderCheck(main);
    else if (page === "fill" && state.me.admin) await renderFill(main, params);
    else if (page === "filled" && state.me.admin) await renderFilled(main);
    else if (page === "settings") await renderSettings(main);
    else main.innerHTML = `<div class="empty"><p>There’s nothing here.</p><a class="btn" href="#/">Back to the library</a></div>`;
  } catch (e) {
    if (e.status === 401) return;
    if (offline.unreachable(e) && token === renderToken) {
      offline.setOffline(true);
      route();
      return;
    }
    main.innerHTML = `<div class="empty"><p>${esc(e.message)}</p><button class="btn" type="button" onclick="location.reload()">Try again</button></div>`;
  }
}

function wireTopbar() {
  const form = app.querySelector("[data-search]");
  if (!form) return;  // offline: the top bar has no search or sign-out
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = form.q.value.trim();
    if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
  });
  app.querySelector("[data-signout]").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    state.me = null;
    location.hash = "#/login";
  });
}

export function signedIn(user) {
  state.me = null;  // the router loads you and your settings afresh
  location.hash = "#/";
}

// While the server can't be reached, look for it now and then; when it's back, send what was kept
// meanwhile, pick up downloads, and redraw (except in the reader, which carries on as it is).
let looking = null;
window.addEventListener("offline-changed", (e) => {
  clearInterval(looking);
  if (!e.detail.offline) return;
  looking = setInterval(async () => {
    try {
      const r = await fetch("/api/status", { credentials: "same-origin" });
      if (!r.ok) return;
    } catch { return; }
    clearInterval(looking);
    offline.setOffline(false);
    await offline.flush();
    if (parse().parts[0] !== "read") { state.me = null; route(); }
    offline.resume();
  }, 15000);
});
window.addEventListener("online", () => { if (offline.isOffline()) window.dispatchEvent(new CustomEvent("offline-changed", { detail: { offline: true } })); });

// Covers of books kept on this device get a small mark (on the shelves and in grids).
async function markKept(root = document) {
  try {
    const kept = await offline.keptIds();
    root.querySelectorAll(".book[data-book]").forEach((el) => el.classList.toggle("is-kept", kept.has(Number(el.dataset.book))));
  } catch { /* storage unavailable: no marks */ }
}
window.addEventListener("downloads-changed", () => markKept());
new MutationObserver(() => { clearTimeout(markKept.t); markKept.t = setTimeout(() => markKept(), 120); })
  .observe(app, { childList: true, subtree: true });

// New notifications show on the bell within a minute.
setInterval(() => { if (state.me && !offline.isOffline() && document.visibilityState === "visible") refreshBell(); }, 60000);

// Keep the app's own files for opening offline, where the browser allows it (https, or this computer).
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

window.addEventListener("hashchange", route);
route();
