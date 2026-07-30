// CREA Panel Admin — service worker mínimo, solo para habilitar "instalar app".
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
