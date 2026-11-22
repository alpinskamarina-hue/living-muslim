// Translation of chat messages in circles and personal chats («Перевести» under a message in another language).
// The phone guesses the language by its letters, asks /api/translate only when the person taps (or when they
// switched on auto-translation for this chat), and keeps every answer in localStorage, so a message is translated
// once per phone. Ayahs are never machine-translated: the server only says which ayah it is, and the phone shows
// the checked translation from quran-ru.json (Kuliev) or quran-en.json (Saheeh International). Hadith and du'a
// in Arabic stay as they are.
import { useEffect, useState } from 'react';
import { cloudMe } from './cloud';
import { LANG } from './i18n';
import { loadQuran } from './components/Quran';

export type TrKind = 'text' | 'quran' | 'sacred' | 'same';
export interface TrResult { kind: TrKind; lang: string; text: string; s?: number; a?: number; err?: string }

/** Languages a person may say they understand, besides the app language. */
export const KNOWN_LANGS: { k: string; n: string }[] = [
  { k: 'ru', n: 'Русский' }, { k: 'en', n: 'English' }, { k: 'tr', n: 'Türkçe' }, { k: 'ar', n: 'العربية' },
  { k: 'de', n: 'Deutsch' }, { k: 'fr', n: 'Français' }, { k: 'bs', n: 'Bosanski' }, { k: 'uz', n: 'Oʻzbek' },
  { k: 'kk', n: 'Қазақ' }, { k: 'ur', n: 'اردو' }, { k: 'id', n: 'Indonesia' }, { k: 'nl', n: 'Nederlands' },
];

const K_KNOW = 'lm.tr.know', K_AUTO = 'lm.tr.auto', K_CACHE = 'lm.tr.cache';
const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or private */ } };
const ping = () => window.dispatchEvent(new Event('lm-tr'));

export const knownLangs = (): string[] => read<string[]>(K_KNOW, []);
export function setKnown(list: string[]) { write(K_KNOW, list.filter((x) => x !== LANG)); ping(); }
export const autoOn = (code: string | undefined) => Boolean(code && read<Record<string, boolean>>(K_AUTO, {})[code]);
export function setAuto(code: string, on: boolean) {
  const m = read<Record<string, boolean>>(K_AUTO, {});
  if (on) m[code] = true; else delete m[code];
  write(K_AUTO, m); ping();
}
/** Re-render on any change of the translation settings. */
export function useTrSettings() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); window.addEventListener('lm-tr', f); return () => window.removeEventListener('lm-tr', f); }, []);
  return { known: knownLangs(), autoOn };
}

