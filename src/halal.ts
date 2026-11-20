// «Халяль-сканер» (mockup approved 20.11): one barcode, one of four answers.
//   green  – a halal certificate / logo is known for this product (Open Food Facts label, or marked by the person);
//   red    – the ingredients name something forbidden (pork, blood, alcohol as an ingredient);
//   yellow – something whose source decides (gelatin, E471 and friends, meat without a certificate, rennet…);
//   clean  – nothing forbidden or doubtful in the list, but no certificate: we never call it «халяль».
// The word lists are a starting point for an imam to review before launch. Ingredient lists come in many languages
// (shops in the Netherlands, Germany, Turkey…), so the words are given in Russian, English, Dutch, German, French and Turkish,
// and Open Food Facts' own language-free ingredient and additive tags are checked as well.
// Only the barcode number leaves the phone.
import { LANG, _t } from './i18n';

export type Verdict = 'green' | 'red' | 'yellow' | 'clean' | 'unknown';
export type Level = 'red' | 'yellow';

export interface HProduct {
  code: string;
  n: string;
  brand?: string;
  img?: string;
  ing?: string;
  /** language-free tags from the database, used together with the text */
  tags?: string;
  adds?: string[];
  cats?: string[];
  /** the database says the pack carries a halal label */
  label: boolean;
  /** read from a photo of the pack, not from the database */
  photo?: boolean;
  t: number;
}

export type Mz = 'hanafi' | 'shafi' | 'maliki' | 'hanbali';
export interface Opts { mz: Mz; sea: boolean; e471: boolean }

// Cyrillic has no \b in JS regexps, so word edges are written out.
const L = '(?<![a-zа-яёçğıöşüäéèà])';
const R = '(?![a-zа-яёçğıöşüäéèà])';

interface Rule { id: string; level: Level; re?: string; e?: string[]; tags?: string; only?: (o: Opts) => boolean; unless?: string }

