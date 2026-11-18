// Fully vowelled Arabic (pausal endings) → reading in Latin or Russian letters.
// Rules: article al- with sun-letter assimilation, hamzat al-wasl elision, shadda doubling, long vowels, tanwin, tā' marbūṭa.

type Sys = 'lat' | 'ru';

const FATHA = 'َ', KASRA = 'ِ', DAMMA = 'ُ', SUKUN = 'ْ', SHADDA = 'ّ';
const FATHATAN = 'ً', KASRATAN = 'ٍ', DAMMATAN = 'ٌ', DAGGER = 'ٰ';
const MARKS = new Set([FATHA, KASRA, DAMMA, SUKUN, SHADDA, FATHATAN, KASRATAN, DAMMATAN, DAGGER]);
const SUN = new Set('تثدذرزسشصضطظلن'.split(''));

const C: Record<string, [string, string]> = {
  'ب': ['b', 'б'], 'ت': ['t', 'т'], 'ث': ['th', 'с'], 'ج': ['j', 'дж'], 'ح': ['ḥ', 'х'], 'خ': ['kh', 'х'],
  'د': ['d', 'д'], 'ذ': ['dh', 'з'], 'ر': ['r', 'р'], 'ز': ['z', 'з'], 'س': ['s', 'с'], 'ش': ['sh', 'ш'],
  'ص': ['ṣ', 'с'], 'ض': ['ḍ', 'д'], 'ط': ['ṭ', 'т'], 'ظ': ['ẓ', 'з'], 'ع': ['ʿ', 'ʿ'], 'غ': ['gh', 'г'],
  'ف': ['f', 'ф'], 'ق': ['q', 'к'], 'ك': ['k', 'к'], 'ل': ['l', 'л'], 'م': ['m', 'м'], 'ن': ['n', 'н'],
  'ه': ['h', 'х'], 'و': ['w', 'в'], 'ي': ['y', 'й'], 'ء': ['ʾ', 'ʼ'], 'أ': ['ʾ', 'ʼ'], 'إ': ['ʾ', 'ʼ'],
  'ؤ': ['ʾ', 'ʼ'], 'ئ': ['ʾ', 'ʼ'], 'ة': ['t', 'т'],
};
const V: Record<string, [string, string]> = {
  [FATHA]: ['a', 'а'], [KASRA]: ['i', 'и'], [DAMMA]: ['u', 'у'],
  [FATHATAN]: ['an', 'ан'], [KASRATAN]: ['in', 'ин'], [DAMMATAN]: ['un', 'ун'],
};
const LONG: Record<string, [string, string]> = { a: ['ā', 'аа'], i: ['ī', 'ии'], u: ['ū', 'уу'] };

interface Unit { ch: string; marks: string }

function units(word: string): Unit[] {
  const out: Unit[] = [];
  for (const ch of word.replace(/ـ/g, '').replace(/ٱ/g, 'ا')) {
    if (MARKS.has(ch) && out.length) out[out.length - 1].marks += ch;
    else out.push({ ch, marks: '' });
  }
  return out;
}
const vowelOf = (m: string) => [FATHA, KASRA, DAMMA, FATHATAN, KASRATAN, DAMMATAN].find((v) => m.includes(v));

/** Russian softening: л before a vowel reads ля/лю/ли, й + vowel reads я/ю. */
function ruJoin(parts: string[]) {
  let s = parts.join('');
  s = s.replace(/йаа/g, 'яа').replace(/йа/g, 'я').replace(/йуу/g, 'юу').replace(/йу/g, 'ю');
  s = s.replace(/(^|[^л])лаа/g, '$1ляа').replace(/(^|[^л])ла(?!а)/g, '$1ля').replace(/(^|[^л])лу/g, '$1лю');
  s = s.replace(/л(?=[^аеёиоуыэюяʿʼ]|$)/g, 'ль').replace(/льль/g, 'лль').replace(/ль-/g, 'ль-');
  return s;
}

