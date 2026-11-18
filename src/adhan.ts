// Adhan: reciters with an open licence, the user's own recording, a short sound, and the words to repeat after the muezzin.
import type { AdhanMode, AdhanPrefs, Anchor, Settings } from './types';
import { ANCHORS } from './types';
import { deleteFile, getFile, putFile } from './idb';
import { _t } from './i18n';

export interface Reciter {
  id: string;
  name: string;
  place: string;
  /** Playable file; '' for the user's own recording (kept on the phone). */
  url: string;
  /** Author and licence, shown under the name (CC BY-SA needs it). */
  credit: string;
  page: string;
  secs: number;
}

const C = 'https://upload.wikimedia.org/wikipedia/commons';
export const RECITERS: Reciter[] = [
  {
    id: 'azeez', name: 'Aaqib Azeez', place: _t("Спокойный, чистый голос"), secs: 87,
    url: `${C}/7/7d/The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3`,
    credit: 'Aaqib Azeez · Atcovi, Wikimedia Commons, CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:The_Adhan_-_Muslim_Call_to_Prayer_-_Aaqib_Azeez.mp3',
  },
  {
    id: 'casa', name: _t("Мечеть Хасана II"), place: _t("Касабланка, марокканский напев, запись с улицы"), secs: 176,
    url: `${C}/transcoded/9/9c/Llamada_a_oraci%C3%B3n_Mezquita_Hassan_II.wav/Llamada_a_oraci%C3%B3n_Mezquita_Hassan_II.wav.mp3`,
    credit: 'Fraguando, Wikimedia Commons, CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Llamada_a_oraci%C3%B3n_Mezquita_Hassan_II.wav',
  },
];
export const OWN = 'own';
export const OWN_FAJR = 'own-fajr';
/** Coming once the recordings are prepared: shown greyed out. */
export const SOON = [_t("Мекка, Масджид аль-Харам"), _t("Стамбул"), _t("Азан фаджра (Мальмё)")];

export const ADHAN_DEFAULT: AdhanPrefs = { on: false, reciter: 'azeez', fajr: '', mode: {}, vol: 0.8 };
export const adhanOf = (s: Settings): AdhanPrefs => ({ ...ADHAN_DEFAULT, ...(s.adhan ?? {}) });
export const modeOf = (p: AdhanPrefs, a: Anchor): AdhanMode => p.mode[a] ?? 'full';
export const reciterFor = (p: AdhanPrefs, a: Anchor) => (a === 'fajr' && p.fajr ? p.fajr : p.reciter);

export function reciterName(id: string) {
  if (id === OWN) return _t("Свой азан");
  if (id === OWN_FAJR) return _t("Свой азан фаджра");
  return RECITERS.find((r) => r.id === id)?.name ?? RECITERS[0].name;
}

/** Prayers that get a full adhan, for the server: the push then says «нажми, чтобы включить азан». */
export function adhanServer(s: Settings) {
  const p = adhanOf(s);
  if (!p.on) return null;
  const full = ANCHORS.filter((a) => modeOf(p, a) === 'full');
  return full.length ? { name: reciterName(p.reciter), fajr: reciterName(reciterFor(p, 'fajr')), p: full } : null;
}

// ---- own recordings, kept only on this phone ----
const ownKey = (id: string) => `adhan-${id}`;
export async function saveOwn(id: string, f: File) {
  if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(f.name)) throw new Error('type');
  if (f.size > 20 * 1024 * 1024) throw new Error('size');
  await putFile(ownKey(id), f);
  try { localStorage.setItem(`lm_${ownKey(id)}`, f.name); } catch { /* */ }
}
export const ownName = (id: string) => { try { return localStorage.getItem(`lm_${ownKey(id)}`) || ''; } catch { return ''; } };
export async function dropOwn(id: string) {
  await deleteFile(ownKey(id));
  try { localStorage.removeItem(`lm_${ownKey(id)}`); } catch { /* */ }
}

