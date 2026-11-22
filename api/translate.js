// «Перевести» in circle and personal chats. The phone sends { uid, token, code, to, items: [{ id, text }] } for
// messages it already shows; Supabase checks that the person is in that chat (lm_chat_ai_ctx), and a small model
// translates. Nothing is stored here: the phone keeps the answers.
// Ayahs are never machine-translated: the model only names surah and ayah, and the phone shows the checked
// translation. Hadith and du'a in Arabic come back as "sacred" with no text.
import Anthropic from '@anthropic-ai/sdk';
import { HAIKU, logUsage } from './_route.js';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const LANGS = { ru: 'Russian', en: 'English' };

async function rpc(fn, args) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          lang: { type: 'string', description: 'ISO 639-1 code of the language the message is written in, e.g. tr, ar, en, ru, de, bs, uz' },
          kind: {
            type: 'string',
            enum: ['text', 'quran', 'sacred', 'same'],
            description: 'text: an ordinary message, translated. quran: the message is (almost) only a Quran verse quoted word for word. sacred: the message is (almost) only a hadith or a du\'a/dhikr in Arabic. same: already in the target language, nothing to translate.',
          },
          text: { type: 'string', description: 'the translation for kind text; empty for quran, sacred and same' },
          s: { type: 'integer', description: 'surah 1..114 for kind quran, else 0' },
          a: { type: 'integer', description: 'ayah number for kind quran (the first one if several), else 0' },
        },
        required: ['id', 'lang', 'kind', 'text', 's', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

const system = (to) => `You translate short chat messages between Muslims in a habits app (circles of family and friends from different countries). Translate each message into ${LANGS[to]}.
Rules:
- Translate faithfully and naturally, like a friend would write it. Keep the tone, emoji, names of people and places. Do not add, explain or soften anything.
- Keep common Islamic phrases as Muslims say them in ${LANGS[to]}, not translated: ${to === 'ru' ? 'ИншаАллах, МашаАллах, Альхамдулиллях, СубханАллах, БаракАллаху фик, Джазак Аллаху хайран, Амин, Ассаляму алейкум, Аллаху Акбар; also «Аллах», «Пророк ﷺ», «намаз», «джума», «дуа», «умра»' : 'InshaAllah, MashaAllah, Alhamdulillah, SubhanAllah, BarakAllahu feek, JazakAllahu khayran, Ameen, Assalamu alaikum, Allahu Akbar; also Allah, the Prophet ﷺ, salah, Jumu\'ah, du\'a, umrah'}.
- If a message is (almost) only a verse of the Quran quoted word for word, do NOT translate it: kind "quran" with its surah and ayah, only when you are sure; if unsure, kind "sacred".
- If a message is (almost) only a hadith or a du'a/dhikr in Arabic, do NOT translate it: kind "sacred".
- If a message mixes ordinary words with a short Arabic phrase, translate the ordinary words and keep the Arabic phrase as written.
- If a message is already in ${LANGS[to]}, kind "same".
- Return one item per message, with the same id.`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const secret = process.env.PUSH_SECRET;
  if (!secret || !process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'nokey' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const uid = str(b.uid, 40), token = str(b.token, 200), code = str(b.code, 40);
  const to = b.to === 'en' ? 'en' : 'ru';
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 12)
    .map((x) => ({ id: Number(x?.id), text: str(x?.text, 2000).trim() }))
    .filter((x) => Number.isFinite(x.id) && x.id > 0 && x.text);
  if (!uid || !token || !code || !items.length) return res.status(400).json({ error: 'empty' });
  try {
    const ctx = await rpc('lm_chat_ai_ctx', { p_secret: secret, p_uid: uid, p_token: token, p_code: code });
    if (!ctx?.ok) return res.status(403).json({ error: 'auth' });
  } catch { return res.status(503).json({ error: 'nosql' }); }

  try {
    const client = new Anthropic();
    const r = await client.messages.create({
      model: HAIKU,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: system(to),
      messages: [{ role: 'user', content: items.map((x) => `<msg id="${x.id}">\n${x.text}\n</msg>`).join('\n') }],
    });
    logUsage('translate', HAIKU, r.usage);
    if (r.stop_reason === 'refusal') return res.status(200).json({ items: [] });
    let out;
    try { out = JSON.parse(r.content.filter((c) => c.type === 'text').map((c) => c.text).join('')); } catch { out = null; }
    if (!out) return res.status(502).json({ error: 'busy' });
    const ids = new Set(items.map((x) => x.id));
    const list = (out.items || []).filter((x) => ids.has(x.id)).map((x) => {
      const kind = ['text', 'quran', 'sacred', 'same'].includes(x.kind) ? x.kind : 'text';
      const q = kind === 'quran' && x.s >= 1 && x.s <= 114 && x.a >= 1 && x.a <= 286;
      return {
        id: x.id, lang: str(x.lang, 5).toLowerCase(),
        kind: kind === 'quran' && !q ? 'sacred' : kind,
        text: kind === 'text' ? str(x.text, 4000).trim() : '',
        ...(q ? { s: x.s, a: x.a } : {}),
      };
    });
    return res.status(200).json({ items: list });
  } catch (e) {
    const status = e?.status || 500;
    console.error('translate failed', status, e?.message);
    return res.status(status === 429 || status === 529 ? 503 : 502).json({ error: 'busy' });
  }
}