function wordTr(word: string, sys: Sys, first: boolean, prevEndsVowel: boolean): string {
  const k = sys === 'lat' ? 0 : 1;
  // Allah
  const bare = word.replace(/[ً-ْٰ]/g, '');
  if (/^[وبف]?الله$|^اللهم$/.test(bare) || bare === 'لله') {
    const pre = bare.startsWith('و') ? (sys === 'lat' ? 'wa-' : 'ва-') : bare.startsWith('ب') ? (sys === 'lat' ? 'bi-' : 'би-') : bare.startsWith('ف') ? (sys === 'lat' ? 'fa-' : 'фа-') : '';
    const end = word.endsWith(DAMMA) ? k ? 'у' : 'u' : word.endsWith(KASRA) ? k ? 'и' : 'i' : word.endsWith(FATHA) ? k ? 'а' : 'a' : '';
    if (bare === 'لله') return (sys === 'lat' ? 'lillāh' : 'лилляах') + end;
    if (bare === 'اللهم') return sys === 'lat' ? (first ? 'allāhumma' : 'llāhumma') : first ? 'аллаахумма' : 'ллаахумма';
    const core = sys === 'lat' ? 'llāh' : 'ллаах';
    return pre + (pre || !first ? (prevEndsVowel || pre ? '' : (k ? 'а' : 'a')) : (k ? 'А' : 'A')) + core + end;
  }
  const u = units(word);
  const out: string[] = [];
  let lastVowel = '';
  for (let i = 0; i < u.length; i++) {
    const { ch, marks } = u[i];
    const next = u[i + 1];
    const atStart = out.length === 0 || (i > 0 && i <= 1 && 'وبفكل'.includes(u[0].ch) && !u[0].marks.includes(SUKUN) && i === 1);
    // alif
    if (ch === 'ا') {
      if (marks.includes(FATHATAN)) { out.push(V[FATHATAN][k]); lastVowel = ''; continue; }
      if (i > 0 && u[i - 1].marks.includes(FATHATAN)) continue; // ـًا: the alif is silent
      const prefixed = i === 1 && 'وبفكل'.includes(u[0].ch) && !!vowelOf(u[0].marks);
      const isArt = !!next && next.ch === 'ل' && (next.marks.includes(SUKUN) || (!next.marks && !!u[i + 2] && u[i + 2].marks.includes(SHADDA)));
      const wasl = !marks && (i === 0 || (prefixed && (isArt || (!!next && next.marks.includes(SUKUN)))));
      if (wasl) {
        if (i === 0) {
          // Starting vowel of hamzat al-wasl: «a» before the article, «u» when the verb's next vowel is u, otherwise «i».
          const wv = isArt ? (k ? 'а' : 'a') : u[i + 2] && u[i + 2].marks.includes(DAMMA) ? (k ? 'у' : 'u') : (k ? 'и' : 'i');
          out.push(first ? wv : prevEndsVowel ? '' : wv);
        }
        if (isArt) {
          const lam = next!; const after = u[i + 2];
          const assim = !lam.marks.includes(SUKUN) && !!after && after.marks.includes(SHADDA) && SUN.has(after.ch);
          if (assim) { out.push(C[after.ch][k] + '-'); u[i + 2] = { ch: after.ch, marks: after.marks.replace(SHADDA, '') }; }
          else out.push((k ? 'л' : 'l') + '-');
          i += 1;
        }
        lastVowel = '';
        continue;
      }
      if (!marks || marks === '') {
        if (lastVowel === 'a') { if (k) out.push('а'); else out[out.length - 1] = out[out.length - 1].replace(/a$/, 'ā'); }
        else out.push(LONG.a[k]);
        lastVowel = '';
        continue;
      }
      const v = vowelOf(marks);
      if (v) out.push(V[v][k]);
      lastVowel = v === FATHA ? 'a' : v === KASRA ? 'i' : v === DAMMA ? 'u' : '';
      continue;
    }
    if (ch === 'ى') { if (lastVowel === 'a') { if (sys === 'lat') out[out.length - 1] = out[out.length - 1].replace(/a$/, 'ā'); else out.push('а'); } else out.push(LONG.a[k]); lastVowel = ''; continue; }
    const afterArt = out.length > 0 && out[out.length - 1].endsWith('-');
    if (ch === 'آ') { out.push((i === 0 || afterArt ? '' : C['ء'][k]) + LONG.a[k]); lastVowel = ''; continue; }
    // long vowels written with و / ي
    if ((ch === 'و' && lastVowel === 'u' || ch === 'ي' && lastVowel === 'i') && !vowelOf(marks) && !marks.includes(SHADDA) && !marks.includes(SUKUN)) {
      if (sys === 'lat') out[out.length - 1] = out[out.length - 1].replace(/[ui]$/, ch === 'و' ? 'ū' : 'ī');
      else out.push(ch === 'و' ? 'у' : 'и');
      lastVowel = ''; continue;
    }
    if (ch === 'ة') {
      const v = vowelOf(marks);
      if (!v) { if (/(ā|аа)$/.test(out.join(''))) out.push(k ? 'х' : 'h'); lastVowel = ''; continue; }
      out.push(C['ة'][k] + V[v][k]); lastVowel = ''; continue;
    }
    if ((ch === 'أ' || ch === 'إ') && marks.includes(SUKUN)) { out.push(C['ء'][k]); lastVowel = ''; continue; }
    if (ch === 'أ' || ch === 'إ') {
      const v = vowelOf(marks) ?? (ch === 'إ' ? KASRA : FATHA);
      const pre = i === 1 && 'وبفكلس'.includes(u[0].ch) && !!vowelOf(u[0].marks);
      out.push((pre ? '-' : atStart || afterArt ? '' : C['ء'][k]) + V[v][k]);
      lastVowel = v === FATHA ? 'a' : v === KASRA ? 'i' : v === DAMMA ? 'u' : '';
      continue;
    }
    if (ch === 'ي' && marks.includes(SHADDA) && !vowelOf(marks) && i === u.length - 1 && lastVowel === 'i') {
      if (k) out.push('й'); else out[out.length - 1] = out[out.length - 1].replace(/i$/, 'ī');
      lastVowel = ''; continue;
    }
    const c = C[ch];
    if (!c) { out.push(ch === '،' ? ',' : ch === '؟' ? '?' : ch); lastVowel = ''; continue; }
    let s = c[k];
    if (marks.includes(SHADDA)) s = sys === 'ru' ? s + s : s.length === 2 && s[1] === 'h' ? s + s : s + s;
    if (marks.includes(DAGGER)) { s += LONG.a[k]; out.push(s); lastVowel = ''; continue; }
    const v = vowelOf(marks);
    if (v) { s += V[v][k]; lastVowel = v === FATHA ? 'a' : v === KASRA ? 'i' : v === DAMMA ? 'u' : ''; }
    else lastVowel = '';
    out.push(s);
  }
  return sys === 'ru' ? ruJoin(out) : out.join('');
}

/** Reading of a vowelled Arabic phrase. */
export function arTr(text: string, sys: Sys): string {
  const words = text.split(/\s+/).filter(Boolean);
  const res: string[] = [];
  let prevVowel = false;
  words.forEach((w, i) => {
    const lead = w.match(/^[«"(]*/)?.[0] ?? '';
    const tail = w.match(/[،؟!.»")]*$/)?.[0] ?? '';
    const core = w.slice(lead.length, w.length - tail.length);
    const first = i === 0 || /[.!؟?،,]$/.test(words[i - 1]);
    let t = wordTr(core, sys, first, prevVowel);
    if (!first && /^[aiuаиу]?[a-zʿʾа-яʼḥṣḍṭẓ]+-/i.test(t) === false && t.startsWith('-')) t = t.slice(1);
    res.push(lead + t + tail.replace(/،/g, ',').replace(/؟/g, '?'));
    prevVowel = /[aiuāīūаиуяю]$/i.test(t);
  });
  // Capital letter at the start and after . ! ?
  return res.join(' ').replace(/(^|[.!?]\s+)([ʿʾʼ-]?)(\p{L})/gu, (_, a: string, b: string, c: string) => a + b + c.toUpperCase());
}
