// Food modes, daily targets and a small built-in food table for typing what you ate.
// Numbers are rough guides for 100 g of a typical home-cooked dish; the screen shows them as a guide, not a diet.
import type { AppState, FoodBody, FoodItem, FoodMode, FoodState, Meal } from './types';
import { _t } from './i18n';

export interface FoodRow { id: string; n: string; k: number; p: number; f: number; c: number; g: number; u?: string }

const r = (id: string, n: string, k: number, p: number, f: number, c: number, g: number, u?: string): FoodRow => ({ id, n, k, p, f, c, g, u });
const PC = _t("шт");

/** kcal, protein, fat, carbs per 100 g; g is one usual portion (or one piece when u is set). */
export const FOODS: FoodRow[] = [
  r('bread', _t("Хлеб белый"), 265, 9, 3.2, 49, 30, _t("ломтик")),
  r('rye', _t("Хлеб чёрный"), 210, 7, 1.3, 40, 30, _t("ломтик")),
  r('lavash', _t("Лаваш"), 275, 9, 1.2, 56, 60),
  r('naan', _t("Лепёшка"), 280, 9, 2, 55, 100, PC),
  r('rice', _t("Рис варёный"), 130, 2.7, 0.3, 28, 150),
  r('buck', _t("Гречка варёная"), 110, 4, 1.1, 21, 150),
  r('oatw', _t("Овсянка на воде"), 70, 2.5, 1.5, 12, 250),
  r('oatm', _t("Овсянка на молоке"), 105, 3.5, 3.5, 15, 250),
  r('pasta', _t("Макароны варёные"), 155, 5.5, 1, 30, 180),
  r('bulgur', _t("Булгур варёный"), 85, 3, 0.2, 19, 150),
  r('cous', _t("Кускус варёный"), 112, 3.8, 0.2, 23, 150),
  r('potb', _t("Картофель варёный"), 85, 2, 0.1, 19, 200),
  r('potf', _t("Картофель жареный"), 190, 3, 10, 23, 150),
  r('fries', _t("Картофель фри"), 312, 3.4, 15, 41, 120),
  r('mash', _t("Пюре картофельное"), 105, 2, 4, 15, 200),
  r('muesli', _t("Мюсли"), 370, 9, 7, 66, 50),
  r('granola', _t("Гранола"), 470, 10, 20, 60, 50),
  r('flakes', _t("Кукурузные хлопья"), 357, 7, 0.4, 84, 30),
  r('pancake', _t("Блины"), 230, 6, 9, 30, 50, PC),
  r('syrn', _t("Сырники"), 220, 15, 10, 18, 60, PC),
  r('sandw', _t("Бутерброд"), 250, 11, 10, 28, 100, PC),

  r('chick', _t("Курица, грудка варёная"), 165, 31, 3.6, 0, 150),
  r('chickf', _t("Курица жареная"), 240, 25, 15, 0, 150),
  r('beef', _t("Говядина тушёная"), 230, 26, 14, 0, 150),
  r('lamb', _t("Баранина"), 260, 25, 17, 0, 150),
  r('mince', _t("Фарш говяжий жареный"), 250, 26, 16, 0, 120),
  r('cutlet', _t("Котлета"), 220, 15, 13, 10, 80, PC),
  r('fish', _t("Рыба запечённая"), 140, 22, 5, 0, 150),
  r('salmon', _t("Лосось"), 208, 20, 13, 0, 150),
  r('tuna', _t("Тунец консервированный"), 116, 26, 1, 0, 100),
  r('egg', _t("Яйцо"), 155, 13, 11, 1.1, 55, PC),
  r('omelet', _t("Омлет"), 155, 10, 12, 2, 150),
  r('lentil', _t("Чечевица варёная"), 116, 9, 0.4, 20, 150),
  r('chickp', _t("Нут варёный"), 164, 9, 2.6, 27, 150),
  r('beans', _t("Фасоль варёная"), 127, 8.7, 0.5, 23, 150),
  r('hummus', _t("Хумус"), 166, 8, 10, 14, 60),
  r('falafel', _t("Фалафель"), 333, 13, 18, 32, 20, PC),
  r('shawarma', _t("Шаурма с курицей"), 215, 12, 10, 20, 350, PC),
  r('plov', _t("Плов"), 200, 7, 9, 24, 300),
  r('manty', _t("Манты"), 220, 11, 11, 19, 50, PC),
  r('pelm', _t("Пельмени"), 250, 11, 12, 25, 200),
  r('dolma', _t("Долма"), 150, 8, 9, 9, 40, PC),
  r('kebab', _t("Люля-кебаб"), 260, 18, 20, 2, 100, PC),
  r('shash', _t("Шашлык из курицы"), 190, 24, 10, 1, 150),
  r('pizza', _t("Пицца"), 266, 11, 10, 33, 110, _t("кусок")),
  r('burger', _t("Бургер"), 255, 13, 12, 24, 220, PC),
  r('samsa', _t("Самса"), 330, 10, 18, 32, 120, PC),
  r('cheb', _t("Чебурек"), 280, 9, 15, 27, 130, PC),

  r('lsoup', _t("Чечевичный суп"), 70, 4, 2, 10, 300),
  r('csoup', _t("Куриный суп"), 45, 3.5, 1.5, 4, 300),
  r('borsch', _t("Борщ"), 50, 2.5, 2.5, 5, 300),
  r('shurpa', _t("Шурпа"), 75, 5, 4, 5, 350),
  r('lagman', _t("Лагман"), 120, 6, 4, 15, 400),

  r('milk', _t("Молоко"), 52, 2.8, 2.5, 4.7, 250, _t("стакан")),
  r('kefir', _t("Кефир"), 40, 3, 1, 4, 250, _t("стакан")),
  r('ayran', _t("Айран"), 25, 1.1, 1.5, 1.4, 250, _t("стакан")),
  r('yog', _t("Йогурт натуральный"), 66, 5, 3.2, 3.5, 150),
  r('tvorog', _t("Творог"), 121, 17, 5, 2, 150),
  r('cheese', _t("Сыр"), 350, 25, 27, 0, 30),
  r('brynza', _t("Брынза"), 260, 18, 20, 0.5, 50),
  r('smet', _t("Сметана"), 160, 2.6, 15, 3, 30),
  r('butter', _t("Масло сливочное"), 717, 0.9, 81, 0.1, 10),
  r('olive', _t("Оливковое масло"), 884, 0, 100, 0, 10, _t("ложка")),

  r('date', _t("Финик"), 282, 2.5, 0.4, 75, 8, PC),
  r('apple', _t("Яблоко"), 52, 0.3, 0.2, 14, 180, PC),
  r('banana', _t("Банан"), 89, 1.1, 0.3, 23, 120, PC),
  r('orange', _t("Апельсин"), 47, 0.9, 0.1, 12, 150, PC),
  r('mand', _t("Мандарин"), 53, 0.8, 0.3, 13, 80, PC),
  r('pear', _t("Груша"), 57, 0.4, 0.1, 15, 170, PC),
  r('grape', _t("Виноград"), 69, 0.7, 0.2, 18, 150),
  r('melon', _t("Арбуз"), 30, 0.6, 0.2, 8, 300),
  r('apric', _t("Курага"), 241, 3.4, 0.5, 63, 30),
  r('raisin', _t("Изюм"), 299, 3, 0.5, 79, 30),
  r('salad', _t("Овощной салат"), 25, 1, 0.2, 5, 200),
  r('salado', _t("Салат с маслом"), 90, 1, 7, 5, 200),
  r('cucum', _t("Огурец"), 15, 0.7, 0.1, 3.6, 120, PC),
  r('tomato', _t("Помидор"), 18, 0.9, 0.2, 3.9, 120, PC),
  r('carrot', _t("Морковь"), 41, 0.9, 0.2, 10, 80, PC),
  r('brocc', _t("Брокколи"), 35, 2.4, 0.4, 7, 150),
  r('avoc', _t("Авокадо"), 160, 2, 15, 9, 150, PC),

  r('walnut', _t("Грецкие орехи"), 654, 15, 65, 14, 30),
  r('almond', _t("Миндаль"), 579, 21, 50, 22, 30),
  r('peanut', _t("Арахис"), 567, 26, 49, 16, 30),
  r('seeds', _t("Семечки"), 584, 21, 51, 20, 30),
  r('pbutter', _t("Арахисовая паста"), 588, 25, 50, 20, 20, _t("ложка")),
  r('honey', _t("Мёд"), 304, 0.3, 0, 82, 20, _t("ложка")),
  r('sugar', _t("Сахар"), 400, 0, 0, 100, 5, _t("ложка")),
  r('jam', _t("Варенье"), 270, 0.4, 0.1, 70, 20, _t("ложка")),
  r('choc', _t("Шоколад"), 540, 6, 31, 58, 25),
  r('cookie', _t("Печенье"), 450, 6, 18, 68, 15, PC),
  r('cake', _t("Торт"), 370, 5, 18, 48, 100, _t("кусок")),
  r('baklava', _t("Пахлава"), 430, 6, 24, 50, 50, PC),
  r('halva', _t("Халва"), 520, 12, 30, 54, 50),
  r('icecr', _t("Мороженое"), 207, 3.5, 11, 24, 80),
  r('talbina', _t("Тальбина"), 100, 3, 2, 18, 250),

  r('tea', _t("Чай без сахара"), 1, 0, 0, 0.2, 250, _t("чашка")),
  r('teas', _t("Чай с сахаром"), 30, 0, 0, 7.5, 250, _t("чашка")),
  r('coffee', _t("Кофе чёрный"), 2, 0.3, 0, 0, 200, _t("чашка")),
  r('capp', _t("Капучино"), 50, 2.7, 2.7, 4.5, 250, _t("чашка")),
  r('juice', _t("Сок апельсиновый"), 45, 0.7, 0.2, 10, 250, _t("стакан")),
  r('soda', _t("Газировка"), 42, 0, 0, 10.6, 330, _t("банка")),
  r('compot', _t("Компот"), 60, 0.2, 0, 15, 250, _t("стакан")),
  r('prot', _t("Протеиновый коктейль"), 380, 75, 6, 8, 30, _t("порция")),
  r('pbar', _t("Протеиновый батончик"), 350, 30, 10, 35, 60, PC),
  r('gainer', _t("Гейнер"), 380, 20, 3, 70, 100, _t("порция")),
];