// ---- playing ----
// One audio element for the whole app: once a tap has started it, phones let it play again later without a tap.
let el: HTMLAudioElement | null = null;
let on = false;
let objUrl = '';
const subs = new Set<() => void>();
export const onAdhanChange = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const changed = () => subs.forEach((f) => f());
export const isPlaying = () => on;
export const progress = () => (el && on && el.duration ? el.currentTime / el.duration : 0);
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
const audioEl = () => (el ??= new Audio());

/** Call from a tap: unlocks the element so the adhan can start by itself at prayer time. */
export function unlockAdhan() {
  if (on) return;
  const a = audioEl();
  a.src = SILENT;
  a.play().then(() => a.pause()).catch(() => {});
}

async function srcOf(id: string) {
  if (id === OWN || id === OWN_FAJR) {
    const b = await getFile(ownKey(id)).catch(() => undefined);
    if (!b) return '';
    objUrl = URL.createObjectURL(b);
    return objUrl;
  }
  return (RECITERS.find((r) => r.id === id) ?? RECITERS[0]).url;
}

/** Starts the adhan. Resolves 'ok', 'blocked' (the browser wants a tap first) or 'error' (no file or no internet). */
export async function playAdhan(id: string, vol: number): Promise<'ok' | 'blocked' | 'error'> {
  stopAdhan();
  const src = await srcOf(id);
  if (!src) return 'error';
  const a = audioEl();
  a.onended = () => stopAdhan();
  a.onerror = () => { if (on) stopAdhan(); };
  a.src = src;
  a.volume = Math.max(0, Math.min(1, vol));
  on = true;
  changed();
  try { await a.play(); return 'ok'; } catch (e) {
    stopAdhan();
    return (e as Error)?.name === 'NotAllowedError' ? 'blocked' : 'error';
  }
}

export function setVolume(v: number) { if (el) el.volume = Math.max(0, Math.min(1, v)); }

export function stopAdhan() {
  if (el) { el.onended = null; el.onerror = null; el.pause(); el.removeAttribute('src'); el.load(); }
  if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = ''; }
  const was = on;
  on = false;
  if (was) changed();
}

/** A soft two-note bell made on the phone, for «короткий звук». */
export async function playChime(vol: number): Promise<boolean> {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    if (ctx.state === 'suspended') await ctx.resume();
    if (ctx.state !== 'running') { ctx.close(); return false; }
    const t0 = ctx.currentTime;
    [[659.25, 0], [880, 0.45], [659.25, 1.1]].forEach(([f, d]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35 * Math.max(0.05, vol), t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.6);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 1.7);
    });
    setTimeout(() => ctx.close().catch(() => {}), 3200);
    return true;
  } catch { return false; }
}

// ---- once per prayer ----
const PLAYED = 'lm_adhan_played';
export function wasPlayed(key: string) { try { return (localStorage.getItem(PLAYED) || '').split(',').includes(key); } catch { return false; } }
export function markPlayed(key: string) {
  try {
    const day = key.split(':')[0];
    const keep = (localStorage.getItem(PLAYED) || '').split(',').filter((k) => k && k.startsWith(day));
    localStorage.setItem(PLAYED, [...keep, key].join(','));
  } catch { /* */ }
}

// ---- words of the adhan and the replies ----
export interface AdhanLine {
  ar: string;
  tr: string;
  mean: string;
  /** What the listener says back. */
  reply: string;
  times: number;
  fajrOnly?: boolean;
}

