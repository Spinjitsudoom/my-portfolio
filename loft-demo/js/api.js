// Talking to the Loft server, and the one helper every screen needs: escaping text into HTML.

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  if (r.status === 401 && !["/login", "/setup", "/me"].includes(path)) {
    location.hash = "#/login";
  }
  if (!r.ok) {
    const detail = json && json.detail;
    const message = typeof detail === "string" ? detail : "Something went wrong talking to the server";
    throw new ApiError(message, r.status);
  }
  return json;
}

// Send a file as the request body (covers, uploads). Returns the JSON reply.
export async function putRaw(path, file) {
  const r = await fetch("/api" + path, {
    method: "PUT", credentials: "same-origin", body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  const json = (r.headers.get("content-type") || "").includes("json") ? await r.json() : null;
  if (r.status === 401) location.hash = "#/login";
  if (!r.ok) throw new ApiError(json && typeof json.detail === "string" ? json.detail : "That didn’t work; try again", r.status);
  return json;
}

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);

export const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function authorLine(authors) {
  if (!authors || !authors.length) return "";
  if (authors.length <= 2) return authors.join(" and ");
  return `${authors[0]} and ${authors.length - 1} others`;
}

export function seriesLine(book) {
  if (!book.series) return "";
  const n = book.series_index;
  return n == null ? book.series : `Book ${Number.isInteger(n) ? n : n.toFixed(1)} of ${book.series}`;
}
