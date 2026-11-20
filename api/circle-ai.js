// The assistant in a circle chat: a member writes «@Марьям, напомни мне в пятницу после Джумы…».
// The phone sends that message here; the server checks membership in Supabase, asks Claude for a short answer
// and an optional reminder, and posts the answer to the chat as a message of kind 'ai' (supabase/circle-ai.sql).
// Reminders for one person or for the whole circle are pushed by /api/push-tick. Only the asked message and
// the circle's day totals are sent to the model, never the rest of the conversation.
import Anthropic from '@anthropic-ai/sdk';
import adhan from 'adhan';
import { zoned } from './plans-ics.js';

const { Coordinates, CalculationMethod, PrayerTimes, Madhab, HighLatitudeRule } = adhan;
const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const MODEL = 'claude-sonnet-5-5';
const DAILY = 20;
const client = new Anthropic();
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'The answer posted in the circle chat: 1 to 3 short sentences, addressed to the person by name.' },
    remind: {
      type: 'object', additionalProperties: false,
      properties: {
        who: { type: 'string', enum: ['none', 'me', 'all'] },
        text: { type: 'string', description: 'What the notification says, short.' },
        date: { type: 'string', description: 'Local day YYYY-MM-DD, or empty.' },
        time: { type: 'string', description: 'Local time HH:MM, or empty when tied to a prayer.' },
        after_prayer: { type: 'string', enum: ['', 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] },
        minutes_after: { type: 'integer', description: 'Minutes after the prayer begins; 0 for the default (30, for Jumuah 60).' },
      },
      required: ['who', 'text', 'date', 'time', 'after_prayer', 'minutes_after'],
    },
    dua: { type: 'string', description: 'If the person asks the circle to make dua for them and wants it written as their dua request: the request text, short. Else empty.' },
  },
  required: ['reply', 'remind', 'dua'],
};

const SYSTEM = `You are the Living Muslim assistant, called into a circle chat of Muslims who keep habits around the five prayers together. Someone wrote a message that calls you. Answer only that message.
You can: set a reminder for the person who asked (who=me), set a reminder for everyone in the circle (who=all, only if allowed_all is yes; if not allowed, set it for the person and say kindly that only the amir can remind everyone), record their dua request (dua), answer short questions about the circle's day totals given below, or reply briefly.
Rules: you are not a mufti, never give fatwas or invent hadith; be warm and short; use the language of the message (Russian or English); never mention other members' private data, only the totals given. A reminder needs a day and a time or a prayer; if missing, pick a sensible moment (for example after the next Dhuhr) and say which. Do not claim you did anything else.`;

function prayerAt(place, day, pr, mins) {
  if (typeof place.lat !== 'number' || typeof place.lng !== 'number') return null;
  const coords = new Coordinates(place.lat, place.lng);
  const params = (CalculationMethod[place.method] || CalculationMethod.MuslimWorldLeague)();
  params.madhab = place.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.recommended(coords);
  const o = place.offsets || {};
  params.adjustments = { fajr: o.fajr || 0, sunrise: 0, dhuhr: o.dhuhr || 0, asr: o.asr || 0, maghrib: o.maghrib || 0, isha: o.isha || 0 };
  const [y, m, d] = day.split('-').map(Number);
  // PrayerTimes reads the calendar day of the given Date; noon UTC of that day is the same day everywhere that matters.
  const t = new PrayerTimes(coords, new Date(Date.UTC(y, m - 1, d, 12)), params);
  const key = pr === 'jumuah' ? 'dhuhr' : pr;
  return t[key].getTime() + (mins > 0 && mins <= 600 ? mins : pr === 'jumuah' ? 60 : 30) * 60000;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const secret = process.env.PUSH_SECRET;
  if (!process.env.ANTHROPIC_API_KEY || !secret) return res.status(503).json({ error: 'nokey' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const uid = str(b.uid, 40), token = str(b.token, 200), code = str(b.code, 40), text = str(b.text, 1000).trim();
  if (!uid || !token || !code || !text) return res.status(400).json({ error: 'empty' });

  let ctx;
  try { ctx = await rpc('lm_chat_ai_ctx', { p_secret: secret, p_uid: uid, p_token: token, p_code: code }); } catch { return res.status(503).json({ error: 'nosql' }); }
  if (!ctx?.ok) return res.status(403).json({ error: 'auth' });
  if (!ctx.on) return res.status(200).json({ off: true });
  if (ctx.today >= DAILY) return res.status(429).json({ error: 'limit' });

  const place = b.place && typeof b.place === 'object' ? b.place : {};
  const tz = str(place.tz, 60) || 'UTC';
  const now = new Date();
  const allowedAll = ctx.owner || ctx.all === 'all';
  const name = str(b.name, 30) || 'Марьям';
  const info = [
    `Your name here: ${name}. The person who asked: ${str(ctx.me, 40) || 'a member'}${ctx.owner ? ' (the amir of this circle)' : ''}${b.me === 'f' ? ', a sister' : b.me === 'm' ? ', a brother' : ''}.`,
    `Members in the circle: ${ctx.n}. allowed_all: ${allowedAll ? 'yes' : 'no'}.`,
    `Now: ${now.toLocaleString('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} (${tz}).`,
    str(b.circle, 1500) && `Circle today (day totals only): ${str(b.circle, 1500)}`,
  ].filter(Boolean).join('\n');

  let out;
  try {
    const r = await client.beta.messages.create({
      model: MODEL, max_tokens: 1500,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${info}\n\nMessage:\n${text}` }],
    });
    if (r.stop_reason === 'refusal') return res.status(200).json({ refused: true });
    out = JSON.parse(r.content.filter((c) => c.type === 'text').map((c) => c.text).join(''));
  } catch (e) {
    console.error('circle-ai model', e?.status, e?.message);
    return res.status(502).json({ error: 'model' });
  }

  let ping = null;
  const rm = out?.remind;
  if (rm && rm.who !== 'none' && /^\d{4}-\d{2}-\d{2}$/.test(rm.date || '')) {
    let at = null;
    if (rm.after_prayer) at = prayerAt(place, rm.date, rm.after_prayer, rm.minutes_after);
    else if (/^\d{1,2}:\d{2}$/.test(rm.time || '')) { const [y, m, d] = rm.date.split('-').map(Number); const [hh, mm] = rm.time.split(':').map(Number); at = zoned(tz, y, m, d, hh, mm); }
    if (at && at > Date.now() - 60000 && at < Date.now() + 60 * 864e5) ping = { at: new Date(at).toISOString(), body: str(rm.text, 200) || text.slice(0, 200), all: rm.who === 'all' && allowedAll };
  }
  const reply = str(out?.reply, 1500).trim() || '🤲';
  const ref = { r: Number(b.msg_id) || undefined, n: name, ...(ping ? { at: ping.at, all: ping.all, rt: ping.body, pr: rm.after_prayer || undefined } : {}) };
  let msg;
  try { msg = await rpc('lm_chat_ai_post', { p_secret: secret, p_uid: uid, p_code: code, p_body: reply, p_ref: ref, p_ping: ping }); } catch { return res.status(503).json({ error: 'nosql' }); }
  return res.status(200).json({ msg, dua: str(out?.dua, 200).trim() });
}
