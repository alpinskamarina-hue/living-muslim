// «Сканировать штрихкод» (step 3 of the food concept, mockup approved 20.11): read the code with the camera,
// find the product in the open Open Food Facts database, check the ingredients, and remember it on this phone.
// Only the barcode number leaves the phone; nothing about the person is sent.
import { LANG } from './i18n';
import { _t } from './i18n';
import type { FoodRow } from './foodcalc';

export interface Product {
  code: string;
  n: string;
  brand?: string;
  /** kcal, protein, fat, carbs per 100 g (or 100 ml) */
  k: number; p: number; f: number; c: number;
  /** grams in the whole pack, and in one serving, when the label says */
  pack?: number; serving?: number;
  ml?: boolean;
  ing?: string;
  flags: string[];
  halal: boolean;
  own?: boolean;
  t: number;
}

// ---------- reading the code ----------

type Detect = (src: HTMLVideoElement) => Promise<string | null>;
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** The phone's own detector when it has one (Chrome on Android), otherwise a small built-in reader (iPhone). */
export async function makeDetector(): Promise<Detect> {
  const W = window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }; getSupportedFormats?: () => Promise<string[]> } };
  let D = W.BarcodeDetector;
  try {
    if (D?.getSupportedFormats) { const ok = await D.getSupportedFormats(); if (!ok.includes('ean_13')) D = undefined; }
  } catch { D = undefined; }
  if (!D) {
    const [mod, wasm] = await Promise.all([import('barcode-detector/pure'), import('zxing-wasm/reader/zxing_reader.wasm?url')]);
    mod.setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) });
    D = mod.BarcodeDetector as unknown as typeof D;
  }
  const det = new D!({ formats: FORMATS });
  return async (src) => {
    if (!src.videoWidth) return null;
    const r = await det.detect(src).catch(() => []);
    const v = r.map((x) => x.rawValue).find((x) => validCode(x));
    return v ?? null;
  };
}

/** EAN-8, UPC-A, EAN-13 with a correct check digit. */
export function validCode(raw: string): boolean {
  const s = raw.replace(/\D/g, '');
  if (![8, 12, 13].includes(s.length)) return false;
  const d = s.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// ---------- finding the product ----------

const FIELDS = 'code,product_name,product_name_ru,product_name_en,brands,quantity,product_quantity,product_quantity_unit,serving_quantity,nutriments,ingredients_text,ingredients_text_ru,ingredients_text_en,labels_tags,additives_tags';
const n1 = (x: unknown) => { const v = Number(x); return Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : 0; };

export type Lookup = { ok: true; p: Product } | { ok: false; why: 'none' | 'net'; name?: string };

export async function lookup(code: string, signal?: AbortSignal): Promise<Lookup> {
  const mine = remembered(code);
  if (mine) return { ok: true, p: mine };
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal });
    if (r.status === 404) return { ok: false, why: 'none' };
    if (!r.ok) return { ok: false, why: 'net' };
    const j = await r.json();
    const x = j?.product;
    if (!x || j.status === 0) return { ok: false, why: 'none' };
    const name = String((LANG === 'en' ? x.product_name_en : x.product_name_ru) || x.product_name || x.product_name_en || x.product_name_ru || '').trim();
    const nu = x.nutriments || {};
    let k = n1(nu['energy-kcal_100g']);
    if (!k && nu.energy_100g) k = Math.round(Number(nu.energy_100g) / 4.184);
    if (!k) return { ok: false, why: 'none', name };
    const ing = String((LANG === 'en' ? x.ingredients_text_en : x.ingredients_text_ru) || x.ingredients_text || '').trim();
    const unit = String(x.product_quantity_unit || '').toLowerCase();
    const pack = n1(x.product_quantity);
    const p: Product = {
      code, n: name || _t("Товар без названия"), brand: String(x.brands || '').split(',')[0].trim() || undefined,
      k, p: n1(nu.proteins_100g), f: n1(nu.fat_100g), c: n1(nu.carbohydrates_100g),
      pack: pack > 0 && pack < 5000 ? Math.round(pack) : undefined,
      serving: n1(x.serving_quantity) > 0 && n1(x.serving_quantity) < 2000 ? Math.round(n1(x.serving_quantity)) : undefined,
      ml: unit === 'ml' || unit === 'l' || /\d\s*(ml|мл|l|л)\b/i.test(String(x.quantity || '')),
      ing: ing.slice(0, 1200) || undefined,
      ...check(ing, x.additives_tags, x.labels_tags),
      t: Date.now(),
    };
    return { ok: true, p };
  } catch (e) {
    return { ok: false, why: 'net' };
  }
}

