// «Расшифровать» under a voice message in a circle chat. The phone sends { uid, token, id }; Supabase checks that the
// person is in that circle and hands over the audio (supabase/chat-transcribe.sql), Vercel AI Gateway turns it into
// text, and the text is saved once into the message, so the whole circle sees it and nobody pays for it twice.
// Mode "sum": { uid, token, code, items: [{ name, text }] } → a short demo-day summary (startup circle).
import { transcribe } from 'ai';
import Anthropic from '@anthropic-ai/sdk';
import { HAIKU, logUsage } from './_route.js';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const MODELS = ['openai/gpt-transcribe', 'openai/gpt-4o-mini-transcribe', 'openai/whisper-1'];
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

async function toText(audio, mime) {
  let last;
  for (const model of MODELS) {
    try {
      const r = await transcribe({ model, audio, providerOptions: { openai: { prompt: 'Мусульманский круг: намаз, дуа, ИншаАллах, МашаАллах, Альхамдулиллях, стартап, клиенты.' } } });
      console.log(`[stt] ${model} ${mime} ${r.durationInSeconds ?? '?'}s lang=${r.language ?? '?'}`);
      return (r.text || '').trim();
    } catch (e) { last = e; console.log(`[stt] ${model} failed: ${String(e?.message || e).slice(0, 200)}`); }
  }
  throw last;
}

const SUM_SYSTEM = `You summarize the weekly «demo day» of a small startup team of Muslims. Each member recorded one minute by voice: what they did, where they are stuck, what they need. You get the transcripts. Write in the language of the transcripts (Russian or English), warm and short, no fatwas, no invented facts.
Format, plain text, no markdown headings:
one line per person: «Имя: сделал … · застрял … · нужно …» (skip a part they did not mention);
then «Команде:» and 1 to 3 short practical suggestions (who can help whom, what to decide this week).`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query?.check === '1') {
    // health check: one second of silence through the gateway proves that the key/OIDC and credits work
    const n = 16000, wav = Buffer.alloc(44 + n * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + n * 2, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(n * 2, 40);
    try { await toText(wav, 'audio/wav'); return res.status(200).json({ ok: true }); } catch (e) { return res.status(200).json({ ok: false, error: String(e?.message || e).slice(0, 300) }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const secret = process.env.PUSH_SECRET;
  if (!secret) return res.status(503).json({ error: 'nokey' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const uid = str(b.uid, 40), token = str(b.token, 200);
  if (!uid || !token) return res.status(400).json({ error: 'empty' });

  if (b.mode === 'sum') {
    // the summary only sees transcripts the phone already has from messages the person can read
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12).map((x) => ({ name: str(x?.name, 40), text: str(x?.text, 3000) })).filter((x) => x.text && x.text !== '…');
    if (!items.length) return res.status(400).json({ error: 'empty' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'nokey' });
    const code = str(b.code, 40);
    try { const ctx = await rpc('lm_chat_ai_ctx', { p_secret: secret, p_uid: uid, p_token: token, p_code: code }); if (!ctx?.ok) return res.status(403).json({ error: 'auth' }); } catch { return res.status(503).json({ error: 'nosql' }); }
    try {
      const client = new Anthropic();
      const r = await client.messages.create({ model: HAIKU, max_tokens: 900, system: SUM_SYSTEM, messages: [{ role: 'user', content: items.map((x) => `${x.name}: ${x.text}`).join('\n\n') }] });
      logUsage('demo-day', HAIKU, r.usage);
      const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
      return res.status(200).json({ text });
    } catch { return res.status(502).json({ error: 'busy' }); }
  }

  const id = Number(b.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'empty' });
  let ctx;
  try { ctx = await rpc('lm_chat_tr_get', { p_secret: secret, p_uid: uid, p_token: token, p_id: id }); } catch { return res.status(503).json({ error: 'nosql' }); }
  if (!ctx) return res.status(503).json({ error: 'nosql' });
  if (ctx.error) return res.status(ctx.error === 'limit' ? 429 : 403).json({ error: ctx.error });
  if (typeof ctx.text === 'string') return res.status(200).json({ text: ctx.text });
  if (!ctx.b64) return res.status(404).json({ error: 'gone' });

  let text;
  try { text = await toText(Buffer.from(ctx.b64, 'base64'), ctx.mime); } catch { return res.status(502).json({ error: 'busy' }); }
  let msg = null;
  try { msg = await rpc('lm_chat_tr_save', { p_secret: secret, p_id: id, p_text: text }); } catch { /* the text still goes back */ }
  return res.status(200).json({ text: msg?.body ?? (text || '…'), msg });
}
