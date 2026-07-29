// CREA Panel Admin — service worker mínimo, solo para habilitar "instalar app".
// ponytail: pass-through puro, sin cache offline; agregar cache si se pide soporte sin conexión.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
