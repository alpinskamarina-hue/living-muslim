// Reading of Quran ayahs in Russian or Latin letters, made by rules from the Uthmani text (src/course/arTranslit.ts).
// A help for reading along, not a replacement for the Arabic and a teacher: tajweed (idgham, ikhfa, madd lengths) is not shown.
import { arTr } from './course/arTranslit';

type Sys = 'lat' | 'ru';

const NAMES: Record<string, [string, string]> = {
  'ا': ['Alif', 'Алиф'], 'ل': ['Lām', 'Ляям'], 'م': ['Mīm', 'Миим'], 'ص': ['Ṣād', 'Саад'], 'ر': ['Rā', 'Раа'],
  'ك': ['Kāf', 'Кааф'], 'ه': ['Hā', 'Хаа'], 'ي': ['Yā', 'Йаа'], 'ع': ['ʿAyn', 'ʿАйн'], 'ط': ['Ṭā', 'Таа'],
  'س': ['Sīn', 'Сиин'], 'ح': ['Ḥā', 'Хаа'], 'ق': ['Qāf', 'Кааф'], 'ن': ['Nūn', 'Нуун'],
};

/** Separate letters at the start of some surahs (Alif Lam Mim): no vowel marks at all. */
function letters(word: string, sys: Sys) {
  const bare = word.replace(/[ٓۚۖۗ]/g, '');
  if (!bare || /[ًٌٍَُِّْٰٖۡٗٞ]/.test(word) || ![...bare].every((c) => NAMES[c])) return null;
  return [...bare].map((c) => NAMES[c][sys === 'lat' ? 0 : 1]).join(' ');
}

/** Uthmani (KFGQPC/quranenc) spelling → the plain vowelled spelling arTr reads. */
export function norm(a: string) {
  return a
    .replace(/[ۖۗۘۙۚۛۜ۞۩۬]/g, '')            // pause and section marks
    .replace(/.ْ/g, '')                       // a letter marked with a round sukun is written but not read (قَالُواْ)
    .replace(/ا۠/g, '').replace(/۠/g, '')     // أَنَا۠: the alif is not read
    .replace(/ۡ/g, 'ْ')                       // the Uthmani sukun
    .replace(/[ٓۤ]/g, '')                     // madd signs
    .replace(/[ۭۢ]/g, '')                     // iqlab mim
    .replace(/ٞ/g, 'ٌ').replace(/ٗ/g, 'ً').replace(/ٖ/g, 'ٍ') // tanwin variants
    .replace(/ـٔ/g, 'ء').replace(/ٔ/g, '').replace(/ٕ/g, '')
    .replace(/ـ/g, '')
    .replace(/ۥ/g, 'و').replace(/[ۦۧ]/g, 'ي')  // small waw / yeh: long vowel
    .replace(/ٱ/g, 'ا')
    // ٱلَّذِينَ is written with one lam: read it as the article + a doubled lam.
    .replace(/(^|\s)([وفب][َِ]?)?ال(?=[ًٌٍَُِ]?ّ)/g, '$1$2الل')
    // A doubled first letter comes from the word before (مِّن): read it single.
    .replace(/(^|\s)([^\sا])([ًٌٍَُِ]?)ّ/g, '$1$2$3')
    .replace(/\s+/g, ' ').trim();
}

/** Stopping at the end of an ayah: no final short vowel, ة reads «х», -an reads «-аа». */
function pausal(a: string) {
  return a
    .replace(/ة[ًٌٍَُِ]*$/, 'هْ')
    .replace(/ًا$/, 'َا').replace(/ًى$/, 'َى')
    .replace(/[ًٌٍَُِ]+$/, '');
}

/** Russian: words read together are joined with a hyphen (Бисми-ллаахи-р-рахмаани). */
function joinWords(t: string, sys: Sys) {
  const cons = sys === 'ru' ? 'бвгджзйклмнпрстфхцчшщьʿʼ' : 'bcdfghjklmnpqrstvwxyzḥṣḍṭẓʿʾ';
  return t.replace(new RegExp(`([aeiouāīūаеиоуэюяы]) (?=[${cons}]{1,3}-|ll|лл)`, 'giu'), '$1-');
}

export function ayahTr(ar: string, sys: Sys, firstOfSurah = false): string {
  const words = ar.split(/\s+/);
  if (firstOfSurah) {
    const l = letters(words[0], sys);
    if (l) {
      const rest = words.slice(1).join(' ');
      return rest ? `${l}. ${ayahTr(rest, sys)}` : l;
    }
  }
  const t = arTr(pausal(norm(ar)), sys)
    .replace(/[\u0600-\u06ff]/g, '')
    // ٱلَّذِينَ: «аль-лязиина» reads «аллязиина»
    .replace(sys === 'ru' ? /ль-л/g : /l-l/g, sys === 'ru' ? 'лл' : 'll');
  return joinWords(t, sys);
}

const memo = new Map<string, string[]>();
/** All ayahs of a surah, cached. */
export function surahTr(n: number, ayahs: [string, string][], sys: Sys) {
  const k = `${n}:${sys}`;
  let v = memo.get(k);
  if (!v) { v = ayahs.map(([ar], i) => ayahTr(ar, sys, i === 0 || (n === 42 && i === 1))); memo.set(k, v); }
  return v;
}