// Short phrases everyone in the Ummah says: never offer to translate them.
const COMMON = /^(?:[\s.,!?…)(«»"'-]|amin|amee?n|ameen|аминь?|ма\s?ша\s?аллах|машаллах|mash?a\s?allah|mashallah|иншаа?\s?ллах|ин\s?ша\s?аллах|in\s?sh?a\s?allah|inshallah|альхамдулил+ях|alhamdulil+ah|субханаллах|subhanallah|бисмиллях|bismillah|бараа?кал+аху?(?:\s?фик(?:и|ум)?)?|barakallahu?(?:\s?fik(?:i|um)?)?|джазак(?:и|ум)?\s?аллаху?\s?(?:хайран)?|jazak(?:i|um)?\s?allahu?\s?(?:khair(?:an)?)?|ассаляму?\s?алейкум|салам|salam|selam|as+alamu?\s?alaikum|wa?\s?alaikum\s?(?:as)?salam|аллаху\s?акбар|allahu\s?akbar|آمين|ما\s?شاء\s?الله|إن\s?شاء\s?الله|الحمد\s?لله|سبحان\s?الله|السلام\s?عليكم|بارك\s?الله\s?فيك|جزاك\s?الله\s?خيرا?|الله\s?أكبر)+$/iu;
const TR_LETTERS = /[ğşıİçöüĞŞÇÖÜ]/;
const EN_WORDS = /\b(the|and|you|is|are|to|of|in|for|it|this|that|we|have|will|what|with|my|your|i|be|not|can|do)\b/gi;

/** A guess at the language of a message, by its letters: 'ru', 'ar', 'tr', 'en', 'latin' (other Latin-script) or '' (nothing to translate). */
export function guessLang(text: string): string {
  const t = text.replace(/https?:\/\/\S+/g, ' ').replace(/[@#]\S+/g, ' ').trim();
  if (!t || COMMON.test(t)) return '';
  let cyr = 0, ara = 0, lat = 0;
  for (const ch of t) {
    if (/\p{Script=Cyrillic}/u.test(ch)) cyr++;
    else if (/\p{Script=Arabic}/u.test(ch)) ara++;
    else if (/\p{Script=Latin}/u.test(ch)) lat++;
  }
  const all = cyr + ara + lat;
  if (all < 4) return '';
  if (cyr >= ara && cyr >= lat) return 'ru';
  if (ara >= lat) return 'ar';
  if (TR_LETTERS.test(t)) return 'tr';
  const words = t.split(/\s+/).filter(Boolean).length;
  const en = (t.match(EN_WORDS) || []).length;
  return en > 0 && en / Math.max(1, words) >= 0.15 ? 'en' : 'latin';
}

/** Whether to offer «Перевести» for this text to this person. */
export function needsTr(text: string, known: string[] = knownLangs()): string {
  const g = guessLang(text);
  if (!g || g === LANG || known.includes(g)) return '';
  // Latin text that does not look English: for an English reader it may be English with few common words; still offer.
  return g;
}

/** «с турецкого» / «from Turkish» for a language code (the server answers with ISO codes). */
const FROM_RU: Record<string, string> = { ru: 'с русского', en: 'с английского', tr: 'с турецкого', ar: 'с арабского', de: 'с немецкого', fr: 'с французского', bs: 'с боснийского', sr: 'с сербского', uz: 'с узбекского', kk: 'с казахского', ur: 'с урду', id: 'с индонезийского', nl: 'с нидерландского', fa: 'с персидского', es: 'с испанского', it: 'с итальянского', az: 'с азербайджанского', tt: 'с татарского', ky: 'с киргизского', tg: 'с таджикского', so: 'с сомалийского', ms: 'с малайского', sq: 'с албанского', bn: 'с бенгальского', uk: 'с украинского', pl: 'с польского', ce: 'с чеченского' };
const FROM_EN: Record<string, string> = { ru: 'from Russian', en: 'from English', tr: 'from Turkish', ar: 'from Arabic', de: 'from German', fr: 'from French', bs: 'from Bosnian', sr: 'from Serbian', uz: 'from Uzbek', kk: 'from Kazakh', ur: 'from Urdu', id: 'from Indonesian', nl: 'from Dutch', fa: 'from Persian', es: 'from Spanish', it: 'from Italian', az: 'from Azerbaijani', tt: 'from Tatar', ky: 'from Kyrgyz', tg: 'from Tajik', so: 'from Somali', ms: 'from Malay', sq: 'from Albanian', bn: 'from Bengali', uk: 'from Ukrainian', pl: 'from Polish', ce: 'from Chechen' };
export function fromLabel(code: string): string {
  const m = LANG === 'en' ? FROM_EN : FROM_RU;
  return m[code] || '';
}

// --- the cache and the batched requests ---

const cacheKey = (id: number) => `${id}:${LANG}`;
let mem: Record<string, TrResult> | null = null;
function cache() { mem ??= read<Record<string, TrResult>>(K_CACHE, {}); return mem; }
function save(id: number, r: TrResult) {
  const c = cache();
  c[cacheKey(id)] = r;
  const keys = Object.keys(c);
  if (keys.length > 600) for (const k of keys.slice(0, keys.length - 500)) delete c[k];
  write(K_CACHE, c);
}
export const cached = (id: number): TrResult | null => cache()[cacheKey(id)] ?? null;

interface Job { id: number; text: string; code: string; res: (r: TrResult) => void }
let queue: Job[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const inflight = new Map<number, Promise<TrResult>>();

async function ayahText(s: number, a: number): Promise<string> {
  try {
    const q = await loadQuran(LANG === 'en' ? 'en' : 'ru');
    const v = q[s - 1]?.[4]?.[a - 1];
    return v ? v[1] : '';
  } catch { return ''; }
}

async function flush() {
  timer = null;
  const jobs = queue.splice(0, 12);
  if (queue.length) timer = setTimeout(flush, 50);
  if (!jobs.length) return;
  const me = cloudMe();
  const fail = (err: string) => jobs.forEach((j) => j.res({ kind: 'text', lang: '', text: '', err }));
  if (!me) return fail('auth');
  let j: { items?: { id: number; kind: TrKind; lang: string; text: string; s?: number; a?: number }[]; error?: string };
  try {
    const r = await fetch('/api/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: me.uid, token: me.token, code: jobs[0].code, to: LANG, items: jobs.map((x) => ({ id: x.id, text: x.text })) }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) return fail(j.error || 'net');
  } catch { return fail('net'); }
  const by = new Map((j.items || []).map((x) => [x.id, x]));
  for (const job of jobs) {
    const x = by.get(job.id);
    if (!x) { job.res({ kind: 'text', lang: '', text: '', err: 'busy' }); continue; }
    let out: TrResult = { kind: x.kind, lang: x.lang, text: x.text };
    if (x.kind === 'quran' && x.s && x.a) {
      const t = await ayahText(x.s, x.a);
      out = t ? { kind: 'quran', lang: 'ar', text: t, s: x.s, a: x.a } : { kind: 'sacred', lang: 'ar', text: '' };
    }
    save(job.id, out);
    job.res(out);
  }
}

/** Translate one message; several taps within a moment go to the server together. Same-circle only per batch. */
export function translate(id: number, text: string, code: string): Promise<TrResult> {
  const c = cached(id);
  if (c) return Promise.resolve(c);
  const p0 = inflight.get(id);
  if (p0) return p0;
  if (queue.length && queue[0].code !== code) void flush();
  const p = new Promise<TrResult>((res) => {
    queue.push({ id, text: text.slice(0, 2000), code, res });
    timer ??= setTimeout(flush, 250);
  });
  inflight.set(id, p);
  p.then((r) => { inflight.delete(id); if (r.err) return; });
  return p;
}
