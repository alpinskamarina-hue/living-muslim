// «Перевод хутбы»: the phone recognises the imam's speech itself (Web Speech API, free) and sends short pieces of
// text here; a small model translates them into the person's language. Audio never reaches the server, and the
// server stores nothing: text in, translation out.
//   mode "tr":  { from, to, text, prev }  → { lines: [{ text, terms }], ayahs: [{ s, a }], other }
//   mode "sum": { to, text }              → { points: [..3], habit: { action, minimum, after_prayer } | null }
import Anthropic from '@anthropic-ai/sdk';
import { logUsage } from './_route.js';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const MODEL = 'claude-haiku-5-5';

const client = new Anthropic();
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const LANGS = { ar: 'Arabic', tr: 'Turkish', en: 'English', ru: 'Russian' };

async function who(token) {
  if (!token) return null;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.id ? j : null;
}

const TR_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      description: 'the translation of the new text, split into sentences, in order',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'one translated sentence' },
          terms: {
            type: 'array',
            description: 'Islamic terms kept in transliteration inside this sentence that a newcomer may not know (taqwa, muhasaba, ihsan); usually none',
            items: {
              type: 'object',
              properties: {
                w: { type: 'string', description: 'the term exactly as written in the translated sentence' },
                src: { type: 'string', description: 'the term in Arabic script' },
                note: { type: 'string', description: 'a short neutral explanation, at most 15 words, in the target language' },
              },
              required: ['w', 'src', 'note'],
              additionalProperties: false,
            },
          },
        },
        required: ['text', 'terms'],
        additionalProperties: false,
      },
    },
    ayahs: {
      type: 'array',
      description: 'Quran verses the new text clearly quotes word for word (not just mentions); usually none',
      items: {
        type: 'object',
        properties: { s: { type: 'integer', description: 'surah 1..114' }, a: { type: 'integer', description: 'ayah number' } },
        required: ['s', 'a'],
        additionalProperties: false,
      },
    },
    other: { type: 'boolean', description: 'true if the recognised text looks like a different language misheard as the expected one (gibberish)' },
  },
  required: ['lines', 'ayahs', 'other'],
  additionalProperties: false,
};

const SUM_SCHEMA = {
  type: 'object',
  properties: {
    points: { type: 'array', items: { type: 'string' }, description: 'the 3 main thoughts of the sermon, one short sentence each' },
    habit: {
      type: 'object',
      description: 'one small daily habit that follows from the sermon advice; empty action if nothing fits',
      properties: {
        action: { type: 'string', description: 'the habit, 2–6 words, e.g. «Итог дня перед сном»' },
        minimum: { type: 'string', description: 'the smallest version, e.g. «1 минута»' },
        after_prayer: { type: 'string', enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] },
      },
      required: ['action', 'minimum', 'after_prayer'],
      additionalProperties: false,
    },
  },
  required: ['points', 'habit'],
  additionalProperties: false,
};

const trSystem = (from, to) => `You translate a Friday sermon (khutbah) or an Islamic lesson live, for a listener in a mosque who reads the translation as subtitles on the phone.
The source is ${LANGS[from]} speech recognised by the phone's speech recognition: it has no punctuation, may have misheard words, repeats and cut-off pieces. The khutbah may be in Modern Standard Arabic or a dialect, with Quran and hadith quotes.
Translate only the new text into ${LANGS[to]}. The previous text is given only for context: do not translate it again.
Rules:
- Natural, simple ${LANGS[to]}, faithful to the meaning. Keep it short: subtitles, not commentary. Never add your own explanations, opinions or rulings.
- Keep established Islamic forms: Allah, the Prophet ﷺ, names of prophets and companions as Muslims say them in ${LANGS[to]}. For Russian use forms like «Аллах», «Пророк ﷺ», «намаз», «таква».
- Opening formulas (praise of Allah, salawat, shahada) are translated briefly.
- If a part is unclear or garbled, translate what is clear and write «…» for the rest. Never invent content.
- If the new text is a Quran verse quoted word for word, give its surah and ayah in ayahs (only when you are sure), and still translate it in lines.
- If the new text makes no sense as ${LANGS[from]} (it sounds like another language misheard), set other=true and return no lines.`;

const sumSystem = (to) => `You get the live translation of a Friday sermon (khutbah). Write in ${LANGS[to]}: the 3 main thoughts, one short sentence each, faithful to what was said, without adding anything. Then suggest one small daily habit that follows from the advice of the sermon (for a Muslim habits app), or an empty action if nothing fits. Never give rulings.`;

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

  if (b.mode === 'rate') {
    // How the translation went during the test: one line in the logs, no text of the sermon.
    console.log(`[khutba-rate] ${['good', 'ok', 'bad'].includes(b.v) ? b.v : '?'} ${str(b.from, 2)}>${str(b.to, 2)} ${Math.max(0, Math.min(300, Math.round(Number(b.mins) || 0)))}min`);
    return res.status(204).end();
  }
  const to = ['ru', 'en', 'tr'].includes(b.to) ? b.to : 'ru';
  const sum = b.mode === 'sum';
  const from = ['ar', 'tr', 'en'].includes(b.from) ? b.from : 'ar';
  const text = str(b.text, sum ? 30000 : 2500).trim();
  if (!text) return res.status(400).json({ error: 'text' });

  try {
    const r = await client.beta.messages.create({
      model: MODEL,
      max_tokens: sum ? 1500 : 2500,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: sum ? SUM_SCHEMA : TR_SCHEMA } },
      system: sum ? sumSystem(to) : trSystem(from, to),
      messages: [{
        role: 'user',
        content: sum
          ? `<translation>\n${text}\n</translation>`
          : `<previous>${str(b.prev, 800)}</previous>\n<new>${text}</new>`,
      }],
    });
    logUsage(sum ? 'khutba-sum' : 'khutba', MODEL, r.usage);
    if (r.stop_reason === 'refusal') return res.status(200).json(sum ? { points: [], habit: null } : { lines: [], ayahs: [], other: false });
    let out;
    try { out = JSON.parse(r.content.filter((c) => c.type === 'text').map((c) => c.text).join('')); } catch { out = null; }
    if (!out) return res.status(502).json({ error: 'model' });
    if (sum) {
      const h = out.habit && str(out.habit.action, 80).trim() ? { action: str(out.habit.action, 80).trim(), minimum: str(out.habit.minimum, 60).trim(), after_prayer: out.habit.after_prayer } : null;
      return res.status(200).json({ points: (out.points || []).slice(0, 3).map((p) => str(p, 300)), habit: h });
    }
    const lines = (out.lines || []).slice(0, 12).map((l) => ({
      text: str(l.text, 600).trim(),
      terms: (l.terms || []).slice(0, 4).map((t) => ({ w: str(t.w, 40), src: str(t.src, 40), note: str(t.note, 200) })).filter((t) => t.w && l.text.includes(t.w)),
    })).filter((l) => l.text);
    const ayahs = (out.ayahs || []).slice(0, 3).filter((x) => x.s >= 1 && x.s <= 114 && x.a >= 1 && x.a <= 286);
    return res.status(200).json({ lines, ayahs, other: Boolean(out.other) });
  } catch (e) {
    const status = e?.status || 500;
    console.error('khutba failed', status, e?.message);
    return res.status(status === 429 || status === 529 ? 503 : 502).json({ error: 'model' });
  }
}