export const RULES: Rule[] = [
  // ---- red: forbidden by the Quran ----
  { id: 'pork', level: 'red', re: `свин|${L}сало${R}|бекон|шпик|${L}pork|${L}lard${R}|bacon|pancetta|prosciutto|gelatine? de porc|porcine|schwein|${L}speck${R}|schmalz|varken|${L}spek${R}|reuzel|${L}porc${R}|saindoux|domuz`, tags: 'pork|lard|bacon|pig' },
  { id: 'blood', level: 'red', re: `${L}кров(ь|и|ян)|${L}blood|${L}blut${R}|bloed|${L}sang${R}|${L}kan${R}`, tags: 'blood' },
  { id: 'alcohol', level: 'red', re: `спирт этилов|этиловый спирт|алкогол|${L}вин(о|а|ом|е)${R}|коньяк|${L}ром(а|ом)?${R}|ликёр|ликер|${L}пив(о|а)${R}|водк|виски|бренди|херес|портвейн|${L}alcohol${R}|ethanol|${L}wine${R}|${L}rum${R}|brandy|liqueur|${L}beer${R}|cognac|whisk(e)?y|vodka|sherry|${L}wijn${R}|${L}bier${R}|${L}wein${R}|${L}vin${R}|bière|${L}alkol|şarap|${L}bira${R}`, tags: 'wine|beer|rum|alcohol|liqueur|brandy|cognac|whisky|vodka|ethanol', unless: 'безалкогол|alcohol[- ]?free|non[- ]alcoholic|alcoholvrij|alkoholfrei|sans alcool|0[,.]0 ?%' },
  // ---- yellow: the source decides ----
  { id: 'gelatin', level: 'yellow', e: ['en:e441'], re: `желатин|gelatin|gélatine|jelatin`, tags: 'gelatin', unless: `рыбн(ый|ого) желатин|fish gelatin|vis ?gelatine|fischgelatine|gélatine de poisson|balık jelatini` },
  { id: 'meat', level: 'yellow', re: `говяд|говяж|телят|баран|${L}кури(ц|н)|${L}индейк|${L}утк|${L}мяс(о|а|ной|ные|ного)${R}|ветчин|колбас|сосис|сардел|${L}beef|chicken|turkey|${L}lamb${R}|mutton|${L}veal|${L}meat${R}|${L}ham${R}|sausage|rundvlees|${L}kip${R}|kalkoen|${L}vlees|${L}worst|${L}rind|${L}huhn|hähnchen|${L}pute|fleisch|${L}wurst|${L}boeuf|bœuf|poulet|${L}dinde|viande|sığır|tavuk|hindi|${L}et${R}|sucuk`, tags: 'beef|chicken|turkey|lamb|mutton|veal|meat|ham|sausage|poultry' },
  { id: 'fat', level: 'yellow', re: `животн(ый|ые|ого) жир|жир животн|говяжий жир|топлён|топлен|animal fat|beef fat|tallow|dierlijk vet|rundvet|tierisches fett|rindertalg|graisse animale|suif|hayvansal yağ`, tags: 'animal-fat|tallow|beef-fat' },
  { id: 'e471', level: 'yellow', e: ['en:e471', 'en:e472', 'en:e472a', 'en:e472b', 'en:e472c', 'en:e472d', 'en:e472e', 'en:e472f', 'en:e422', 'en:e570', 'en:e631', 'en:e635'], re: `${L}е?e?\\s?-?47[12][a-f]?${R}|моно- и диглицерид|mono- (and|en|und|et) di-?glycerid|${L}е?e?\\s?-?422${R}|глицерин|glycerin|glycerol|${L}е?e?\\s?-?570${R}|стеаринов|stearic acid`, only: (o) => o.e471 },
  { id: 'carmine', level: 'yellow', e: ['en:e120'], re: `кармин|кошениль|carmine|cochineal|karmijn|karmin|${L}е?e?\\s?-?120${R}` },
  { id: 'shellac', level: 'yellow', e: ['en:e904'], re: `шеллак|shellac|schellack|gomme laque` },
  { id: 'bone', level: 'yellow', e: ['en:e542'], re: `костн|bone phosphate|${L}е?e?\\s?-?542${R}` },
  { id: 'cysteine', level: 'yellow', e: ['en:e920'], re: `цистеин|cysteine|cystein|${L}е?e?\\s?-?920${R}` },
  { id: 'rennet', level: 'yellow', re: `сычуж|химозин|пепсин|rennet|chymosin|pepsin|stremsel|${L}lab${R}|présure|peynir mayası`, tags: 'rennet|pepsin', unless: `микроб|микробиальн|microbial|vegetarian rennet|microbieel|mikrobiell` },
  { id: 'flavour', level: 'yellow', re: `на спирту|спиртов(ой|ого) экстракт|экстракт ванил|vanilla extract|vanille-?extract|vanilleextrakt|extrait de vanille`, tags: 'vanilla-extract' },
  { id: 'sea', level: 'yellow', re: `креветк|кальмар|миди(я|и|й)|${L}краб(?!ов(ые|ых) палоч)|осьминог|омар|лобстер|устриц|гребеш|shrimp|prawn|squid|mussel|${L}crab|octopus|lobster|oyster|scallop|garnal|inktvis|mossel|krab|garnele|tintenfisch|muschel|crevette|calmar|moule|karides|kalamar|midye`, tags: 'shrimp|prawn|squid|mussel|crab|octopus|lobster|oyster|scallop|shellfish|crustacean|mollusc', only: (o) => o.sea },
];

const MEAT_CATS = /^en:(meats|prepared-meats|sausages|hams|poultries|poultry|beef|meat-|chicken|turkey|lamb|salami|charcuterie|deli-meats)/;

export interface Found { id: string; level: Level }
export interface Check { verdict: Verdict; found: Found[] }

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
const cache = new Map<string, RegExp>();
const rx = (s: string) => { let r = cache.get(s); if (!r) { r = new RegExp(s, 'i'); cache.set(s, r); } return r; };

