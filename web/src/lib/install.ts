import { useEffect, useState } from 'react';

/**
 * Installing the app on a computer or phone. Chrome and Edge let the page offer
 * "Install" itself (the beforeinstallprompt event, caught as early as possible,
 * before React starts). Safari and Firefox don't, so the app shows the steps.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export type Platform = 'iphone' | 'mac-safari' | 'firefox' | 'chromium';
export function platform(ua = navigator.userAgent): Platform {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'mac-safari';
  return 'chromium';
}

export function useInstall() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', fn);
    return () => { listeners.delete(fn); mq?.removeEventListener?.('change', fn); };
  }, []);
  return {
    installed: isInstalled(),
    canPrompt: !!deferred,
    platform: platform(),
    async install() {
      if (!deferred) return 'unavailable' as const;
      const e = deferred;
      await e.prompt();
      const { outcome } = await e.userChoice;
      if (outcome === 'accepted') deferred = null;
      notify();
      return outcome;
    },
  };
}
