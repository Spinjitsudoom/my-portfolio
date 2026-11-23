// Your settings: account, reading and how the library looks. Each change saves on its own.
import { api, esc, icon } from "./api.js";
import { settingsSection, wireSettingsSection } from "./downloads.js";
import { ACCENTS, loadPrefs, patchPrefs } from "./prefs.js";
import { state } from "./main.js";
import { showWhatsNew } from "./whatsnew.js";

const ROW_NAMES = { continue: "Continue reading", shelves: "Your shelves", recent: "Recently added", series: "Series", genres: "Genres" };
const ACCENT_NAMES = { brass: "Brass", sage: "Sage", dusk: "Dusk", rose: "Rose", lilac: "Lilac" };

let noteTimer;
export function saved(text = "Saved") {
  let note = document.querySelector(".saved-note");
  if (!note) {
    note = document.createElement("div");
    note.className = "saved-note";
    note.setAttribute("role", "status");
    document.body.appendChild(note);
  }
  note.textContent = text;
  note.classList.add("show");
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => note.classList.remove("show"), 1600);
}

const seg = (section, key, value, options) => `<div class="segmented" role="radiogroup">${options.map(([v, label]) =>
  `<button type="button" role="radio" aria-checked="${value === v}" data-section="${section}" data-key="${key}" data-value="${v}">${label}</button>`).join("")}</div>`;
const sw = (section, key, on, label) =>
  `<label class="switch"><input type="checkbox" data-section="${section}" data-key="${key}" ${on ? "checked" : ""}><span>${label}</span></label>`;

