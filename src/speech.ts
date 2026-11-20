// Text-to-speech through the phone's own voices (speechSynthesis). Free, offline-capable, no keys.

export function ttsAvailable() {
  try { return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'; } catch { return false; }
}

function voicesFor(lang: string) {
  try {
    const base = lang.slice(0, 2).toLowerCase();
    return speechSynthesis.getVoices().filter((x) => x.lang.toLowerCase().replace('_', '-').startsWith(base));
  } catch { return []; }
}

function pickVoice(lang: string) {
  const v = voicesFor(lang);
  if (lang.startsWith('en')) return v.find((x) => /en-(US|GB)/i.test(x.lang) && /google|samantha|daniel|natural/i.test(x.name)) ?? v.find((x) => /en-(US|GB)/i.test(x.lang)) ?? v[0];
  return v.find((x) => /google|natural/i.test(x.name)) ?? v[0];
}

/** null: the voice list is not loaded yet, so we cannot tell. */
export function hasVoice(lang: string): boolean | null {
  if (!ttsAvailable()) return false;
  try { if (!speechSynthesis.getVoices().length) return null; } catch { return false; }
  return voicesFor(lang).length > 0;
}

export function speak(text: string, slow = false, lang = 'en-US'): Promise<void> {
  return new Promise((res) => {
    if (!ttsAvailable()) return res();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.rate = slow ? 0.6 : 0.9;
      u.onend = () => res();
      u.onerror = () => res();
      speechSynthesis.speak(u);
    } catch { res(); }
  });
}

const BY_NAME: [RegExp, string][] = [
  [/англ|english/i, 'en-US'], [/араб|arab/i, 'ar-SA'], [/турец|turk/i, 'tr-TR'], [/немец|german|deutsch/i, 'de-DE'],
  [/франц|french/i, 'fr-FR'], [/испан|spanish/i, 'es-ES'], [/итальян|italian/i, 'it-IT'], [/португал|portug/i, 'pt-PT'],
  [/нидерланд|голланд|dutch|nederl/i, 'nl-NL'], [/китай|chinese/i, 'zh-CN'], [/япон|japan/i, 'ja-JP'], [/корей|korean/i, 'ko-KR'],
  [/урду|urdu/i, 'ur-PK'], [/фарси|персид|persian|farsi/i, 'fa-IR'], [/хинди|hindi/i, 'hi-IN'], [/малай|malay/i, 'ms-MY'],
  [/индонез|indones/i, 'id-ID'], [/казах|kazakh/i, 'kk-KZ'], [/узбек|uzbek/i, 'uz-UZ'], [/азерб|azerb/i, 'az-AZ'],
  [/польск|polish/i, 'pl-PL'], [/украин|ukrain/i, 'uk-UA'], [/русск|russian/i, 'ru-RU'], [/бенгал|bengal/i, 'bn-BD'],
  [/суахили|swahili/i, 'sw-KE'], [/сомали|somali/i, 'so-SO'], [/босни|bosnian/i, 'bs-BA'], [/албан|alban/i, 'sq-AL'],
];

/** Speech language for a deck id: en, ar, tr or custom:<name>. */
export function speechLang(id: string): string | null {
  if (id === 'en') return 'en-US';
  if (id === 'ar') return 'ar-SA';
  if (id === 'tr') return 'tr-TR';
  const name = id.replace(/^custom:/, '');
  return BY_NAME.find(([re]) => re.test(name))?.[1] ?? null;
}

// ───── Speech-to-text through the browser (Web Speech API): free, no keys. Chrome/Android and Safari on iPhone. ─────
type Rec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };

export const RecCtor = (): (new () => Rec) | null => {
  try { const w = window as unknown as Record<string, unknown>; return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => Rec) | null; } catch { return null; }
};
export const sttAvailable = () => Boolean(RecCtor());

export interface Listening { stop: () => void; abort: () => void }

/** Adds a piece of speech to what was said, without the repeats Android sends (each result may hold the earlier text again). */
function join(base: string, t: string): string {
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return base;
  const lb = base.toLowerCase(), lt = t.toLowerCase();
  if (!base) return t;
  if (lt.startsWith(lb)) return t;          // the new piece already contains everything
  if (lb.endsWith(lt)) return base;         // a repeat of the end
  return `${base} ${t}`;
}

/**
 * Listens until the person presses stop. Phones end recognition on every pause, so it quietly starts again and keeps
 * the text; after about 20 s of silence it stops by itself. onText gets the whole text so far; onEnd the final text.
 */
export function listen(lang: string, onText: (t: string) => void, onEnd: (t: string, err?: string) => void): Listening | null {
  const C = RecCtor();
  if (!C) return null;
  let said = '', cur = '', err: string | undefined, stopped = false, lastHeard = Date.now(), r: Rec | null = null;
  const finish = () => { if (r) { r.onend = null; r.onresult = null; r.onerror = null; } onEnd(cur.trim(), err); };
  const session = () => {
    const x = new C();
    r = x;
    x.lang = lang; x.interimResults = true; x.continuous = false;
    let fin = '', heard = false;
    const began = Date.now();
    x.onresult = (e) => {
      heard = true; lastHeard = Date.now();
      let interim = '';
      fin = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin = join(fin, res[0].transcript); else interim = join(interim, res[0].transcript);
      }
      cur = join(join(said, fin), interim);
      onText(cur);
    };
    x.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') { err = e.error; stopped = true; } };
    x.onend = () => {
      said = join(said, fin) || said;
      cur = said;
      if (stopped || (!heard && Date.now() - lastHeard > 20000)) { finish(); return; }
      // A session that ended at once (no network, busy mic) is not restarted in a tight loop.
      setTimeout(() => { if (stopped) { finish(); return; } try { session(); } catch { finish(); } }, Date.now() - began < 400 ? 400 : 0);
    };
    x.start();
  };
  try { session(); } catch { return null; }
  return {
    stop: () => { stopped = true; try { r?.stop(); } catch { /* the pending restart finishes */ } },
    abort: () => { stopped = true; if (r) { r.onend = null; try { r.abort(); } catch { /* */ } } },
  };
}

/** Stops anything being read aloud. */
export function hush() { try { if (ttsAvailable()) speechSynthesis.cancel(); } catch { /* */ } }
