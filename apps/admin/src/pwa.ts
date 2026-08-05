// CREA Panel Admin — registro de PWA (manifest + service worker), instalación a
// pantalla de inicio, y suscripción a Web Push (notificaciones nativas).
import { setState, adminApi } from './store';

let deferredPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;

export function isPwaInstalled(): boolean {
  const standaloneMode = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return standaloneMode || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function isIosDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function initPwa(): void {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* instalable igual sin SW activo */ });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as typeof deferredPrompt;
    setState({ pwaInstallAvailable: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setState({ pwaInstallAvailable: false });
  });
  isPushSubscribed().then((subscribed) => setState({ pushEnabled: subscribed })).catch(() => setState({ pushEnabled: false }));
}

export async function promptPwaInstall(): Promise<void> {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  setState({ pwaInstallAvailable: false });
}

// ---------- Web Push ----------
// iOS solo manda push a una PWA agregada a inicio (iOS 16.4+) — Safari nunca
// manda push a una pestaña normal. Android/desktop Chrome no tienen esa
// restricción, pero por simplicidad el toggle solo se ofrece con la app instalada
// (isPwaInstalled()), mismo criterio en las dos plataformas.

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// La clave pública VAPID viaja en base64url (RFC 4648 §5); PushManager.subscribe
// espera un Uint8Array crudo — de ahí la conversión.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

export async function enablePushNotifications(): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: 'Este navegador no soporta notificaciones push.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, error: 'Permiso de notificaciones denegado.' };
  try {
    const { publicKey } = await adminApi<{ publicKey: string | null }>('/api/admin/push/vapid-public-key');
    if (!publicKey) return { ok: false, error: 'Notificaciones push no configuradas en el servidor.' };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    await adminApi('/api/admin/push/subscribe', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'No se pudo activar: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

export async function disablePushNotifications(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await adminApi('/api/admin/push/subscribe', { method: 'DELETE', body: { endpoint } }).catch(() => { /* ya se desuscribió en el navegador igual */ });
}
