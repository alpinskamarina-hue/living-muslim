// Calendar subscription for «Планы» (Google, Apple, Outlook): GET /api/plans-ics?t=<secret>.
// Plans from two weeks back to two months ahead, and the five prayers for the next month, at the person's place.
// The secret is made in Профиль → Планы → ⚙︎ and can be replaced or switched off there.
import adhan from 'adhan';

const { Coordinates, CalculationMethod, PrayerTimes, Madhab, HighLatitudeRule } = adhan;
const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const NAMES = { ru: { fajr: 'Фаджр', dhuhr: 'Зухр', asr: 'Аср', maghrib: 'Магриб', isha: 'Иша', jumuah: 'Джума' }, en: { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha', jumuah: "Jumu'ah" } };
const AFTER = { ru: { fajr: 'после Фаджра', dhuhr: 'после Зухра', asr: 'после Асра', maghrib: 'после Магриба', isha: 'после Иши', jumuah: 'после Джумы' }, en: { fajr: 'after Fajr', dhuhr: 'after Dhuhr', asr: 'after Asr', maghrib: 'after Maghrib', isha: 'after Isha', jumuah: "after Jumu'ah" } };
const ANCHORS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function localParts(tz, at) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}
export function zoned(tz, y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = localParts(tz, new Date(guess));
  return guess - (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - guess);
}
const keyOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const fromKey = (k) => k.split('-').map(Number);
const addDays = (k, n) => { const [y, m, d] = fromKey(k); const t = new Date(Date.UTC(y, m - 1, d + n)); return keyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
const dow = (k) => { const [y, m, d] = fromKey(k); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

function onDay(p, k) {
  if (p.del || k < p.date) return false;
  if (k === p.date) return true;
  if (!p.repeat) return false;
  if (p.repeat === 'day') return true;
  if (p.repeat === 'week') return dow(p.date) === dow(k);
  return fromKey(p.date)[2] === fromKey(k)[2];
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (t) => String(t || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\r?\n/g, '\\n');
/** Lines longer than 75 octets are folded, as calendars expect. */
function fold(line) {
  const b = Buffer.from(line, 'utf8');
  if (b.length <= 74) return line;
  const out = []; let cur = '';
  for (const ch of line) { if (Buffer.byteLength(cur + ch) > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
  out.push(cur);
  return out.join('\r\n');
}

export function buildIcs(plans, place, now = Date.now()) {
  const tz = place.tz || 'UTC';
  const lang = place.lang === 'en' ? 'en' : 'ru';
  const hasPlace = typeof place.lat === 'number' && typeof place.lng === 'number';
  let params, coords;
  if (hasPlace) {
    coords = new Coordinates(place.lat, place.lng);
    params = (CalculationMethod[place.method] || CalculationMethod.MuslimWorldLeague)();
    params.madhab = place.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
    params.highLatitudeRule = HighLatitudeRule.recommended(coords);
    const o = place.offsets || {};
    params.adjustments = { fajr: o.fajr || 0, sunrise: 0, dhuhr: o.dhuhr || 0, asr: o.asr || 0, maghrib: o.maghrib || 0, isha: o.isha || 0 };
  }
  const cache = new Map();
  const times = (k) => {
    if (!hasPlace) return null;
    if (!cache.has(k)) { const [y, m, d] = fromKey(k); cache.set(k, new PrayerTimes(coords, new Date(y, m - 1, d, 12), params)); }
    return cache.get(k);
  };
  const t0 = localParts(tz, new Date(now));
  const today = keyOf(t0.y, t0.m, t0.d);
  const ev = [];
  const add = (uid, title, start, end, allDay, desc) => {
    ev.push('BEGIN:VEVENT', `UID:${uid}@living-muslim`, `DTSTAMP:${stamp(now)}`);
    if (allDay) ev.push(`DTSTART;VALUE=DATE:${start.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(start, 1).replace(/-/g, '')}`);
    else ev.push(`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`);
    ev.push(fold(`SUMMARY:${esc(title)}`));
    if (desc) ev.push(fold(`DESCRIPTION:${esc(desc)}`));
    ev.push('END:VEVENT');
  };

  for (const p of Array.isArray(plans) ? plans.slice(0, 2000) : []) {
    if (!p || p.del || typeof p.text !== 'string' || typeof p.date !== 'string') continue;
    for (let i = -14; i <= 60; i++) {
      const k = addDays(today, i);
      if (!(p.week ? k === p.date : onDay(p, k))) continue;
      const done = Array.isArray(p.done) && p.done.includes(k);
      const title = (done ? '✓ ' : '') + p.text.slice(0, 200);
      const desc = [p.week ? (lang === 'en' ? 'this week' : 'на неделе') : '', p.after ? AFTER[lang][p.after] : '', p.list || '', p.note || ''].filter(Boolean).join('\n');
      let start = null;
      if (p.after && ANCHORS.concat('jumuah').includes(p.after)) {
        const t = times(k);
        if (t) start = t[p.after === 'jumuah' ? 'dhuhr' : p.after].getTime() + (p.after === 'jumuah' ? 60 : 30) * 60000;
      } else if (typeof p.time === 'string' && /^\d{1,2}:\d{2}$/.test(p.time)) {
        const [y, m, d] = fromKey(k); const [hh, mm] = p.time.split(':').map(Number);
        start = zoned(tz, y, m, d, hh, mm);
      }
      const uid = `${String(p.id).slice(0, 24)}-${k}`;
      if (start == null) add(uid, title, k, null, true, desc);
      else add(uid, title, start, start + 30 * 60000, false, desc);
    }
  }
  if (hasPlace) {
    for (let i = -1; i <= 30; i++) {
      const k = addDays(today, i); const t = times(k);
      const fri = dow(k) === 5;
      for (const a of ANCHORS) {
        const s = t[a].getTime();
        add(`pr-${a}-${k}`, `🕌 ${a === 'dhuhr' && fri ? NAMES[lang].jumuah : NAMES[lang][a]}`, s, s + 15 * 60000, false, '');
      }
    }
  }
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Living Muslim//Plans//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${lang === 'en' ? 'Living Muslim · Plans' : 'Living Muslim · Планы'}`), `X-WR-TIMEZONE:${tz}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
    ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

export default async function handler(req, res) {
  const t = String(req.query?.t || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(t)) return res.status(404).send('Not found');
  const r = await fetch(`${SB}/rest/v1/rpc/lm_plans_feed`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: t }) });
  if (!r.ok) return res.status(502).send('Calendar is not available right now');
  const j = await r.json().catch(() => null);
  if (!j) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="living-muslim-plans.ics"');
  res.setHeader('Cache-Control', 'private, max-age=900');
  return res.send(buildIcs(j.plans, j.place || {}));
}
