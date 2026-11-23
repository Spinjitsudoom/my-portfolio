// Loft demo: serves what the app loads straight into pages (covers, page images, book files) from the
// recording in demo/, since there's no Loft server behind this demo. JSON answers come from
// demo/mock.js, in the page itself.
const SCOPE = new URL(self.registration.scope);
const DEMO = new URL("demo/", SCOPE).href;
let names = null;   // file id -> the book's file name, for downloads

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function fileName(id) {
  if (!names) {
    try { names = Object.fromEntries(Object.entries((await (await fetch(DEMO + "db.json")).json()).files).map(([k, v]) => [k, v.name])); }
    catch { names = {}; }
  }
  return names[id] || `book-${id}`;
}

function mapped(url) {
  let x;
  const p = url.pathname;
  if ((x = p.match(/^\/api\/books\/(\d+)\/cover$/))) return { src: `${DEMO}covers/${x[1]}.jpg` };
  if ((x = p.match(/^\/api\/files\/(\d+)\/pages\/(\d+)$/))) return { src: `${DEMO}pages/${x[1]}-${x[2]}.jpg` };
  if ((x = p.match(/^\/api\/files\/(\d+)\/piece$/))) return { src: `${DEMO}pages/${x[1]}-${url.searchParams.get("src") || 0}.jpg` };
  if ((x = p.match(/^\/api\/files\/(\d+)\/chapters\/(\d+)$/))) return { src: `${DEMO}chapters/${x[1]}-${x[2]}.html` };
  if ((x = p.match(/^\/api\/uploads\/[^/]+\/cover$/))) return { src: `${DEMO}covers/upload.jpg` };
  if ((x = p.match(/^\/api\/files\/(\d+)$/))) return { src: null, file: x[1] };
  if (p === "/whatsnew.json") return { src: new URL("whatsnew.json", SCOPE).href };
  return null;
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== SCOPE.origin || e.request.method !== "GET") return;
  const m = mapped(url);
  if (!m) return;
  e.respondWith((async () => {
    if (m.file) {
      const name = await fileName(m.file);
      const ext = name.split(".").pop();
      const r = await fetch(`${DEMO}files/${m.file}.${ext}`);
      return new Response(r.body, { status: r.status, headers: {
        "content-type": r.headers.get("content-type") || "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
    }
    return fetch(m.src);
  })());
});