/** Which rules a product trips, and the colour of the answer. */
export function checkProduct(p: Pick<HProduct, 'ing' | 'tags' | 'adds' | 'cats' | 'label'>, o: Opts, mine?: boolean): Check {
  const text = norm(p.ing ?? '');
  const tags = (p.tags ?? '').toLowerCase();
  const adds = p.adds ?? [];
  const found: Found[] = [];
  for (const r of RULES) {
    if (r.only && !r.only(o)) continue;
    const hit = (r.e && r.e.some((e) => adds.includes(e)))
      || (r.re && text && rx(r.re).test(text))
      || (r.tags && tags && rx(`(^|[ ,:-])(${r.tags})([ ,-]|$)`).test(tags));
    if (!hit) continue;
    if (r.unless && rx(r.unless).test(text) && !(r.e && r.e.some((e) => adds.includes(e)))) {
      // «безалкогольное», «рыбный желатин», «микробный фермент»: only skip when nothing else points to the rule
      if (!(r.re && rx(r.re).test(text.replace(rx(r.unless), '')))) continue;
    }
    found.push({ id: r.id, level: r.level });
  }
  if (!found.some((f) => f.id === 'meat') && (p.cats ?? []).some((c) => MEAT_CATS.test(c))) found.push({ id: 'meat', level: 'yellow' });
  // Pork gelatin is already pork: one red line is enough.
  if (found.some((f) => f.id === 'pork')) { const i = found.findIndex((f) => f.id === 'gelatin'); if (i >= 0) found.splice(i, 1); }
  // A certified product with alcohol listed is usually a flavour carrier the certifier accepted: ask, don't condemn.
  if (p.label) for (const f of found) if (f.id === 'alcohol') f.level = 'yellow';
  const red = found.some((f) => f.level === 'red');
  const verdict: Verdict = red ? 'red' : p.label || mine ? 'green' : found.length ? 'yellow' : text || tags ? 'clean' : 'unknown';
  return { verdict, found };
}

/** One regexp that marks the flagged words in the ingredient text, with their level. */
export function marksOf(found: Found[], o: Opts): { re: RegExp; level: (s: string) => Level } | null {
  const rules = RULES.filter((r) => r.re && found.some((f) => f.id === r.id) && (!r.only || r.only(o)));
  if (!rules.length) return null;
  try {
    const re = new RegExp(`(${rules.map((r) => r.re).join('|')})`, 'gi');
    const level = (s: string): Level => (rules.some((r) => r.level === 'red' && rx(r.re!).test(norm(s))) ? 'red' : 'yellow');
    return { re, level };
  } catch { return null; }
}

export const ruleName = (id: string) => ({
  pork: _t("Свинина"), blood: _t("Кровь"), alcohol: _t("Алкоголь"), gelatin: _t("Желатин"), meat: _t("Мясо без сертификата"),
  fat: _t("Животный жир"), e471: _t("E471 и похожие"), carmine: _t("E120 (кармин)"), shellac: _t("E904 (шеллак)"), bone: _t("E542 (костный фосфат)"),
  cysteine: _t("E920 (L-цистеин)"), rennet: _t("Сычужный фермент"), flavour: _t("Экстракт на спирту"), sea: _t("Морепродукты"),
} as Record<string, string>)[id] ?? id;

export const ruleWhy = (id: string) => ({
  pork: _t("Всё из свиньи: мясо, сало, бекон, жир и желатин."),
  blood: _t("Кровь и продукты из неё запрещены."),
  alcohol: _t("Вино, пиво, ром, коньяк или спирт в составе."),
  gelatin: _t("Желатин бывает свиной, говяжий или рыбный. Говяжий халяль только при забое по шариату."),
  meat: _t("Неизвестно, как забито животное."),
  fat: _t("Неизвестно, от какого животного и как забито."),
  e471: _t("E471, E472, E422, E570 делают из растительного или животного жира. По составу не понять."),
  carmine: _t("Краситель из насекомых, мнения учёных расходятся."),
  shellac: _t("Покрытие из выделений насекомых, мнения учёных расходятся."),
  bone: _t("Делают из костей животных."),
  cysteine: _t("Бывает из перьев, волос или синтетический."),
  rennet: _t("Фермент из желудка телёнка: важно, как забито животное. Микробный фермент без вопросов."),
  flavour: _t("Ароматизатор или экстракт на спирту, мнения учёных расходятся."),
  sea: _t("Морепродукты кроме рыбы: в ханафитском мазхабе нельзя, в других можно."),
} as Record<string, string>)[id] ?? '';

// ---------- options, history and own marks on this phone ----------