export const MODES: { id: FoodMode; l: string; d: string; ic: string }[] = [
  { id: 'mera', l: _t("Мера"), d: _t("Без цифр: три приёма, правило трети, отказ и сунна"), ic: 'leaf' },
  { id: 'lose', l: _t("Похудеть"), d: _t("Мягкий дефицит, не ниже безопасного минимума"), ic: 'timer' },
  { id: 'sport', l: _t("Спорт и набор"), d: _t("Больше белка, в дни тренировок чуть больше еды"), ic: 'heart' },
  { id: 'keep', l: _t("Поддерживать"), d: _t("Держать вес и есть ровно"), ic: 'check' },
];

export const ACT: { v: FoodBody['act']; l: string; d: string; x: number }[] = [
  { v: 1, l: _t("Мало движения"), d: _t("сидячая работа"), x: 1.2 },
  { v: 2, l: _t("Немного"), d: _t("прогулки, 1–2 тренировки"), x: 1.375 },
  { v: 3, l: _t("Средне"), d: _t("3–5 тренировок в неделю"), x: 1.55 },
  { v: 4, l: _t("Много"), d: _t("тренировки почти каждый день"), x: 1.725 },
];

export const lastWeight = (f: FoodState) => {
  const e = Object.entries(f.weight).sort(([a], [b]) => (a < b ? -1 : 1));
  return e.length ? e[e.length - 1][1] : undefined;
};

