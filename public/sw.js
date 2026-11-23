// Living Muslim service worker: works offline and shows prayer reminders.
const CACHE = 'lm-v3';
const KEEP = ['lm-local'];
const SHELL = ['/app/', '/manifest.webmanifest', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && !KEEP.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const isApp = (u) => u.pathname === '/app/' || u.pathname === '/app' || u.pathname === '/app/index.html';

// The app page opens straight from the phone and refreshes in the background. When the new page differs,
// open windows hear about it (the app reloads only if it was opened a moment ago).
function appPage(e) {
  const key = '/app/';
  const net = fetch(e.request).then(async (res) => {
    if (!res.ok) return res;
    const c = await caches.open(CACHE);
    const old = await c.match(key);
    const [a, b] = await Promise.all([old ? old.clone().text() : Promise.resolve(''), res.clone().text()]);
    await c.put(key, res.clone());
    if (old && a !== b) {
      const ws = await self.clients.matchAll({ type: 'window' });
      ws.forEach((w) => w.postMessage({ type: 'lm-update' }));
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  return caches.match(key).then((m) => m || net).catch(() => net);
}

self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (r.mode === 'navigate' && isApp(u)) { e.respondWith(appPage(e)); return; }
  // Files with a content hash in the name never change: phone first.
  if (u.pathname.startsWith('/app/assets/')) {
    e.respondWith(caches.match(r).then((m) => m || fetch(r).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
      return res;
    })));
    return;
  }
  // Everything else: network first, the saved copy when offline.
  e.respondWith(
    fetch(r).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r).then((m) => m || caches.match('/app/'))),
  );
});

// A sister's days without prayer: the page leaves a flag on the phone (Cache Storage), and prayer reminders
// turn into a soft «время зикра». The server never learns about these days.
async function sisFlag() {
  try {
    const c = await caches.open('lm-local');
    const r = await c.match('/__lm-sis');
    return r ? await r.json() : null;
  } catch { return null; }
}
const SIS_RU = { fajr: 'Утренние азкары, пара минут.', dhuhr: 'СубханАллах 33 раза, одна минута.', asr: 'Послушай суру аль-Мульк.', maghrib: 'Вечерние азкары, пара минут.', isha: 'Короткое дуа своими словами.' };
const SIS_EN = { fajr: 'Morning adhkar, a couple of minutes.', dhuhr: 'SubhanAllah 33 times, one minute.', asr: 'Listen to Surah al-Mulk.', maghrib: 'Evening adhkar, a couple of minutes.', isha: 'A short dua in your own words.' };

// «Мой цикл»: a reminder 2 days before the guessed start (with the Dhuhr reminder) and «tomorrow you can make up
// a fast» (with the Isha reminder). Shown by the phone itself, once a day; the server never learns about it.
async function cycFlag() {
  try {
    const c = await caches.open('lm-local');
    const r = await c.match('/__lm-cyc');
    return r ? await r.json() : null;
  } catch { return null; }
}
const localKey = (dt) => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
async function onceToday(kind) {
  try {
    const c = await caches.open('lm-local');
    const k = '/__lm-cyc-shown-' + kind;
    const r = await c.match(k);
    const today = localKey(new Date());
    if (r && (await r.text()) === today) return false;
    await c.put(k, new Response(today));
    return true;
  } catch { return true; }
}
async function cycExtra(tag) {
  const f = await cycFlag();
  if (!f) return;
  const now = new Date();
  const modest = f.modest !== false;
  const say = (body) => self.registration.showNotification('Living Muslim', { body: modest ? (f.en ? 'A reminder from Living Muslim' : 'Напоминание от Living Muslim') : body, icon: '/icon-192.png', badge: '/icon-192.png', tag: 'lm-cyc', data: { url: '/app/?go=cycle' } });
  if (tag === 'prayer-dhuhr' && f.rem && f.rem === localKey(now) && (await onceToday('rem'))) {
    return say(f.en ? 'In about 2 days your days without prayer may begin.' : 'Через 2 дня, возможно, начнутся дни без намаза.');
  }
  if (tag === 'prayer-isha' && Array.isArray(f.qd)) {
    const tm = new Date(now.getTime() + 86400000);
    const wd = (tm.getDay() + 6) % 7;
    if (f.qd.includes(wd) && (await onceToday('qd'))) return say(f.en ? 'Tomorrow you can make up a fast. Bismillah.' : 'Завтра можно восполнить пост. Бисмиллях.');
  }
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Living Muslim', body: e.data && e.data.text() }; }
  const tag0 = d.tag || '';
  e.waitUntil((/^prayer-/.test(tag0) ? sisFlag() : Promise.resolve(null)).then((sis) => {
    if (sis && sis.on) {
      const a = String(d.tag).slice(7);
      d = sis.modest
        ? { ...d, title: 'Living Muslim', body: sis.en ? 'A reminder from Living Muslim' : 'Напоминание от Living Muslim', url: '/app/', actions: undefined }
        : { ...d, title: sis.en ? '☾ Time for dhikr' : '☾ Время зикра', body: (sis.en ? SIS_EN : SIS_RU)[a] || (sis.en ? 'A short dhikr.' : 'Короткий зикр.'), url: '/app/', actions: undefined };
    }
    return Promise.all([/^prayer-(dhuhr|isha)$/.test(tag0) ? cycExtra(tag0).catch(() => {}) : null, self.registration.showNotification(d.title || 'Living Muslim', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'lm',
    renotify: /^chat-/.test(d.tag || ''),
    data: { url: d.url || '/app/' },
    // Plans: «Сделано», «Через час», «Завтра» (Android and installed iPhone apps show up to 2–3 buttons).
    ...(Array.isArray(d.actions) ? { actions: d.actions.slice(0, 3) } : {}),
  })]);
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || '/app/';
  if (e.action) url += (url.includes('?') ? '&' : '?') + 'do=' + encodeURIComponent(e.action);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.includes('/app/') && 'focus' in w) { w.postMessage({ type: 'open', url }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
