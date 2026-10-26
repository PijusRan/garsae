// PWA helpers. Offline use is opt-in: nothing is cached until the user asks.
// Updates: the service worker is network-first, so a new version simply loads on
// the next launch. Nothing ever reloads the page, so music is never interrupted.
import { useEffect, useState } from 'react';

const CACHE = 'garsae-offline-v1';
const FLAG = 'garsae.offline';

export const offlineSupported = (): boolean =>
  import.meta.env.PROD && 'serviceWorker' in navigator && typeof caches !== 'undefined';

export function isOfflineEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

/** Keeps the service worker registered (and so updating) once offline use was enabled. */
export function initPwa(): void {
  if (offlineSupported() && isOfflineEnabled()) {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  }
}

export async function enableOffline(): Promise<void> {
  await navigator.serviceWorker.register('./sw.js');
  const res = await fetch('./precache.json', { cache: 'no-store' });
  const files = (await res.json()) as string[];
  const cache = await caches.open(CACHE);
  await cache.addAll(files);
  localStorage.setItem(FLAG, '1');
}

export async function disableOffline(): Promise<void> {
  await caches.delete(CACHE);
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  localStorage.removeItem(FLAG);
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Returns an install function only when the browser offers installation. Never nags. */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!evt) return null;
  return async () => {
    await evt.prompt();
    await evt.userChoice;
    setEvt(null);
  };
}