const SAME = _t("Повторяют те же слова");
const HAWQALA = _t("Ля хауля ва ля куввата илля биллях. Нет силы и мощи, кроме как у Аллаха");
export const ADHAN_LINES: AdhanLine[] = [
  { ar: 'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ', tr: _t("Аллаху акбар, Аллаху акбар"), mean: _t("Аллах велик, Аллах велик"), reply: SAME, times: 2 },
  { ar: 'أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللهُ', tr: _t("Ашхаду ан ля иляха илляЛлах"), mean: _t("Свидетельствую, что нет бога, кроме Аллаха"), reply: SAME, times: 2 },
  { ar: 'أَشْهَدُ أَنَّ مُحَمَّدًا رَسُولُ اللهِ', tr: _t("Ашхаду анна Мухаммадан расулюЛлах"), mean: _t("Свидетельствую, что Мухаммад посланник Аллаха"), reply: SAME, times: 2 },
  { ar: 'حَيَّ عَلَى الصَّلَاةِ', tr: _t("Хайя ‘аля-с-саля"), mean: _t("Спешите на молитву"), reply: HAWQALA, times: 2 },
  { ar: 'حَيَّ عَلَى الْفَلَاحِ', tr: _t("Хайя ‘аля-ль-фалях"), mean: _t("Спешите к успеху"), reply: HAWQALA, times: 2 },
  { ar: 'الصَّلَاةُ خَيْرٌ مِنَ النَّوْمِ', tr: _t("Ас-саляту хайрун мина-н-наум"), mean: _t("Молитва лучше сна"), reply: SAME, times: 2, fajrOnly: true },
  { ar: 'اللهُ أَكْبَرُ، اللهُ أَكْبَرُ', tr: _t("Аллаху акбар, Аллаху акбар"), mean: _t("Аллах велик, Аллах велик"), reply: SAME, times: 1 },
  { ar: 'لَا إِلٰهَ إِلَّا اللهُ', tr: _t("Ля иляха илляЛлах"), mean: _t("Нет бога, кроме Аллаха"), reply: SAME, times: 1 },
];
export const linesFor = (a: Anchor) => ADHAN_LINES.filter((l) => !l.fajrOnly || a === 'fajr');

/** Which line is probably sounding now, by the share of the recording played. Approximate. */
export function lineAt(lines: AdhanLine[], share: number) {
  const w = lines.map((l) => l.times * (l.ar.length > 20 ? 1.15 : 1));
  const total = w.reduce((x, y) => x + y, 0);
  let acc = 0;
  for (let i = 0; i < lines.length; i++) { acc += w[i] / total; if (share < acc) return i; }
  return lines.length - 1;
}

export const AFTER_ADHAN = [
  {
    when: _t("После слов о свидетельстве"),
    ar: 'وَأَنَا أَشْهَدُ أَنْ لَا إِلٰهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، وَأَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ، رَضِيتُ بِاللهِ رَبًّا، وَبِمُحَمَّدٍ رَسُولًا، وَبِالْإِسْلَامِ دِينًا',
    tr: _t("Ва ана ашхаду ан ля иляха илляЛлаху вахдаху ля шарика лях, ва анна Мухаммадан ‘абдуху ва расулюх. Радиту биЛляхи раббан, ва би Мухаммадин расулян, ва биль-Ислями дина"),
    mean: _t("И я свидетельствую, что нет бога, кроме одного Аллаха, у Которого нет сотоварища, и что Мухаммад Его раб и посланник. Я доволен Аллахом как Господом, Мухаммадом как посланником и исламом как религией."),
    src: _t("Муслим, 386"),
  },
  {
    when: _t("Когда азан закончился: салават"),
    ar: 'اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ',
    tr: _t("Аллахумма салли ‘аля Мухаммадин ва ‘аля али Мухаммад"),
    mean: _t("О Аллах, благослови Мухаммада и семью Мухаммада"),
    src: _t("Муслим, 384"),
  },
  {
    when: _t("Потом дуа после азана"),
    ar: 'اللَّهُمَّ رَبَّ هَذِهِ الدَّعْوَةِ التَّامَّةِ، وَالصَّلَاةِ الْقَائِمَةِ، آتِ مُحَمَّدًا الْوَسِيلَةَ وَالْفَضِيلَةَ، وَابْعَثْهُ مَقَامًا مَحْمُودًا الَّذِي وَعَدْتَهُ',
    tr: _t("Аллахумма Рабба хазихи-д-да‘вати-т-тамма, ва-с-саляти-ль-каима, ати Мухаммадан аль-василята валь-фадыля, ваб‘асху макаман махмудан аллязи ва‘адтах"),
    mean: _t("О Аллах, Господь этого совершенного призыва и молитвы, которая сейчас начнётся! Даруй Мухаммаду аль-василю и достоинство и вознеси его на славное место, которое Ты ему обещал."),
    src: _t("аль-Бухари, 614"),
  },
];
