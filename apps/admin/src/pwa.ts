// CREA Panel Admin — registro de PWA (manifest + service worker) e instalación a pantalla de inicio.
import { setState } from './store';

let deferredPrompt: Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;

export function isPwaInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
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
}

export async function promptPwaInstall(): Promise<void> {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  setState({ pwaInstallAvailable: false });
}