export interface Target { k: number; p: number; f: number; c: number; floor: boolean; train: boolean }

/** Daily target from Mifflin–St Jeor: BMR × activity, then the mode. Returns null in Мера or without data. */
export function target(s: AppState, f: FoodState, today: string): Target | null {
  const b = f.body, w = lastWeight(f), mode = f.mode ?? 'mera';
  if (mode === 'mera' || !b || !w) return null;
  const bmr = 10 * w + 6.25 * b.h - 5 * b.age + (b.sex === 'f' ? -161 : 5);
  const tdee = bmr * (ACT.find((a) => a.v === b.act)?.x ?? 1.375);
  const train = Boolean(s.health?.workouts?.[today]?.length);
  let k = tdee, p = 1.2 * w, fatShare = 0.3, floor = false;
  if (mode === 'lose' && b.age >= 18) {
    k = tdee - Math.min(500, tdee * 0.15);
    const min = Math.max(bmr, b.sex === 'f' ? 1200 : 1500);
    if (k < min) { k = min; floor = true; }
    p = 1.6 * w;
  } else if (mode === 'sport') {
    k = tdee * 1.1 + (train ? 250 : 0);
    p = 1.8 * w; fatShare = 0.25;
  }
  if (f.kcal) k = f.kcal;
  k = Math.round(k / 50) * 50;
  p = Math.round(p);
  const fat = Math.round((k * fatShare) / 9);
  const c = Math.max(0, Math.round((k - p * 4 - fat * 9) / 4));
  return { k, p, f: fat, c, floor, train };
}