const OPT = 'lm.halal.opts', HIST = 'lm.halal.hist', MINE = 'lm.halal.mine';
const read = <T,>(k: string, d: T): T => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

/** The scanner's own madhab choice (four schools; only seafood differs here), first taken from the profile. */
export function optsOf(madhab: 'hanafi' | 'shafi'): Opts {
  const o = read<Partial<Opts>>(OPT, {});
  const mz: Mz = o.mz && ['hanafi', 'shafi', 'maliki', 'hanbali'].includes(o.mz) ? o.mz : madhab;
  return { mz, sea: mz === 'hanafi', e471: o.e471 ?? true };
}
export const setOpts = (o: Pick<Opts, 'mz' | 'e471'>) => write(OPT, { mz: o.mz, e471: o.e471 });

export interface Hist { code: string; n: string; v: Verdict; why: string; t: number; p?: HProduct }
export const history = (): Hist[] => read<Hist[]>(HIST, []);
export function addHistory(h: Hist) {
  const list = [h, ...history().filter((x) => x.code !== h.code || x.code === '')].slice(0, 60);
  write(HIST, list);
}
export const clearHistory = () => write(HIST, []);

/** Products the person marked «на упаковке знак халяль»: green on this phone. */
export const mineHalal = (code: string) => Boolean(read<Record<string, number>>(MINE, {})[code]);
export function setMineHalal(code: string, on: boolean) {
  const m = read<Record<string, number>>(MINE, {});
  if (on) m[code] = Date.now(); else delete m[code];
  write(MINE, m);
}

// ---------- finding the product ----------

const FIELDS = 'code,product_name,product_name_ru,product_name_en,brands,image_front_small_url,ingredients_text,ingredients_text_ru,ingredients_text_en,ingredients_tags,labels_tags,additives_tags,categories_tags';

export type HLookup = { ok: true; p: HProduct } | { ok: false; why: 'none' | 'net' };

export async function findProduct(code: string, signal?: AbortSignal): Promise<HLookup> {
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`, { signal });
    if (r.status === 404) return { ok: false, why: 'none' };
    if (!r.ok) return { ok: false, why: 'net' };
    const j = await r.json();
    const x = j?.product;
    if (!x || j.status === 0) return { ok: false, why: 'none' };
    const str = (v: unknown) => String(v ?? '').trim();
    const name = str((LANG === 'en' ? x.product_name_en : x.product_name_ru) || x.product_name || x.product_name_en || x.product_name_ru);
    const ing = str((LANG === 'en' ? x.ingredients_text_en : x.ingredients_text_ru) || x.ingredients_text || x.ingredients_text_en || x.ingredients_text_ru);
    const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
    const labels = arr(x.labels_tags);
    const img = str(x.image_front_small_url);
    return {
      ok: true,
      p: {
        code, n: name || _t("Товар без названия"), brand: str(x.brands).split(',')[0].trim() || undefined,
        img: /^https:\/\/images\.openfoodfacts\.org\//.test(img) ? img : undefined,
        ing: ing.slice(0, 1500) || undefined,
        tags: arr(x.ingredients_tags).map((t) => t.replace(/^[a-z]{2}:/, '').replace(/-/g, ' ')).join(', ').slice(0, 3000) || undefined,
        adds: arr(x.additives_tags), cats: arr(x.categories_tags).slice(0, 40),
        label: labels.some((l) => /halal|helal/i.test(l)),
        t: Date.now(),
      },
    };
  } catch {
    return { ok: false, why: 'net' };
  }
}

/** The ready letter to a producer about an ingredient whose source is unclear. */
export function letterText(p: HProduct, found: Found[]): { subject: string; body: string } {
  const what = found.filter((f) => f.level === 'yellow').map((f) => ruleName(f.id)).join(', ');
  return {
    subject: _t("Вопрос о составе: {0}", p.n),
    body: _t("Здравствуйте!\n\nЯ покупаю ваш продукт «{0}» (штрихкод {1}). Подскажите, пожалуйста, из чего сделаны: {2}? Растительного они происхождения или животного, и если животного, то от какого животного и есть ли халяль-сертификат?\n\nСпасибо!", p.n, p.code || "—", what || _t("ингредиенты")),
  };
}
