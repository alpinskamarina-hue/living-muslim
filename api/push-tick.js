// Called once a minute by the database scheduler (pg_cron). Sends due prayer and muhasabah reminders,
// habit nudges after prayers and «new course» notices.
import webpush from 'web-push';
import adhan from 'adhan';
import { BUILTIN_COURSES } from './_builtin-courses.js';

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

const ORDER = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const NUDGE_AFTER_MS = 25 * 60 * 1000;
const ruDeeds = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'дело' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'дела' : 'дел');

/**
 * Habit nudges, 25 minutes after a prayer, at most 3 a day. The phone sends only counts per prayer
 * (b: all active habits, p: what is still open today, q: one of them is Quran), never habit names.
 * The 3 prayers are picked from b, Quran first, so the set stays the same all day.
 * If the phone has not reported for over 2 days, one nudge a day; after 14 days, none.
 */
export function nudgeEvents(prefs, day, t) {
  const N = prefs.nudge;
  if (prefs.habits === false || !N || !N.b) return [];
  const en = prefs.lang === 'en';
  const pick = ORDER.filter((a) => t[a] && N.b[a]?.n > 0)
    .sort((x, y) => (N.b[y].q ? 1 : 0) - (N.b[x].q ? 1 : 0) || ORDER.indexOf(x) - ORDER.indexOf(y))
    .slice(0, 3);
  // Not opened for a while: one nudge a day, and none after two weeks of silence.
  const quiet = Math.round((Date.parse(day.key) - Date.parse(N.d || day.key)) / 86400000);
  if (quiet > 14) return [];
  const open = N.d === day.key ? N.p || {} : N.b;
  const out = [];
  const chosen = quiet > 2 ? pick.slice(0, 1) : pick;
  for (const a of ORDER.filter((x) => chosen.includes(x))) {
    const v = open[a];
    if (!v || !(v.n > 0)) continue;
    const n = v.n, q = Boolean(v.q);
    const body = en
      ? q ? (n > 1 ? `Quran and ${n - 1} more. Even the minimum counts.` : 'Time for your Quran. Even the minimum counts.')
        : n > 1 ? `${n} small deeds are waiting. Even the minimum counts.` : 'One small deed is waiting. Even the minimum counts.'
      : q ? (n > 1 ? `Коран и ещё ${n - 1} ${ruDeeds(n - 1)}. Хватит и минимума.` : 'Время для Корана. Хватит и минимума.')
        : n > 1 ? `Тебя ждут ${n} ${ruDeeds(n)}. Хватит и минимума.` : 'Тебя ждёт одно маленькое дело. Хватит и минимума.';
    out.push({ key: `${day.key}:h-${a}`, at: t[a].getTime() + NUDGE_AFTER_MS, title: en ? `After ${NAMES_EN[a]}` : `После ${AFTER[a]}`, body, tag: `habits-${a}`, url: '/app/' });
  }
  return out;
}

/** Courses added in the admin screen in the last 15 minutes (not changes to built-in ones, not hidden). */
async function freshCourses(now) {
  const since = new Date(now - WINDOW_MS).toISOString();
  try {
    const r = await fetch(`${SB}/rest/v1/lm_courses?select=id,yt,title,lang,created&hidden=eq.false&created=gte.${encodeURIComponent(since)}`, { headers: { apikey: KEY } });
    if (!r.ok) return [];
    const builtIn = new Set(BUILTIN_COURSES);
    return (await r.json()).filter((c) => !builtIn.has(c.yt));
  } catch { return []; }
}

/** One notice per new course, in the person's app language, never in quiet mode. */
export function courseEvents(prefs, day, tz, courses) {
  if (prefs.courses === false || prefs.quiet) return [];
  const en = prefs.lang === 'en';
  return courses
    .filter((c) => (c.lang || 'ru') === (en ? 'en' : 'ru'))
    .map((c) => ({ c, at: new Date(c.created).getTime() }))
    .filter(({ at }) => localParts(tz, new Date(at)).key === day.key)
    .map(({ c, at }) => ({
      key: `${day.key}:c-${c.id}`, at,
      title: en ? 'New course in Living Muslim' : 'Новый курс в Living Muslim',
      body: (en ? `“${c.title}”. The first lesson is ready.` : `«${c.title}». Первый урок уже ждёт.`).slice(0, 160),
      tag: `course-${c.id}`, url: `/app/?course=${encodeURIComponent(c.yt)}`,
    }));
}

