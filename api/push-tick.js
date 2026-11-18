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

const RPUSH_DEFAULT = { suhoor: 45, iftar: 15, tarawih: false, nights: true, fitr: true };
const NAMES_EN = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

/** Day of Ramadan (1..30) for a calendar date, by the Umm al-Qura calendar, or null. */
export function ramadanDayOf(y, m, d) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'numeric' }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12)));
    const g = (t) => Number(parts.find((p) => p.type === t)?.value);
    return g('month') === 9 ? g('day') : null;
  } catch { return null; }
}

/** Suhoor, iftar, tarawih, odd nights and zakat al-fitr. Texts in the user's language. */
function ramadanEvents(prefs, day, tz, t, params, coords) {
  const R = { ...RPUSH_DEFAULT, ...(prefs.ramadan || {}) };
  const en = prefs.lang === 'en';
  const rd = ramadanDayOf(day.y, day.m, day.d);
  const nx = new Date(Date.UTC(day.y, day.m - 1, day.d + 1));
  const night = ramadanDayOf(nx.getUTCFullYear(), nx.getUTCMonth() + 1, nx.getUTCDate());
  const out = [];
  const at = (k, ms, title, body) => out.push({ key: `${day.key}:r-${k}`, at: ms, title, body, tag: `ramadan-${k}` });
  const fmt = (ms) => hhmm(ms, tz);
  if (rd && R.suhoor > 0) {
    at('suhoor', t.fajr.getTime() - R.suhoor * 60000,
      en ? `Suhoor: ${R.suhoor} min left` : `Сухур: осталось ${R.suhoor} мин`,
      en ? `Fajr at ${fmt(t.fajr.getTime())}. "Eat suhoor, for in suhoor there is blessing." Day ${rd} of Ramadan.` : `Фаджр в ${fmt(t.fajr.getTime())}. «Ешьте сухур, ведь в сухуре баракат». ${rd}-й день Рамадана.`);
  }
  if (rd && R.iftar >= 0) {
    at('iftar', t.maghrib.getTime() - R.iftar * 60000,
      R.iftar ? (en ? `Iftar in ${R.iftar} min` : `Ифтар через ${R.iftar} мин`) : (en ? 'Time for iftar' : 'Время ифтара'),
      en ? `Maghrib at ${fmt(t.maghrib.getTime())}. Now is a time when du‘a is answered. Dhahaba-dh-dhama’u wabtallati-l-‘uruqu wa thabata-l-ajru in sha’ Allah.` : `Магриб в ${fmt(t.maghrib.getTime())}. Время, когда принимается дуа. Захаба-з-зама’у ва-бталляти-ль-‘урук ва сабата-ль-аджру ин ша’а-Ллах.`);
  }
  if (night && R.tarawih) {
    at('tarawih', t.isha.getTime() + 20 * 60000,
      en ? `Night ${night} of Ramadan` : `${night}-я ночь Рамадана`,
      en ? 'Tarawih tonight? Mark it in the app once you have prayed.' : 'Таравих сегодня? Отметь в приложении, когда помолишься.');
  }
  if (night === 1 && R.nights) {
    at('first', t.maghrib.getTime() + 20 * 60000,
      en ? 'Ramadan Mubarak! 🌙' : 'Рамадан мубарак! 🌙',
      en ? 'Tonight is the first night of Ramadan and tomorrow the first fast. Make your intention.' : 'Сегодня первая ночь Рамадана, завтра первый день поста. Не забудь намерение.');
  }
  if (night && night >= 21 && night % 2 && R.nights) {
    const tf = new PrayerTimes(coords, new Date(nx.getUTCFullYear(), nx.getUTCMonth(), nx.getUTCDate(), 12), params);
    const third = t.maghrib.getTime() + ((tf.fajr.getTime() - t.maghrib.getTime()) * 2) / 3;
    at('odd', t.isha.getTime() + 30 * 60000,
      en ? `Night ${night}: an odd night` : `${night}-я ночь, нечётная`,
      en ? `It may be Laylat al-Qadr. The last third begins at ${fmt(third)}. Your night plan and du‘a list are in the app.` : `Может быть, это Ляйлят аль-Кадр. Последняя треть ночи с ${fmt(third)}. План ночи и твой список дуа в приложении.`);
  }
  if (rd === 27 && R.fitr) {
    at('fitr', zoned(tz, day.y, day.m, day.d, 12, 0),
      en ? 'Zakat al-fitr' : 'Закят аль-фитр',
      en ? 'Eid is two or three days away. Give zakat al-fitr for yourself and your family before the Eid prayer.' : 'До Ида два-три дня. Отдай закят аль-фитр за себя и семью до праздничного намаза.');
  }
  return out;
}

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
      title: prefs.lang === 'en' ? (before ? `${NAMES_EN[a]} in ${before} min` : `Time for ${NAMES_EN[a]}`) : before ? `Через ${before} мин ${NAMES[a]}` : `Время намаза ${NAMES[a]}`,
      body: prefs.lang === 'en' ? `${NAMES_EN[a]} at ${hhmm(t[a].getTime(), tz)}. Your small deeds are waiting after ${NAMES_EN[a]}.` : `${NAMES[a]} в ${hhmm(t[a].getTime(), tz)}. После ${AFTER[a]} тебя ждут твои маленькие дела.`,
      tag: `prayer-${a}`,
    });
  }
  out.push(...ramadanEvents(prefs, day, tz, t, params, coords));
  if (/^\d\d:\d\d$/.test(prefs.muhasaba || '')) {
    const [hh, mm] = prefs.muhasaba.split(':').map(Number);
    out.push({ key: `${day.key}:muhasaba`, at: zoned(tz, day.y, day.m, day.d, hh, mm), title: prefs.lang === 'en' ? 'Muhasabah' : 'Мухасаба', body: prefs.lang === 'en' ? 'A couple of minutes to look back on the day: what went well and what you are grateful for.' : 'Пара минут, чтобы оглянуться на день: что получилось и за что ты благодарен.', tag: 'muhasaba', url: '/app/' });
  }
  return { day: day.key, list: out };
}

