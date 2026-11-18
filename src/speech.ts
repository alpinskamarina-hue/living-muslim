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
