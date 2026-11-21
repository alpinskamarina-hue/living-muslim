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

// «Халяль-сканер», product not in the database: read the ingredient list off a photo of the pack, word for word.
// The app checks the words itself; the model never gives a ruling.
const ING_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true if an ingredient list is readable on the photo' },
    name: { type: 'string', description: 'product name if visible on the pack, else empty' },
    ingredients: { type: 'string', description: 'the ingredient list copied word for word in its original language, including E-numbers; empty if not readable' },
    halal_logo: { type: 'boolean', description: 'true only if a halal logo or the word halal/helal/حلال is clearly printed on the pack' },
    why: { type: 'string', description: 'when ok is false: one short reason in the requested language (too blurry, no ingredient list on the photo)' },
  },
  required: ['ok', 'name', 'ingredients', 'halal_logo', 'why'],
  additionalProperties: false,
};

const ING_SYSTEM = `You read food packaging for the halal ingredient checker of Living Muslim, a habits app for Muslims.
Copy the ingredient list from the photo exactly as printed, in its original language, with E-numbers and percentages. Do not translate, summarise or add anything. If the list continues off the photo, copy what is visible.
Say whether a halal logo or the word halal/helal/حلال is clearly printed. Never judge whether the product is halal or haram.
If no ingredient list is readable, set ok=false, ingredients="" and give a short reason in why, in the requested language.`;

// «Что съел?» by hand, dish not in the table: a rough guess from the words alone («кофе со сливками»).
// Text is cheap, so it does not take from the 10 photos a day; it still needs sign-in.
const TEXT_MODEL = 'claude-haiku-5-5';
const TEXT_SCHEMA = {
  type: 'object',
  properties: {
    food: { type: 'boolean', description: 'true if the words describe food or drink' },
    name: { type: 'string', description: 'short tidy dish name in the requested language' },
    grams: { type: 'number', description: 'the portion meant (from the words, else one typical serving), grams or ml' },
    kcal: { type: 'number', description: 'calories of that portion, middle estimate' },
    protein: { type: 'number' }, fat: { type: 'number' }, carbs: { type: 'number' },
    portion: { type: 'string', description: 'the assumed portion in a few words in the requested language, e.g. «чашка 250 мл, 2 ст. л. сливок»' },
  },
  required: ['food', 'name', 'grams', 'kcal', 'protein', 'fat', 'carbs', 'portion'],
  additionalProperties: false,
};
const TEXT_SYSTEM = `You estimate one food or drink from a short text for the nutrition diary of Living Muslim.
If the text gives an amount (300 г, 2 шт, большая чашка), use it; otherwise assume one ordinary serving and say which in portion.
Give calories for that portion as one middle estimate and protein, fat and carbs in grams. Home cooking of Central Asia, the Caucasus, the Middle East, Russia and Europe is common.
Write name and portion in the requested language. If the text is not food or drink, set food=false and zeros.`;

async function textGuess(b, res) {
  const text = String(b.text || '').trim().slice(0, 120);
  if (text.length < 2) return res.status(400).json({ error: 'text' });
  try {
    const r = await client.beta.messages.create({
      model: TEXT_MODEL,
      max_tokens: 600,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { format: { type: 'json_schema', schema: TEXT_SCHEMA } },
      system: TEXT_SYSTEM,
      messages: [{ role: 'user', content: `Language: ${b.lang === 'en' ? 'English' : 'Russian'}. Food: ${text}` }],
    });
    logUsage('food-text', TEXT_MODEL, r.usage);
    const raw = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
    let out;
    try { out = JSON.parse(raw); } catch { out = null; }
    if (r.stop_reason === 'refusal' || !out || !out.food) return res.status(200).json({ food: false });
    const n = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
    return res.status(200).json({
      food: true, name: String(out.name || text).slice(0, 40), grams: n(out.grams, 3000), k: n(out.kcal, 5000),
      p: n(out.protein, 500), f: n(out.fat, 500), c: n(out.carbs, 1000), portion: String(out.portion || '').slice(0, 80),
    });
  } catch (e) {
    const status = e?.status || 500;
    console.error('food-text failed', status, e?.message);
    return res.status(status === 429 || status === 529 ? 503 : 502).json({ error: 'model' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'nokey' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  if (b.task === 'text') {
    const tk = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').slice(0, 4000);
    const u = await who(tk).catch(() => undefined);
    if (u === undefined) return res.status(502).json({ error: 'auth' });
    if (!u) return res.status(401).json({ error: 'signin' });
    return textGuess(b, res);
  }
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

  if (b.task === 'ingredients') {
    try {
      const r = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 3000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ING_SCHEMA } },
        system: ING_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: img } },
            { type: 'text', text: `Language for why: ${b.lang === 'en' ? 'English' : 'Russian'}. Copy the ingredient list.` },
          ],
        }],
      });
      logUsage('halal-photo', MODEL, r.usage);
      const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
      let out;
      try { out = JSON.parse(text); } catch { out = null; }
      const ingredients = String(out?.ingredients || '').slice(0, 2000).trim();
      if (r.stop_reason === 'refusal' || !out || !out.ok || !ingredients) {
        await giveBack();
        return res.status(200).json({ ok: false, why: String(out?.why || '').slice(0, 200), left: left === null ? null : left + (counted ? 1 : 0) });
      }
      return res.status(200).json({ ok: true, name: String(out.name || '').slice(0, 80), ingredients, halal_logo: Boolean(out.halal_logo), left });
    } catch (e) {
      await giveBack();
      const status = e?.status || 500;
      console.error('halal-photo failed', status, e?.message);
      return res.status(status === 429 || status === 529 ? 503 : 502).json({ error: 'model' });
    }
  }

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