/** Text the person typed: «плов 300», «2 яйца», «banana». Splits off a number; small numbers mean pieces or portions. */
export function parseQuery(q: string): { text: string; grams?: number; count?: number } {
  const t = q.trim().toLowerCase().replace(',', '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(г|гр|g|грамм\w*|мл|ml)?/);
  if (!m) return { text: t };
  const n = Number(m[1]);
  const text = (t.slice(0, m.index) + ' ' + t.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();
  return m[2] || n >= 20 ? { text, grams: n } : { text, count: n };
}

const norm = (x: string) => x.toLowerCase().replace(/ё/g, 'е');

/** Up to six table rows that match the typed words (start of each word, either language). */
export function search(text: string, rows: FoodRow[] = FOODS): FoodRow[] {
  const words = norm(text).split(/[\s,]+/).filter((w) => w.length > 1).map((w) => w.slice(0, Math.max(3, w.length - 2)));
  if (!words.length) return [];
  return rows.map((x) => {
    const name = norm(x.n);
    const hit = words.filter((w) => name.split(/[\s,()-]+/).some((p) => p.startsWith(w)) || name.includes(w)).length;
    return { x, hit, starts: name.startsWith(words[0]) ? 1 : 0 };
  }).filter((r) => r.hit === words.length).sort((a, b) => b.starts - a.starts || a.x.n.length - b.x.n.length).slice(0, 6).map((r) => r.x);
}

export function itemFrom(row: FoodRow, grams: number, m: Meal): FoodItem {
  const q = grams / 100;
  return { id: `fi-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, n: row.n, g: Math.round(grams), k: Math.round(row.k * q), p: Math.round(row.p * q * 10) / 10, f: Math.round(row.f * q * 10) / 10, c: Math.round(row.c * q * 10) / 10, m };
}

export const sum = (l: FoodItem[]) => l.reduce((a, x) => ({ k: a.k + x.k, p: a.p + x.p, f: a.f + x.f, c: a.c + x.c }), { k: 0, p: 0, f: 0, c: 0 });