/** True during the first 20 minutes after a prayer starts: chat waits until after the prayer. */
export function inPrayer(prefs, now) {
  if (typeof prefs.lat !== 'number') return false;
  const tz = prefs.tz || 'Europe/Amsterdam';
  const day = localParts(tz, new Date(now));
  const params = (CalculationMethod[prefs.method] || CalculationMethod.MuslimWorldLeague)();
  params.madhab = prefs.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  const coords = new Coordinates(prefs.lat, prefs.lng);
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  const t = new PrayerTimes(coords, new Date(day.y, day.m - 1, day.d, 12), params);
  return ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].some((a) => now >= t[a].getTime() && now - t[a].getTime() < 20 * 60000);
}

/** New circle messages: one notification per circle, replaced by the next one (same tag). */
async function chatPush(secret, subs, now) {
  let list;
  try { list = (await rpc('lm_chat_push', { p_secret: secret })) || []; } catch { return 0; } // chat.sql not run yet
  const byEp = new Map(subs.map((s) => [s.endpoint, s]));
  let sent = 0;
  for (const c of list) {
    const s = byEp.get(c.endpoint);
    if (!s) continue;
    const prefs = s.prefs || {};
    if (inPrayer(prefs, now)) continue;
    const en = prefs.lang === 'en';
    const what = c.kind === 'voice' ? (en ? '🎙 voice message' : '🎙 голосовое') : c.kind === 'event' ? `🤲 ${c.body}` : c.kind === 'photo' ? `📷 ${c.body || (en ? 'photo' : 'фото')}` : c.kind === 'file' ? `📄 ${c.body || (en ? 'file' : 'файл')}` : c.body;
    const title = c.title || (en ? 'Your circle' : 'Круг');
    const body = c.n > 1 ? `${c.from}: ${what}`.slice(0, 120) + (en ? ` · ${c.n} new` : ` · новых: ${c.n}`) : `${c.from}: ${what}`.slice(0, 140);
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, tag: `chat-${c.code}`, url: `/app/?chat=${c.code}` }), { TTL: 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { await rpc('lm_push_delete', { p_endpoint: s.endpoint }).catch(() => {}); continue; }
    }
    await rpc('lm_chat_push_mark', { p_secret: secret, p_endpoint: s.endpoint, p_code: c.code, p_id: c.last }).catch(() => {});
  }
  return sent;
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
  const chat = await chatPush(secret, subs, now);
  res.status(200).json({ ok: true, subs: subs.length, sent, dropped, chat });
}
