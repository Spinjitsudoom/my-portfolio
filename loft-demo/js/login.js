import { api, esc } from "./api.js";
import { signedIn } from "./main.js";

export async function renderLogin(app, setup) {
  const status = await api("/status").catch(() => ({ setup_needed: false, name: "" }));
  if (!setup && status.setup_needed) { location.hash = "#/setup"; return; }
  const name = status.name || "";
  document.title = name || "Loft";
  app.innerHTML = `<main class="signin">
    <form class="signin-card" novalidate>
      <h1 class="brand brand-large">${esc(name || "Loft")}</h1>
      <p class="signin-lede">${setup
        ? "Create the admin account. You’ll use it to add people and look after the library."
        : "Sign in to your library."}</p>
      <label>Name<input name="username" autocomplete="username" required autofocus></label>
      <label>Password<input name="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}" required></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">${setup ? "Create admin account" : "Sign in"}</button>
      ${!setup && status.join_requests ? `<p class="signin-join">New here? <button class="link-btn" type="button" data-join>Ask to join</button></p>` : ""}
      ${(window.LoftAndroid || window.LoftDesktop) ? `<p class="signin-join"><button class="link-btn" type="button" data-change-server>Use a different server</button></p>` : ""}
    </form>
  </main>`;
  app.querySelector("[data-change-server]")?.addEventListener("click", () => (window.LoftAndroid || window.LoftDesktop).changeServer());
  const joinButton = app.querySelector("[data-join]");
  if (joinButton) joinButton.addEventListener("click", () => renderJoin(app, name));
  const form = app.querySelector("form");
  const error = form.querySelector(".form-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const user = await api(setup ? "/setup" : "/login", {
        method: "POST", body: { username: form.username.value, password: form.password.value },
      });
      signedIn({ id: user.id, username: user.username, admin: user.admin });
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      button.disabled = false;
    }
  });
}

// Asking to join: an admin says yes (the account is made) or no.
function renderJoin(app, name) {
  app.innerHTML = `<main class="signin">
    <form class="signin-card" novalidate>
      <h1 class="brand brand-large">${esc(name || "Loft")}</h1>
      <p class="signin-lede">Ask to join. An admin will look at it; once they say yes, you sign in with the name and password you choose here.</p>
      <label>Name<input name="username" autocomplete="username" required autofocus maxlength="40"></label>
      <label>Password<input name="password" type="password" autocomplete="new-password" required></label>
      <label>A note for the admin <span class="muted">(optional)</span><textarea name="note" rows="3" maxlength="500" placeholder="Who you are, so they know it’s you"></textarea></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary" type="submit">Ask to join</button>
      <p class="signin-join"><a href="#/login" class="link-btn">Back to sign in</a></p>
    </form>
  </main>`;
  const form = app.querySelector("form");
  const error = form.querySelector(".form-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await api("/join", { method: "POST", body: { username: form.username.value, password: form.password.value, note: form.note.value } });
      form.innerHTML = `<h1 class="brand brand-large">${esc(name || "Loft")}</h1>
        <p class="signin-lede">Thanks. An admin will look at your request; you can sign in as soon as they say yes.</p>
        <a class="btn" href="#/login">Back to sign in</a>`;
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      button.disabled = false;
    }
  });
}
