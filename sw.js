// Service worker: guarda la app para que abra sin internet.
// Tus datos los guarda Firestore en el propio celular; aquí solo se guardan los archivos de la app.
const VERSION = "mis-deudas-v19";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La página: primero internet (para recibir actualizaciones), si no hay, la copia guardada.
  // "no-cache" evita la copia de 10 minutos que guarda el navegador, así siempre llega la versión más nueva.
  if (url.origin === location.origin && (req.mode === "navigate" || url.pathname.endsWith("/index.html"))) {
    e.respondWith(fetch(url.href, { cache: "no-cache", credentials: "same-origin" }).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put("./index.html", copy)); return res; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // Íconos y manifiesto: copia guardada
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }
  // Librería de Firebase y tipografías: copia guardada y se actualiza en segundo plano
  const cdn = (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (cdn) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Todo lo demás (Firestore, inicio de sesión) va directo a internet
});

// ---------- Recordatorios ----------
// El servidor manda un aviso vacío; aquí se pide el texto de los recordatorios de hoy y se muestran.
const PUSH_URL = "https://mis-deudas-extract.jorgereyesc.workers.dev";
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let avisos = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const hash = b64u(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint)));
      const r = await fetch(PUSH_URL + "/push/hoy?e=" + hash, { cache: "no-store" });
      avisos = (await r.json()).avisos || [];
    } catch (err) {}
    if (!avisos.length) avisos = [{ titulo: "Mis Deudas", cuerpo: "Tienes pagos próximos. Abre la app para verlos." }];
    for (const [i, a] of avisos.slice(0, 4).entries())
      await self.registration.showNotification(a.titulo, { body: a.cuerpo, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png", tag: "md-" + i + "-" + a.titulo, data: { url: "./#pagos" } });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    const w = ws.find(c => c.url.includes("/mis-deudas/"));
    if (w) { w.focus(); return w.navigate ? w.navigate("./#pagos") : null; }
    return self.clients.openWindow("./#pagos");
  }));
});