export function events(prefs, now, courses = []) {
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
  // Adhan chosen in the app: the notification names the reciter and a tap opens the app playing it.
  const adhan = prefs.adhan && !prefs.quiet && Array.isArray(prefs.adhan.p) ? prefs.adhan : null;
  for (const a of prefs.prayers || []) {
    if (!t[a]) continue;
    const at = t[a].getTime() - before * 60000;
    const withAdhan = adhan && adhan.p.includes(a);
    const who = withAdhan ? String((a === 'fajr' ? adhan.fajr : adhan.name) || '').slice(0, 40) : '';
    const tap = !withAdhan ? '' : prefs.lang === 'en' ? ` Tap to play the adhan${who ? ` (${who})` : ''}.` : ` Нажми, чтобы включить азан${who ? ` (${who})` : ''}.`;
    out.push({
      key: `${day.key}:${a}`, at,
      title: prefs.lang === 'en' ? (before ? `${NAMES_EN[a]} in ${before} min` : `Time for ${NAMES_EN[a]}`) : before ? `Через ${before} мин ${NAMES[a]}` : `Время намаза ${NAMES[a]}`,
      body: (prefs.lang === 'en' ? `${NAMES_EN[a]} at ${hhmm(t[a].getTime(), tz)}.` : `${NAMES[a]} в ${hhmm(t[a].getTime(), tz)}.`) + (tap || (prefs.lang === 'en' ? ` Your small deeds are waiting after ${NAMES_EN[a]}.` : ` После ${AFTER[a]} тебя ждут твои маленькие дела.`)),
      tag: `prayer-${a}`,
      url: withAdhan ? `/app/?adhan=${a}` : '/app/',
    });
  }
  out.push(...ramadanEvents(prefs, day, tz, t, params, coords));
  out.push(...nudgeEvents(prefs, day, t));
  out.push(...courseEvents(prefs, day, tz, courses));
  if (/^\d\d:\d\d$/.test(prefs.muhasaba || '')) {
    const [hh, mm] = prefs.muhasaba.split(':').map(Number);
    out.push({ key: `${day.key}:muhasaba`, at: zoned(tz, day.y, day.m, day.d, hh, mm), title: prefs.lang === 'en' ? 'Muhasabah' : 'Мухасаба', body: prefs.lang === 'en' ? 'A couple of minutes to look back on the day: what went well and what you are grateful for.' : 'Пара минут, чтобы оглянуться на день: что получилось и за что ты благодарен.', tag: 'muhasaba', url: '/app/' });
  }
  // Reminders set in the app (often by the assistant): sent on their own day, at their minute.
  // Plans with ⏰ come the same way (pl = plan id, d = its day, a = the prayer it follows), with buttons.
  const en = prefs.lang === 'en';
  for (const r of Array.isArray(prefs.pings) ? prefs.pings.slice(0, 30) : []) {
    if (!r || typeof r.at !== 'number' || typeof r.t !== 'string') continue;
    if (localParts(tz, new Date(r.at)).key !== day.key) continue;
    if (typeof r.pl === 'string') {
      const pl = r.pl.slice(0, 24), d = /^\d{4}-\d{2}-\d{2}$/.test(r.d || '') ? r.d : day.key;
      const after = r.a && AFTER[r.a] ? (en ? ` after ${NAMES_EN[r.a] || "Jumu'ah"}` : ` после ${r.a === 'jumuah' ? 'Джумы' : AFTER[r.a]}`) : '';
      const base = `/app/?go=plans&pl=${encodeURIComponent(pl)}&d=${d}`;
      out.push({ key: `${day.key}:pl-${pl}-${Math.round(r.at / 60000) % 1e6}`, at: r.at, title: `🗓 ${en ? 'Plan' : 'План'}${after}`, body: r.t.slice(0, 160), tag: `plan-${pl}`, url: base,
        actions: [{ action: 'done', title: en ? 'Done' : 'Сделано' }, { action: 'hour', title: en ? 'In an hour' : 'Через час' }, { action: 'tomorrow', title: en ? 'Tomorrow' : 'Завтра' }] });
      continue;
    }
    if (r.w === 1) {
      // Workout reminder (Здоровье → Тренировки): only on a day without a workout while the week is behind its goal.
      out.push({ key: `${day.key}:w-${String(r.k).slice(0, 24)}`, at: r.at, title: en ? '💪 Workout' : '💪 Тренировка', body: r.t.slice(0, 160), tag: 'workout', url: '/app/?go=workouts' });
      continue;
    }
    // Set by the assistant: the notification comes from her by name and opens her chat, where the reminder waits as her message.
    const who = typeof prefs.ainame === 'string' && prefs.ainame.trim() ? prefs.ainame.trim().slice(0, 30) : '';
    out.push({ key: `${day.key}:p-${String(r.k).slice(0, 24)}`, at: r.at, title: who ? `⏰ ${who}` : en ? '⏰ Reminder' : '⏰ Напоминание', body: r.t.slice(0, 160), tag: `ping-${String(r.k).slice(0, 24)}`, url: '/app/?go=ai' });
  }
  return { day: day.key, list: out };
}

