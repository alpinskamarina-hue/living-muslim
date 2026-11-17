// Living Muslim service worker: works offline and shows prayer reminders.
const CACHE = 'lm-v1';
const SHELL = ['/app/', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Pages: network first, cache as fallback, so updates arrive as soon as there is a connection.
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin || new URL(r.url).pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then((m) => m || caches.match('/app/'))),
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Living Muslim', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Living Muslim', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'lm',
    data: { url: d.url || '/app/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/app/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.includes('/app/') && 'focus' in w) return w.focus();
    return self.clients.openWindow(url);
  }));
});
