// Called once a minute by the database scheduler (pg_cron). Sends due prayer and muhasabah reminders.
import webpush from 'web-push';
import adhan from 'adhan';

const { Coordinates, CalculationMethod, PrayerTimes, Madhab, HighLatitudeRule } = adhan;
const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const WINDOW_MS = 15 * 60 * 1000;
const NAMES = { fajr: 'Фаджр', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша' };
const AFTER = { fajr: 'Фаджра', dhuhr: 'Зухра', asr: 'Асра', maghrib: 'Магриба', isha: 'Иши' };

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

function localParts(tz, at = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute, key: `${p.year}-${p.month}-${p.day}` };
}
/** UTC instant for a wall-clock time in a time zone. */
function zoned(tz, y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = localParts(tz, new Date(guess));
  const off = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - guess;
  return guess - off;
}
const hhmm = (ms, tz) => new Intl.DateTimeFormat('ru-RU', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

export function events(prefs, now) {
  const tz = prefs.tz || 'Europe/Amsterdam';
  const day = localParts(tz, new Date(now));
  const out = [];
  const coords = new Coordinates(prefs.lat, prefs.lng);
  const params = (CalculationMethod[prefs.method] || CalculationMethod.MuslimWorldLeague)();
  params.madhab = prefs.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  const o = prefs.offsets || {};
  params.adjustments = { fajr: o.fajr || 0, sunrise: 0, dhuhr: o.dhuhr || 0, asr: o.asr || 0, maghrib: o.maghrib || 0, isha: o.isha || 0 };
  // adhan reads the calendar date from the Date's local fields; the server runs in UTC.
  const t = new PrayerTimes(coords, new Date(day.y, day.m - 1, day.d, 12), params);
  const before = Number(prefs.before) || 0;
  for (const a of prefs.prayers || []) {
    if (!t[a]) continue;
    const at = t[a].getTime() - before * 60000;
    out.push({
      key: `${day.key}:${a}`, at,
      title: before ? `Через ${before} мин ${NAMES[a]}` : `Время намаза ${NAMES[a]}`,
      body: `${NAMES[a]} в ${hhmm(t[a].getTime(), tz)}. После ${AFTER[a]} тебя ждут твои маленькие дела.`,
      tag: `prayer-${a}`,
    });
  }
  if (/^\d\d:\d\d$/.test(prefs.muhasaba || '')) {
    const [hh, mm] = prefs.muhasaba.split(':').map(Number);
    out.push({ key: `${day.key}:muhasaba`, at: zoned(tz, day.y, day.m, day.d, hh, mm), title: 'Мухасаба', body: 'Пара минут, чтобы оглянуться на день: что получилось и за что ты благодарен.', tag: 'muhasaba', url: '/app/' });
  }
  return { day: day.key, list: out };
}

export default async function handler(req, res) {
  const secret = process.env.PUSH_SECRET;
  if (!secret || req.headers['x-push-secret'] !== secret) return res.status(401).json({ error: 'unauthorized' });
  webpush.setVapidDetails('mailto:alpinskamarina@gmail.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

  const now = Date.now();
  const subs = (await rpc('lm_push_list', { p_secret: secret })) || [];
  let sent = 0, dropped = 0;
  await Promise.all(subs.map(async (s) => {
    const prefs = s.prefs || {};
    if (typeof prefs.lat !== 'number') return;
    const { day, list } = events(prefs, now);
    const done = (s.sent || []).filter((k) => k.startsWith(day));
    const due = list.filter((e) => now >= e.at && now - e.at < WINDOW_MS && !done.includes(e.key));
    if (!due.length) return;
    for (const e of due) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: e.title, body: e.body, tag: e.tag, url: '/app/' }), { TTL: 900 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) { dropped++; await rpc('lm_push_delete', { p_endpoint: s.endpoint }).catch(() => {}); return; }
      }
      done.push(e.key);
    }
    await rpc('lm_push_mark', { p_secret: secret, p_endpoint: s.endpoint, p_sent: done }).catch(() => {});
  }));
  res.status(200).json({ ok: true, subs: subs.length, sent, dropped });
}