// ---------- «Проверь состав» ----------
// A gentle hint about ingredients that often raise questions; the wording asks to check, never rules.
// Cyrillic has no \b in JS regexps, so word edges are written out.
const L = '(?<![a-zа-яё])';
const R = '(?![a-zа-яё])';
const rx = (s: string) => new RegExp(s, 'i');
export const FLAGS: { id: string; e?: string[]; re?: RegExp; maybe?: boolean }[] = [
  { id: 'pork', re: rx(`свин|${L}сало${R}|бекон|шпик|${L}pork|${L}lard${R}|bacon|${L}ham${R}|gelatine? de porc|schwein`) },
  { id: 'alcohol', re: rx(`спирт(?!ов)|алкогол|${L}вин(о|а|ом)${R}|коньяк|${L}ром${R}|ликёр|ликер|${L}пив(о|а)${R}|alcohol|ethanol|${L}wine${R}|${L}rum${R}|brandy|liqueur|${L}beer${R}|cognac`) },
  { id: 'gelatin', e: ['en:e441'], re: rx('желатин|gelatin|gélatine|jelatin') },
  { id: 'carmine', e: ['en:e120'], re: rx('кармин|кошениль|carmine|cochineal|carminic') },
  { id: 'shellac', e: ['en:e904'], re: rx('шеллак|shellac') },
  { id: 'bone', e: ['en:e542'] },
  { id: 'cysteine', e: ['en:e920'], re: rx('цистеин|cysteine') },
  { id: 'e471', e: ['en:e471', 'en:e472', 'en:e472a', 'en:e472b', 'en:e472c', 'en:e472d', 'en:e472e', 'en:e472f'], re: rx(`${L}е?e?\\s?47[12][a-f]?${R}|моно- и диглицерид|mono- and diglycerides`), maybe: true },
];

export function check(ing: string, additives?: unknown, labels?: unknown): { flags: string[]; halal: boolean } {
  const add = Array.isArray(additives) ? additives.map(String) : [];
  const lab = Array.isArray(labels) ? labels.map(String) : [];
  const text = ing.toLowerCase().replace(/ё/g, 'е');
  const flags = FLAGS.filter((x) => (x.e && x.e.some((e) => add.includes(e))) || (x.re && x.re.test(text))).map((x) => x.id);
  const halal = lab.some((l) => /halal|халяль|халал/i.test(l));
  return { flags, halal };
}

export const flagName = (id: string) => ({
  pork: _t("свинина"), alcohol: _t("спирт или вино"), gelatin: _t("желатин"), carmine: _t("E120 (кармин)"),
  shellac: _t("E904 (шеллак)"), bone: _t("E542 (костный фосфат)"), cysteine: _t("E920 (L-цистеин)"), e471: _t("E471 или E472"),
} as Record<string, string>)[id] ?? id;

export const flagWhy = (id: string) => ({
  pork: _t("В составе указана свинина или её жир."),
  alcohol: _t("В составе указан спирт или вино."),
  gelatin: _t("Желатин бывает свиной, говяжий или рыбный."),
  carmine: _t("Кармин делают из насекомых."),
  shellac: _t("Шеллак делают из выделений насекомых."),
  bone: _t("E542 получают из костей животных."),
  cysteine: _t("L-цистеин бывает из перьев или волос."),
  e471: _t("E471 и E472 бывают из растительных или животных жиров."),
} as Record<string, string>)[id] ?? '';

/** The words of the ingredient list to highlight. */
export function marks(ing: string, flags: string[]): RegExp | null {
  const parts = FLAGS.filter((x) => flags.includes(x.id) && x.re).map((x) => x.re!.source);
  const es = FLAGS.filter((x) => flags.includes(x.id) && x.e).flatMap((x) => x.e!.map((e) => e.slice(3)));
  if (es.length) parts.push(`${L}е?(${es.join('|')})${R}`);
  if (!parts.length || !ing) return null;
  try { return new RegExp(`(${parts.join('|')})`, 'gi'); } catch { return null; }
}

// ---------- remembered on this phone ----------

const KEY = 'lm.barcodes';
function all(): Record<string, Product> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
export function remembered(code: string): Product | null { return all()[code] ?? null; }
export function remember(p: Product) {
  const m = { ...all(), [p.code]: { ...p, t: Date.now() } };
  const keep = Object.values(m).sort((a, b) => b.t - a.t).slice(0, 80);
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(keep.map((x) => [x.code, x])))); } catch { /* storage full or blocked */ }
}

/** The default portion: one serving, else the pack when it is small, else 100 g. */
export const portion = (p: Product) => p.serving || (p.pack && p.pack <= 250 ? p.pack : 100);

/** Scanned products as rows for the «Что съел?» search, newest first. */
export function scannedRows(): FoodRow[] {
  return Object.values(all()).sort((a, b) => b.t - a.t).map((p) => ({ id: `bc-${p.code}`, n: p.n, k: p.k, p: p.p, f: p.f, c: p.c, g: portion(p) }));
}