export async function renderSettings(main) {
  const prefs = await loadPrefs(true);
  const r = prefs.reading, l = prefs.look;
  main.innerHTML = `<section class="page narrow">
    <header class="page-head"><h1>Your settings</h1>
      <p class="muted">Signed in as ${esc(state.me.username)}. These follow you to every device.</p></header>

    <section class="settings-section">
      <h2>Reading</h2>
      <h3>Colours around the page</h3>
      <div class="swatches" role="radiogroup">${[["dark", "Dark"], ["sepia", "Sepia"], ["white", "White"], ["black", "Black"]].map(([v, label]) =>
        `<button type="button" role="radio" class="swatch swatch-${v}" aria-checked="${r.theme === v}" data-section="reading" data-key="theme" data-value="${v}"><span>${label}</span></button>`).join("")}</div>
      <h3>Pages</h3>
      ${seg("reading", "mode", r.mode, [["pages", "Turn pages"], ["scroll", "Scroll"]])}
      <h3>Page turn</h3>
      ${seg("reading", "turn_speed", r.turn_speed, [["gentle", "Gentle"], ["normal", "Normal"], ["quick", "Quick"], ["off", "Instant"]])}
      ${sw("reading", "spread", r.spread, "Two pages side by side when there’s room")}
      ${sw("reading", "left_handed", r.left_handed, "Left-handed: tap the left edge to go forward")}
    </section>

    <section class="settings-section">
      <h2>Look</h2>
      <h3>Accent colour</h3>
      <div class="accent-swatches" role="radiogroup">${Object.entries(ACCENTS).map(([k, hex]) =>
        `<button type="button" role="radio" class="accent-swatch" style="background:${hex}" aria-checked="${l.accent === k}" aria-label="${ACCENT_NAMES[k]}" title="${ACCENT_NAMES[k]}" data-section="look" data-key="accent" data-value="${k}"></button>`).join("")}</div>
      <h3>Cover size on the shelves</h3>
      ${seg("look", "cover_size", l.cover_size, [["small", "Small"], ["medium", "Medium"], ["large", "Large"]])}
      ${sw("look", "cover_titles", l.cover_titles, "Show titles under covers")}
      <h3>Home screen rows</h3>
      <ol class="home-rows">${l.home_rows.map((row, i) => `<li>
        <label class="switch"><input type="checkbox" data-row="${i}" ${row.visible ? "checked" : ""}><span>${ROW_NAMES[row.kind]}</span></label>
        <button class="icon-btn" type="button" data-move="${i}" data-by="-1" aria-label="Move ${ROW_NAMES[row.kind]} up" ${i === 0 ? "disabled" : ""}>${icon("up")}</button>
        <button class="icon-btn" type="button" data-move="${i}" data-by="1" aria-label="Move ${ROW_NAMES[row.kind]} down" ${i === l.home_rows.length - 1 ? "disabled" : ""}>${icon("down")}</button>
      </li>`).join("")}</ol>
    </section>

    ${await settingsSection()}
    ${(window.LoftAndroid || window.LoftDesktop) ? `<section class="settings-section">
      <h2>This app</h2>
      <p class="muted">Connected to <code>${esc((window.LoftAndroid || window.LoftDesktop).getServer().replace(/^https?:\/\//, ""))}</code>.</p>
      <button class="btn" type="button" data-change-server>Change server</button>
    </section>` : ""}

    <section class="settings-section">
      <h2>Loft</h2>
      <p class="muted">${state.version ? `This library runs Loft ${esc(state.version)}.` : ""}</p>
      <button class="btn" type="button" data-whatsnew>What’s new</button>
    </section>

    <section class="settings-section">
      <h2>Account</h2>
      <form class="password-form" novalidate>
        <h3>Change password</h3>
        <label>Current password<input name="current" type="password" autocomplete="current-password" required></label>
        <label>New password<input name="new" type="password" autocomplete="new-password" required></label>
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary" type="submit">Change password</button>
      </form>
      <h3>Other devices</h3>
      <p class="muted">Signs you out everywhere except here: useful after using a shared or lost device.</p>
      <button class="btn" type="button" data-signout-others style="margin-top:12px">Sign out on other devices</button>
      <h3>This device</h3>
      <button class="btn" type="button" data-signout-here style="margin-top:12px">Sign out</button>
    </section>
  </section>`;

  wireSettingsSection(main);
  main.querySelector("[data-whatsnew]").addEventListener("click", () =>
    showWhatsNew({ admin: !!state.me.admin, current: state.version }));
  main.querySelector("[data-signout-here]").addEventListener("click", async () => {
    await api("/logout", { method: "POST" }).catch(() => {});
    state.me = null;
    location.hash = "#/login";
  });
  main.querySelector("[data-change-server]")?.addEventListener("click", () => (window.LoftAndroid || window.LoftDesktop).changeServer());
  const save = async (patch) => {
    try { await patchPrefs(patch); saved(); renderSettings(main); }
    catch (e) { saved(e.message); }
  };
  main.querySelectorAll("button[data-key]").forEach((b) => b.addEventListener("click", () =>
    save({ [b.dataset.section]: { [b.dataset.key]: b.dataset.value } })));
  main.querySelectorAll("input[data-key]").forEach((c) => c.addEventListener("change", () =>
    save({ [c.dataset.section]: { [c.dataset.key]: c.checked } })));

  const rows = l.home_rows.map((row) => ({ ...row }));
  main.querySelectorAll("[data-row]").forEach((c) => c.addEventListener("change", () => {
    rows[Number(c.dataset.row)].visible = c.checked;
    save({ look: { home_rows: rows } });
  }));
  main.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
    const i = Number(b.dataset.move), j = i + Number(b.dataset.by);
    [rows[i], rows[j]] = [rows[j], rows[i]];
    save({ look: { home_rows: rows } });
  }));

  const form = main.querySelector(".password-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const error = form.querySelector(".form-error");
    error.hidden = true;
    try {
      await api("/me/password", { method: "POST", body: { current: form.current.value, new: form.new.value } });
      form.reset();
      saved("Password changed. Other devices are signed out.");
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
  main.querySelector("[data-signout-others]").addEventListener("click", async () => {
    await api("/me/signout-everywhere", { method: "POST" });
    saved("Signed out on your other devices");
  });
}
