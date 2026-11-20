// «Память помощника»: the phone sends the current memory note and the chat messages that are about to leave
// the conversation window; a small model folds what matters into the note and sends it back.
// The note lives on the phone (Профиль → Помощник), the server stores nothing.
import Anthropic from '@anthropic-ai/sdk';

const SB = 'https://pbpllsoiesquknuibyyj.supabase.co';
const KEY = 'sb_publishable_hKSYzKUSU94W_1OXxQxvxQ_bhLfzzdo';
const MODEL = 'claude-haiku-5-5';
const MEMORY_MAX = 3000;

const client = new Anthropic();
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

async function who(token) {
  if (!token) return null;
  const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.id ? j : null;
}

const SYSTEM = `You keep the long-term memory of a personal assistant in Living Muslim, a Muslim habits app. You get the current memory note and older chat messages between the person and the assistant. Return the updated note.

What to keep: lasting facts and wishes about the person that help later conversations. Examples: goals and deadlines they talked about, what is hard for them (waking for Fajr, focus), what they are reading or learning, their routine and circumstances (work shifts, studies, family), preferences about how to be helped, promises the assistant made, important decisions.
What to drop: greetings, one-off questions already answered, general religious explanations, anything the app shows anyway (exact habit lists and numbers), and anything they asked to forget.
Sensitive things (health, family conflicts, money troubles) only in neutral, minimal words, and only if they asked for help with it.

Rules:
- Merge with the current note: update facts that changed, remove ones that are no longer true, keep the rest.
- Short lines starting with «- », newest important things first. At most 25 lines and ${MEMORY_MAX} characters in total.
- Write in the language of the conversation (Russian or English), about the person in the third person, without names of other people unless needed.
- Never invent anything that is not in the note or the messages.
- Output only the note, nothing else. If there is nothing worth keeping, output the current note unchanged (or an empty line if it is empty).`;

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

  const memory = str(b.memory, MEMORY_MAX + 500).trim();
  const lines = (Array.isArray(b.messages) ? b.messages : []).slice(-60)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'Person' : 'Assistant'}: ${m.content.slice(0, 2000)}`);
  if (!lines.length) return res.status(200).json({ memory });

  try {
    const r = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `<current_note>\n${memory || '(empty)'}\n</current_note>\n\n<older_messages>\n${lines.join('\n\n')}\n</older_messages>\n\nReturn the updated note.` }],
    });
    if (r.stop_reason === 'refusal') return res.status(200).json({ memory, kept: true });
    let text = r.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    if (text === '(empty)') text = '';
    return res.status(200).json({ memory: text.slice(0, MEMORY_MAX) });
  } catch (e) {
    console.error('remember failed', e?.status, e?.message);
    return res.status(502).json({ error: 'model' });
  }
}
