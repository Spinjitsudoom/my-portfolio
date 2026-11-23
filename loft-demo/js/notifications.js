// The bell: how many notifications you haven't seen, and the list of them.
import { api, esc } from "./api.js";

function ago(seconds) {
  const s = Math.max(0, Date.now() / 1000 - seconds);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
}

// Put the unread count on the bell (if there's a bell on screen).
export async function refreshBell() {
  const bell = document.querySelector("[data-bell]");
  if (!bell) return;
  try {
    const { unread } = await api("/notifications");
    const badge = bell.querySelector(".bell-count");
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = !unread;
    bell.setAttribute("aria-label", unread ? `Notifications, ${unread} new` : "Notifications");
  } catch { /* offline, or signed out: leave it */ }
}

export async function renderNotifications(main) {
  const { items } = await api("/notifications");
  main.innerHTML = `<section class="page narrow">
    <header class="page-head"><h1>Notifications</h1></header>
    ${items.length ? `<ul class="notices">${items.map((n) => `<li class="${n.read ? "" : "is-new"}">
        <a href="${esc(n.link || "#/")}"><span class="notice-text">${esc(n.text)}</span><span class="notice-when">${ago(n.at)}</span></a></li>`).join("")}</ul>`
      : `<div class="empty"><p>Nothing yet. You’ll hear here when a book you asked for arrives, when someone replies to you, and the like.</p></div>`}
  </section>`;
  if (items.some((n) => !n.read)) {
    await api("/notifications/read", { method: "POST" }).catch(() => {});
    refreshBell();
  }
}
