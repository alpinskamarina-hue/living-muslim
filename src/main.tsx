// Entry: the English dictionary is a separate download, fetched only for English, and set before any
// module that translates strings at load time is evaluated.
import { isEn, setEN } from './i18n';

// After a new release, a lazily loaded part of an old page may be gone from the server: reload once.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('lm.reloaded')) return;
    sessionStorage.setItem('lm.reloaded', '1');
  } catch { /* storage blocked */ }
  e.preventDefault();
  location.reload();
});

// The install prompt can fire before the app code arrives: keep it for push.ts.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); (window as any).__lmInstall = e; });

// A newer version arrived in the background: take it now only if the app was opened a moment ago.
const openedAt = Date.now();
let touched = false;
['pointerdown', 'keydown'].forEach((t) => window.addEventListener(t, () => { touched = true; }, { once: true, capture: true }));
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'lm-update' && !touched && Date.now() - openedAt < 8000) location.reload();
});

(isEn ? import('./en').then((m) => setEN(m.EN)) : Promise.resolve())
  .then(() => import('./boot'))
  .then(() => setTimeout(() => { try { sessionStorage.removeItem('lm.reloaded'); } catch { /* */ } }, 15000));
