// «Фото еды»: the phone sends one food photo (already shrunk to ~1024 px JPEG); Claude names the dishes on it
// with grams, a calorie range and macros. The photo is not stored anywhere: it lives only in this request.
// Limit: 10 recognised photos a day per person (supabase/food-photo.sql); the owner has none.
import Anthropic from '@anthropic-ai/sdk';
import { logUsage } from './_route.js';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const MODEL = 'claude-sonnet-5-5';
const DAILY_LIMIT = 10;
const MAX_B64 = 3_000_000; // ~2.2 MB image

const client = new Anthropic();

async function rpc(fn, args, token) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${token || KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
}

async function who(token) {
  if (!token) return null;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.id ? j : null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    food: { type: 'boolean', description: 'true if the photo shows food or drink that can be estimated' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'short dish name in the requested language, e.g. «Плов с говядиной»' },
          grams: { type: 'number', description: 'estimated weight of what is visible, in grams (ml for drinks)' },
          pieces: { type: 'number', description: 'number of pieces if the food is counted in pieces (eggs, flatbread, dates, slices), else 0' },
          unit: { type: 'string', description: 'word for one piece in the requested language (шт, кусок, slice), empty if not counted' },
          kcal_low: { type: 'number' },
          kcal_high: { type: 'number' },
          protein: { type: 'number', description: 'grams' },
          fat: { type: 'number', description: 'grams' },
          carbs: { type: 'number', description: 'grams' },
          box: {
            type: 'array', items: { type: 'number' },
            description: 'where the dish is on the photo: [x, y] of its centre, each 0..1 from the top-left',
          },
        },
        required: ['name', 'grams', 'pieces', 'unit', 'kcal_low', 'kcal_high', 'protein', 'fat', 'carbs', 'box'],
        additionalProperties: false,
      },
    },
    check: { type: 'string', description: 'empty, or one short gentle note when a dish often contains pork, alcohol or gelatin' },
    why: { type: 'string', description: 'when food is false: one short reason in the requested language (too dark, packaging, not food)' },
  },
  required: ['food', 'items', 'check', 'why'],
  additionalProperties: false,
};

const SYSTEM = `You estimate food from a single photo for the nutrition diary of Living Muslim, a habits app for Muslims.
List each separate dish or drink you can see (at most 8). Estimate the portion actually on the plate from plate size, cutlery and hands. Give calories as an honest range (low to high, about ±15–25%), and protein, fat and carbs in grams for the middle of the range. Typical home cooking of Central Asia, the Caucasus, the Middle East, Russia and Europe is common: name dishes the way people there do (плов, лагман, манты, шаурма, долма).
Write names and notes in the requested language.
If the photo is not food, is too dark or blurry, or shows only closed packaging, set food=false, items=[] and a short reason in why.
The check field: only when a visible dish commonly contains pork, alcohol or gelatin (sausage, pepperoni, ham, tiramisu, gummies, some desserts and sauces), one short neutral sentence suggesting to check the ingredients. Never call anything haram or halal, never give a ruling. Otherwise leave it empty.`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'nokey' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const img = typeof b.image === 'string' ? b.image.replace(/^data:image\/\w+;base64,/, '') : '';
  const type = ['image/jpeg', 'image/png', 'image/webp'].includes(b.type) ? b.type : 'image/jpeg';
  if (!img || img.length > MAX_B64 || !/^[A-Za-z0-9+/=]+$/.test(img.slice(0, 200))) return res.status(400).json({ error: 'image' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').slice(0, 4000);
  const user = await who(token).catch(() => undefined);
  if (user === undefined) return res.status(502).json({ error: 'auth' });
  if (!user) return res.status(401).json({ error: 'signin' });

  // If food-photo.sql is not run yet, the check is skipped rather than blocking everyone.
  const take = await rpc('lm_photo_take', { p_limit: DAILY_LIMIT }, token).catch(() => ({ status: 0 }));
  if (take.body && take.body.ok === false) return res.status(429).json({ error: take.body.reason || 'limit', limit: take.body.limit });
  const counted = Boolean(take.body?.ok && !take.body.owner);
  const giveBack = () => (counted ? rpc('lm_photo_give', {}, token).catch(() => null) : null);
  const left = take.body?.owner ? null : take.body?.limit ? Math.max(0, take.body.limit - take.body.n) : null;

  try {
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: type, data: img } },
          { type: 'text', text: `Language: ${b.lang === 'en' ? 'English' : 'Russian'}. What food is on this photo?` },
        ],
      }],
    });
    logUsage('food-photo', MODEL, r.usage);
    if (r.stop_reason === 'refusal') { await giveBack(); return res.status(200).json({ food: false, items: [], why: '', left: left === null ? null : left + (counted ? 1 : 0) }); }
    const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    let out;
    try { out = JSON.parse(text); } catch { out = null; }
    if (!out || !out.food || !Array.isArray(out.items) || !out.items.length) {
      await giveBack();
      return res.status(200).json({ food: false, items: [], why: String(out?.why || '').slice(0, 200), left: left === null ? null : left + (counted ? 1 : 0) });
    }
    const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
    const items = out.items.slice(0, 8).map((i) => ({
      name: String(i.name || '').slice(0, 60), grams: n(i.grams, 3000), pieces: Math.max(0, Math.min(50, Number(i.pieces) || 0)), unit: String(i.unit || '').slice(0, 12),
      lo: n(i.kcal_low, 5000), hi: Math.max(n(i.kcal_low, 5000), n(i.kcal_high, 5000)), p: n(i.protein, 500), f: n(i.fat, 500), c: n(i.carbs, 1000),
      x: Math.max(0, Math.min(1, Number(i.box?.[0]) || 0.5)), y: Math.max(0, Math.min(1, Number(i.box?.[1]) || 0.5)),
    })).filter((i) => i.name);
    return res.status(200).json({ food: true, items, check: String(out.check || '').slice(0, 300), left });
  } catch (e) {
    await giveBack();
    const status = e?.status || 500;
    console.error('food-photo failed', status, e?.message);
    return res.status(status === 429 || status === 529 ? 503 : 502).json({ error: 'model' });
  }
}