/** Quiet mode (someone whose family does not know yet): no religious words on the lock screen. */
export function quietText(prefs, e) {
  if (!prefs.quiet) return { title: e.title, body: e.body };
  const en = prefs.lang === 'en';
  return { title: en ? 'Time for yourself' : 'Время для себя', body: en ? 'A few quiet minutes, as planned.' : 'Пара спокойных минут, как договаривались.' };
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
    const what = c.kind === 'voice' ? (en ? '🎙 voice message' : '🎙 голосовое') : c.kind === 'event' ? `🤲 ${c.body}` : c.kind === 'photo' ? `📷 ${c.body || (en ? 'photo' : 'фото')}` : c.kind === 'file' ? `📄 ${c.body || (en ? 'file' : 'файл')}` : c.kind === 'ai' ? `✨ ${c.body}` : c.body;
    const title = prefs.quiet ? (en ? 'New message' : 'Новое сообщение') : c.title || (en ? 'Your circle' : 'Круг');
    const body = prefs.quiet ? (en ? 'Open the app to read it.' : 'Открой приложение, чтобы прочитать.') : c.n > 1 ? `${c.from}: ${what}`.slice(0, 120) + (en ? ` · ${c.n} new` : ` · новых: ${c.n}`) : `${c.from}: ${what}`.slice(0, 140);
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

/** Reminders the assistant set in a circle chat (supabase/circle-ai.sql): for one member or for everyone. */
async function aiPush(secret) {
  let list;
  try { list = (await rpc('lm_chat_ai_due', { p_secret: secret })) || []; } catch { return 0; } // circle-ai.sql not run yet
  let sent = 0;
  for (const p of list) {
    const en = p.lang === 'en';
    try {
      await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify({ title: `⏰ ${p.title || (en ? 'Your circle' : 'Круг')}`, body: String(p.body || '').slice(0, 160), tag: `aip-${p.id}`, url: `/app/?chat=${p.code}` }), { TTL: 900 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await rpc('lm_push_delete', { p_endpoint: p.endpoint }).catch(() => {});
    }
    await rpc('lm_chat_ai_sent_mark', { p_secret: secret, p_id: p.id, p_endpoint: p.endpoint }).catch(() => {});
  }
  return sent;
}

/** «Ищут людей» (supabase/umrah-open.sql): a new request for the amir, the amir's answer for the person who asked. */
async function umrahPush(secret) {
  let list;
  try { list = (await rpc('lm_umrah_push', { p_secret: secret })) || []; } catch { return 0; } // umrah-open.sql not run yet
  let sent = 0;
  for (const p of list) {
    const prefs = p.prefs || {};
    const en = prefs.lang === 'en';
    const t = p.title || (en ? 'Umrah' : 'Умра');
    const msg = p.k === 'ask' ? { title: en ? '🕋 Asks to join your umrah' : '🕋 Просятся в поездку', body: en ? `${p.who} asks to join «${t}»` : `${p.who} просится в «${t}»` }
      : p.k === 'accepted' ? { title: en ? '🕋 You are in!' : '🕋 Тебя приняли', body: en ? `${p.who} accepted you into «${t}». Open the Circle invite.` : `${p.who} принял тебя в «${t}». Приглашение в круг ждёт в «Круге».` }
      : p.k === 'declined' ? { title: en ? 'Umrah group' : 'Группа на умру', body: en ? `«${t}»: not this time. Other groups are in «Looking for people».` : `«${t}»: не в этот раз. Другие группы есть в «Ищут людей».` }
      : { title: en ? `🕋 ${p.who} replied` : `🕋 ${p.who} ответил`, body: String(p.reply || '').slice(0, 140) };
    if (prefs.quiet) { msg.title = en ? 'Umrah' : 'Умра'; msg.body = en ? 'Open the app to see it.' : 'Открой приложение, чтобы посмотреть.'; }
    try {
      await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify({ ...msg, tag: `um-${p.k}`, url: p.k === 'accepted' ? '/app/' : p.k === 'ask' ? '/app/?umrah=group' : '/app/?umrah=open' }), { TTL: 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await rpc('lm_push_delete', { p_endpoint: p.endpoint }).catch(() => {});
    }
  }
  return sent;
}

// «Просят написать»: a new message request, once each (supabase/profile-path.sql)
async function askPush(secret) {
  let list;
  try { list = (await rpc('lm_ask_push', { p_secret: secret })) || []; } catch { return 0; } // profile-path.sql not run yet
  const RU = { meet: 'познакомиться', question: 'с вопросом', umrah: 'про умру', learn: 'учиться вместе', job: 'про работу', biz: 'про бизнес', dua: 'с просьбой о дуа', study: 'про учёбу' };
  const EN = { meet: 'to get to know you', question: 'with a question', umrah: 'about umrah', learn: 'to study together', job: 'about work', biz: 'about business', dua: 'asking for dua', study: 'about studies' };
  let sent = 0;
  for (const p of list) {
    const prefs = p.prefs || {};
    const en = prefs.lang === 'en';
    const msg = { title: en ? `📩 ${p.who} asks to write to you` : `📩 ${p.who} просит написать тебе`,
      body: en ? `Topic: ${EN[p.kind] || 'a message'}. Nothing reaches you until you accept.` : `Тема: ${RU[p.kind] || 'сообщение'}. Пока ты не примешь, ничего не придёт.` };
    if (prefs.quiet) { msg.title = en ? 'Living Muslim' : 'Living Muslim'; msg.body = en ? 'Open the app to see it.' : 'Открой приложение, чтобы посмотреть.'; }
    try {
      await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify({ ...msg, tag: 'ask', url: '/app/?asks=1' }), { TTL: 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await rpc('lm_push_delete', { p_endpoint: p.endpoint }).catch(() => {});
    }
  }
  return sent;
}

// Posts of the team in the common circle with «Пуш» on (supabase/posts.sql), once each.
async function postPush(secret) {
  let list;
  try { list = (await rpc('lm_post_push', { p_secret: secret })) || []; } catch { return 0; } // posts.sql not run yet
  let sent = 0;
  for (const p of list) {
    const prefs = p.prefs || {};
    const en = prefs.lang === 'en';
    const msg = prefs.quiet
      ? { title: 'Living Muslim', body: en ? 'A new post from the team. Open the app to read it.' : 'Новый пост от команды. Открой приложение, чтобы прочитать.' }
      : { title: en ? '📣 Common circle Living Muslim' : '📣 Общий круг Living Muslim', body: String(p.body || '').replace(/\s+/g, ' ').slice(0, 160) };
    try {
      await webpush.sendNotification({ endpoint: p.endpoint, keys: { p256dh: p.p256dh, auth: p.auth } }, JSON.stringify({ ...msg, tag: `post-${p.id}`, url: '/app/?common=1' }), { TTL: 6 * 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await rpc('lm_push_delete', { p_endpoint: p.endpoint }).catch(() => {});
    }
  }
  return sent;
}

export default async function handler(req, res) {
  const secret = process.env.PUSH_SECRET;
  if (!secret || req.headers['x-push-secret'] !== secret) return res.status(401).json({ error: 'unauthorized' });
  webpush.setVapidDetails('mailto:alpinskamarina@gmail.com', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

  const now = Date.now();
  const subs = (await rpc('lm_push_list', { p_secret: secret })) || [];
  const courses = await freshCourses(now);
  let sent = 0, dropped = 0;
  await Promise.all(subs.map(async (s) => {
    const prefs = s.prefs || {};
    if (typeof prefs.lat !== 'number') return;
    const { day, list } = events(prefs, now, courses);
    const done = (s.sent || []).filter((k) => k.startsWith(day));
    const due = list.filter((e) => now >= e.at && now - e.at < WINDOW_MS && !done.includes(e.key));
    if (!due.length) return;
    for (const e of due) {
      const q = quietText(prefs, e);
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: q.title, body: q.body, tag: e.tag, url: prefs.quiet && !e.actions ? '/app/' : e.url || '/app/', ...(e.actions ? { actions: e.actions } : {}) }), { TTL: 900 });
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) { dropped++; await rpc('lm_push_delete', { p_endpoint: s.endpoint }).catch(() => {}); return; }
      }
      done.push(e.key);
    }
    await rpc('lm_push_mark', { p_secret: secret, p_endpoint: s.endpoint, p_sent: done }).catch(() => {});
  }));
  const chat = await chatPush(secret, subs, now);
  const ai = await aiPush(secret);
  const um = await umrahPush(secret);
  const asks = await askPush(secret);
  const posts = await postPush(secret);
  res.status(200).json({ ok: true, subs: subs.length, sent, dropped, chat, ai, um, asks, posts });
}
