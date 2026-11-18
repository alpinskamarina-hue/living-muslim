import { arTr } from './course/arTranslit';
// How a starter word sounds: IPA for English and Turkish, a reading in Russian letters (CAPS = stressed syllable)
// and a Latin reading for Arabic. Words people add themselves get IPA from a free dictionary (English only).
import { isEn } from './i18n';
import { TR } from './course/tr';

type P = { ipa?: string; ru?: string; lat?: string };

const EN: Record<string, P> = {
  habit: { ipa: 'ˈhæbɪt', ru: 'ХЭбит' }, goal: { ipa: 'ɡoʊl', ru: 'гоул' }, patience: { ipa: 'ˈpeɪʃəns', ru: 'ПЭЙшнс' },
  gratitude: { ipa: 'ˈɡrætɪtuːd', ru: 'ГРЭтитьюд' }, knowledge: { ipa: 'ˈnɑːlɪdʒ', ru: 'НОлидж' }, consistency: { ipa: 'kənˈsɪstənsi', ru: 'кэнСИСтэнси' },
  effort: { ipa: 'ˈefərt', ru: 'Эфэрт' }, 'to improve': { ipa: 'tə ɪmˈpruːv', ru: 'ту имПРУВ' }, mercy: { ipa: 'ˈmɜːrsi', ru: 'МЁРси' },
  family: { ipa: 'ˈfæməli', ru: 'ФЭмили' }, health: { ipa: 'helθ', ru: 'хэлс' }, 'to remember': { ipa: 'tə rɪˈmembər', ru: 'ту риМЭМбэр' },
  success: { ipa: 'səkˈses', ru: 'сэкСЭС' }, honest: { ipa: 'ˈɑːnɪst', ru: 'Онист' }, time: { ipa: 'taɪm', ru: 'тайм' },
  morning: { ipa: 'ˈmɔːrnɪŋ', ru: 'МОРнинг' }, evening: { ipa: 'ˈiːvnɪŋ', ru: 'ИВнинг' }, 'to read': { ipa: 'tə riːd', ru: 'ту рид' },
  'to grow': { ipa: 'tə ɡroʊ', ru: 'ту гроу' }, step: { ipa: 'step', ru: 'стэп' },
};

const AR: Record<string, P> = {
  'اللَّه': { ru: 'Аллах', lat: 'Allāh' }, 'رَبّ': { ru: 'рабб', lat: 'rabb' }, 'قَالَ': { ru: 'каала', lat: 'qāla' },
  'كِتَاب': { ru: 'китааб', lat: 'kitāb' }, 'يَوْم': { ru: 'йаум', lat: 'yawm' }, 'أَرْض': { ru: 'ард', lat: 'arḍ' },
  'سَمَاء': { ru: 'самаа', lat: 'samāʾ' }, 'قَلْب': { ru: 'калб', lat: 'qalb' }, 'نَار': { ru: 'наар', lat: 'nār' },
  'جَنَّة': { ru: 'джанна', lat: 'jannah' }, 'عِلْم': { ru: 'ʿильм', lat: 'ʿilm' }, 'عَمَل': { ru: 'ʿамаль', lat: 'ʿamal' },
  'صَلَاة': { ru: 'салаа', lat: 'ṣalāh' }, 'رَحْمَة': { ru: 'рахма', lat: 'raḥmah' }, 'نَاس': { ru: 'наас', lat: 'nās' },
  'حَقّ': { ru: 'хакк', lat: 'ḥaqq' }, 'خَيْر': { ru: 'хайр', lat: 'khayr' }, 'نَفْس': { ru: 'нафс', lat: 'nafs' },
  'دِين': { ru: 'диин', lat: 'dīn' }, 'صَبْر': { ru: 'сабр', lat: 'ṣabr' },
};

const TRK: Record<string, P> = {
  'alışkanlık': { ipa: 'aɫɯʃkanˈɫɯk', ru: 'алышканЛЫК' }, merhaba: { ipa: 'ˈmeɾhaba', ru: 'МЭРхаба' },
  'teşekkür ederim': { ipa: 'teʃecˈcyɾ edeˈɾim', ru: 'тешекКЮР эдеРИМ' }, evet: { ipa: 'eˈvet', ru: 'эВЭТ' },
  'hayır': { ipa: 'ˈhajɯɾ', ru: 'ХАйыр' }, su: { ipa: 'su', ru: 'су' }, ekmek: { ipa: 'ecˈmec', ru: 'экМЭК' }, ev: { ipa: 'ev', ru: 'эв' },
  aile: { ipa: 'aːiˈle', ru: 'аиЛЭ' }, kitap: { ipa: 'ciˈtap', ru: 'киТАП' }, okumak: { ipa: 'okuˈmak', ru: 'окуМАК' },
  sabah: { ipa: 'saˈbah', ru: 'саБАХ' }, 'akşam': { ipa: 'akˈʃam', ru: 'акШАМ' }, 'bugün': { ipa: 'ˈbuɟyn', ru: 'БУгюн' },
  'yarın': { ipa: 'ˈjaɾɯn', ru: 'Ярын' }, 'güzel': { ipa: 'ɟyˈzel', ru: 'гюЗЭЛЬ' }, zaman: { ipa: 'zaˈman', ru: 'заМАН' },
  'sağlık': { ipa: 'saːˈɫɯk', ru: 'сааЛЫК' }, 'çalışmak': { ipa: 'tʃaɫɯʃˈmak', ru: 'чалышМАК' }, 'sabır': { ipa: 'saˈbɯɾ', ru: 'саБЫР' },
};

/** Lines to show under a word: [main, second?]. `own` is what was saved on the card (IPA from the dictionary). */
export function pronOf(lang: string, word: string, own?: string): string[] {
  const p = (lang === 'en' ? EN : lang === 'ar' ? AR : lang === 'tr' ? TRK : {})[word.trim()];
  const out: string[] = [];
  if (p?.ipa) out.push(`[${p.ipa}]`);
  if (p?.lat && (isEn || !p.ru)) out.push(p.lat);
  if (p?.ru && !isEn) out.push(p.ru);
  if (!out.length && own) out.push(own.startsWith('/') || own.startsWith('[') ? own : `[${own}]`);
  if (lang === 'en' && !isEn && TR[word.trim()] && !p) out.push(TR[word.trim()]);
  // Vowelled Arabic (course phrases) gets its reading from the rules.
  if (lang === 'ar' && !out.length && /[\u064B-\u0652]/.test(word)) out.push(arTr(word, isEn ? 'lat' : 'ru'));
  return out;
}

/** Does this word still need IPA from the dictionary? Only single English words or short phrases. */
export function needsLookup(lang: string, word: string, own?: string) {
  return lang === 'en' && !own && !EN[word.trim()] && !TR[word.trim()] && /^[A-Za-z' -]{1,40}$/.test(word.trim()) && word.trim().split(/\s+/).length <= 3;
}

/** IPA from dictionaryapi.dev (free, no key). Only the word itself is sent. */
export async function lookupIpa(word: string): Promise<string | undefined> {
  const w = word.trim().toLowerCase().replace(/^to\s+/, '');
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return undefined;
    const j = (await r.json()) as { phonetic?: string; phonetics?: { text?: string }[] }[];
    const ipa = j[0]?.phonetic || j.flatMap((e) => e.phonetics ?? []).find((x) => x.text)?.text;
    return ipa ? ipa.replace(/^\/|\/$/g, '') : undefined;
  } catch { return undefined; }
}
