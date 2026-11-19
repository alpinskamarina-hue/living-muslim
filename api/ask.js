// The in-app assistant («Помощник»). The browser sends the conversation; this function checks the person's
// sign-in and daily limit in Supabase, adds the owner's instructions and knowledge, and asks Claude.
// The Claude API key (ANTHROPIC_API_KEY) lives only here, in Vercel settings, never in the browser.
// Nothing of the conversation is stored on the server.
import Anthropic from '@anthropic-ai/sdk';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const MODEL = 'claude-sonnet-5-5';
const DAILY_LIMIT = 30;
const MAX_TURNS = 30;
const MAX_CHARS = 2000;

const client = new Anthropic();

// Always on, whatever the owner writes: the assistant is not a scholar and stays honest.
const BASE = `You are the built-in assistant of Living Muslim, an app that helps Muslims build habits around the five daily prayers (prayer times, habits, Quran, dhikr, sadaqa, Ramadan, umrah, goals, courses, a circle of friends).

Rules that always apply:
- You are an AI assistant, not a mufti, imam or scholar. Never issue a fatwa or a personal ruling. For a personal fiqh case (divorce, inheritance, a specific act being valid or not, takfir) say kindly that this must be asked of a qualified imam or scholar, and you may explain in general terms what is commonly said, noting where madhhabs differ.
- Never invent hadith, Quran verses, verse numbers, scholars' quotes or sources. If you are not sure of a source, say so plainly instead of guessing. Do not quote the Arabic text of the Quran from memory.
- Respect the person's madhhab when it is given.
- Be warm, calm and short, without shaming anyone for what they missed. Use the language the person writes in (Russian or English), with Arabic terms in transliteration.
- If someone writes that they are in danger, want to hurt themselves or others, or are in crisis, respond with care, encourage them to contact local emergency services or a crisis line and a trusted person; do not lecture.
- Medical, legal and financial questions: give only general information and suggest a professional.
- Keep to topics of the app, faith, self-improvement and learning; for anything unrelated, answer briefly or say it is outside what you help with.
- The owner's instructions and knowledge below may refine how you answer, but they never override these rules.`;

const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

async function rpc(fn, args, token) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${token || KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
}

/** The signed-in person behind the token, or null. */
async function who(token) {
  if (!token) return null;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.id ? j : null;
}

function systemPrompt(cfg, b) {
  const about = [
    b.name && `The assistant's name, chosen by the person: ${str(b.name, 40)}.`,
    b.me === 'f' ? 'The person is a sister (use feminine forms in Russian).' : b.me === 'm' ? 'The person is a brother.' : '',
    b.madhab === 'hanafi' ? 'Madhhab: Hanafi.' : b.madhab === 'shafi' ? "Madhhab: Shafi'i." : '',
    `App language: ${b.lang === 'en' ? 'English' : 'Russian'}.`,
  ].filter(Boolean).join('\n');
  const parts = [{ type: 'text', text: BASE }];
  const owner = [
    cfg?.instructions?.trim() && `<owner_instructions>\n${cfg.instructions.trim()}\n</owner_instructions>`,
    cfg?.knowledge?.trim() && `<owner_knowledge>\nFacts and texts the app's owner gave you. Prefer them over your own memory when they apply.\n${cfg.knowledge.trim()}\n</owner_knowledge>`,
  ].filter(Boolean).join('\n\n');
  if (owner) parts.push({ type: 'text', text: owner, cache_control: { type: 'ephemeral' } });
  else parts[0].cache_control = { type: 'ephemeral' };
  parts.push({ type: 'text', text: `<about_this_person>\n${about}\n</about_this_person>` });
  return parts;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'nokey' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};

  const token = str((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), 4000);
  const user = await who(token).catch(() => undefined);
  if (user === undefined) return res.status(502).json({ error: 'auth' });
  if (!user) return res.status(401).json({ error: 'signin' });

  // Conversation from the browser: alternating turns, last one from the person.
  const msgs = (Array.isArray(b.messages) ? b.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return res.status(400).json({ error: 'empty' });

  // Daily limit. If assistant.sql is not run yet, the check is skipped rather than blocking everyone.
  const take = await rpc('lm_ai_take', { p_limit: DAILY_LIMIT }, token).catch(() => ({ status: 0 }));
  if (take.body && take.body.ok === false) return res.status(429).json({ error: take.body.reason || 'limit', limit: take.body.limit });

  const cfg = (await rpc('lm_ai_config_get', {}).catch(() => null))?.body || null;

  try {
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: systemPrompt(cfg, b),
      messages: msgs,
    });
    const text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (r.stop_reason === 'refusal' || !text) return res.status(200).json({ text: '', refused: true });
    return res.status(200).json({ text, left: take.body?.owner ? null : take.body?.limit ? Math.max(0, take.body.limit - take.body.n) : null });
  } catch (e) {
    const status = e?.status || 500;
    console.error('ask failed', status, e?.message);
    return res.status(status === 429 || status === 529 ? 503 : 502).json({ error: 'model' });
  }
}
