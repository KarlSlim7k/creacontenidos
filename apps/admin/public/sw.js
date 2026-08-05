// CREA Panel Admin — service worker mínimo: "instalar app" + Web Push.
// ponytail: pass-through puro, sin cache offline; agregar cache si se pide soporte sin conexión.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  // Solo same-origin: dejar pasar fonts.googleapis.com y demás cross-origin
  // sin tocar, evita que el refetch del SW se cheque contra connect-src en
  // vez del directive correcto (style-src/font-src) que ya los permite.
  if (new URL(e.request.url).origin === self.location.origin) {
    e.respondWith(fetch(e.request));
  }
});

// Payload lo manda lib/push.js del API: { title, body, url }. Si el parseo falla
// (payload no-JSON, o sin data en un push de prueba) cae a un texto genérico en vez
// de tronar el evento.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = {}; }
  const title = data.title || 'CREA Panel';
  const options = {
    body: data.body || '',
    icon: '/admin/assets/img/icon-192.png',
    badge: '/admin/assets/img/icon-192.png',
    data: { url: data.url || '/admin/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Click en la notificación: si ya hay una pestaña/ventana del admin abierta, la
// enfoca en vez de abrir una nueva (típico en la app instalada, no un montón de tabs).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/admin/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes('/admin'));
      if (existing) return existing.focus().then(() => existing.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
