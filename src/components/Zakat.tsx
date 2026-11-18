import { useState } from 'react';
import type { AppState, SadaqaState, ZakatState } from '../types';
import { addDays, fromKey } from '../dates';
import { type Lang, tr, _t } from '../i18n';

type Update = (fn: (s: AppState) => AppState) => void;
const zOf = (s: AppState): ZakatState => ({ basis: s.settings.madhab === 'hanafi' ? 'silver' : 'gold', gold: 0, silver: 0, items: {}, paid: [], ...(s.sadaqa?.zakat ?? {}) });
const patchZ = (s: AppState, fn: (z: ZakatState) => Partial<ZakatState>): AppState => {
  const z = zOf(s);
  const q = { days: {}, secret: true, cur: '€', ramadan: null, jariya: [], ...(s.sadaqa ?? {}) } as SadaqaState;
  return { ...s, sadaqa: { ...q, zakat: { ...z, ...fn(z) } } };
};

const ITEMS: { id: string; t: [string, string]; minus?: boolean }[] = [
  { id: 'cash', t: [_t("Наличные"), 'Cash'] },
  { id: 'bank', t: [_t("На счетах и картах"), 'Bank accounts and cards'] },
  { id: 'gold', t: [_t("Золото (стоимость)"), 'Gold (value)'] },
  { id: 'silver', t: [_t("Серебро (стоимость)"), 'Silver (value)'] },
  { id: 'invest', t: [_t("Акции, фонды, крипто"), 'Shares, funds, crypto'] },
  { id: 'goods', t: [_t("Товар для продажи"), 'Goods for sale'] },
  { id: 'owed', t: [_t("Тебе должны и вернут"), 'Money owed to you that will be repaid'] },
  { id: 'debts', t: [_t("Твои долги к оплате сейчас"), 'Your debts due now'], minus: true },
];
export const NISAB_G = { gold: 85, silver: 595 };

/** Zakat al-mal: nisab by gold or silver, 2.5% of what you hold for a lunar year. */
export function Zakat({ state, update, l }: { state: AppState; update: Update; l: Lang }) {
  const t = tr(l);
  const i = l === 'en' ? 1 : 0;
  const z = zOf(state);
  const cur = state.sadaqa?.cur ?? '€';
  const loc = l === 'en' ? 'en-GB' : 'ru-RU';
  const money = (v: number) => `${(Math.round(v * 100) / 100).toLocaleString(loc, { maximumFractionDigits: 2 })} ${cur}`;
  const set = (p: Partial<ZakatState>) => update((s) => patchZ(s, () => p));
  const total = ITEMS.reduce((a, it) => a + (it.minus ? -1 : 1) * (z.items[it.id] ?? 0), 0);
  const price = z.basis === 'gold' ? z.gold : z.silver;
  const nisab = price > 0 ? price * NISAB_G[z.basis] : 0;
  const due = nisab > 0 && total >= nisab ? total * 0.025 : 0;
  const last = z.paid[z.paid.length - 1];
  const [open, setOpen] = useState(false);
  const fmt = (k: string) => fromKey(k).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="h-card h-hero">
        <small>{t('Закят к выплате', 'Zakat due')}</small>
        <b className="h-big sm">{nisab ? money(due) : '—'}</b>
        <small>{!nisab ? t('Введи цену грамма ниже, чтобы узнать нисаб.', 'Enter the price per gram below to get the nisab.') : total >= nisab ? t(`Имущество ${money(total)} выше нисаба ${money(nisab)}. Закят — 2,5%.`, `Your wealth ${money(total)} is above the nisab of ${money(nisab)}. Zakat is 2.5%.`) : t(`Имущество ${money(total)} ниже нисаба ${money(nisab)}. Закят не обязателен.`, `Your wealth ${money(total)} is below the nisab of ${money(nisab)}. Zakat is not due.`)}</small>
      </div>

      <div className="h-card">
        <div className="meal-h"><b>{t('Нисаб', 'Nisab')}</b><small>{NISAB_G[z.basis]} {t('г', 'g')}</small></div>
        <div className="choices">
          {(['gold', 'silver'] as const).map((b) => <button type="button" key={b} aria-pressed={z.basis === b} onClick={() => set({ basis: b })}>{b === 'gold' ? t('По золоту, 85 г', 'Gold, 85 g') : t('По серебру, 595 г', 'Silver, 595 g')}</button>)}
        </div>
        <label className="field"><span>{z.basis === 'gold' ? t(`Цена 1 г золота, ${cur}`, `Price of 1 g of gold, ${cur}`) : t(`Цена 1 г серебра, ${cur}`, `Price of 1 g of silver, ${cur}`)}</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={price || ''} onChange={(e) => set(z.basis === 'gold' ? { gold: Math.max(0, Number(e.target.value) || 0) } : { silver: Math.max(0, Number(e.target.value) || 0) })} placeholder={t('цену можно посмотреть в банке', 'check the price at your bank')} />
        </label>
        <small>{t('Нисаб по серебру ниже, поэтому закят платят больше людей и больше получают бедные; так считают ханафиты и многие современные советы. По золоту считает большинство остальных.', 'The silver nisab is lower, so more people pay and the poor receive more; Hanafis and many modern councils use it. Most others use gold.')}</small>
      </div>

      <div className="h-card">
        <b>{t('Что у тебя есть', 'What you have')}</b>
        {ITEMS.map((it) => (
          <label key={it.id} className="field zk-row"><span>{it.minus ? '− ' : ''}{it.t[i]}</span>
            <input type="number" inputMode="decimal" min="0" step="1" value={z.items[it.id] || ''} onChange={(e) => set({ items: { ...z.items, [it.id]: Math.max(0, Number(e.target.value) || 0) } })} placeholder="0" />
          </label>
        ))}
        <small>{t('Дом, машина, одежда и вещи для себя не считаются. Закят обязателен, если сумма не опускалась ниже нисаба целый лунный год (354 дня).', 'Your home, car, clothes and personal belongings do not count. Zakat is due when the amount stayed above the nisab for a whole lunar year (354 days).')}</small>
      </div>

      <div className="h-card">
        <div className="meal-h"><b>{t('Отдал закят', 'Zakat given')}</b>{last && <small>{fmt(last.date)}</small>}</div>
        {last ? <small>{t(`Последний раз ${money(last.amt)}. Следующий примерно ${fmt(addDays(last.date, 354))}.`, `Last time ${money(last.amt)}. Next around ${fmt(addDays(last.date, 354))}.`)}</small> : <small>{t('Многие отдают закят в Рамадан: награда за добро в этот месяц больше.', 'Many give zakat in Ramadan, when good deeds weigh more.')}</small>}
        <button type="button" className="gold-btn" disabled={!due} onClick={() => set({ paid: [...z.paid, { date: today, amt: Math.round(due * 100) / 100 }] })}>{t('Отметить: отдал сегодня', 'Mark as given today')}</button>
        {z.paid.length > 0 && (
          <>
            <button type="button" className="link-btn" onClick={() => setOpen(!open)}>{open ? t('Скрыть историю', 'Hide history') : t(`История: ${z.paid.length}`, `History: ${z.paid.length}`)}</button>
            {open && z.paid.slice().reverse().map((p, j) => (
              <div key={j} className="meal-h"><small>{fmt(p.date)}</small><small>{money(p.amt)}</small></div>
            ))}
          </>
        )}
      </div>
      <p className="q-msg left tiny-note">{t('Закят получают восемь групп из аята 9:60: бедные, нуждающиеся, должники и другие. Расчёт — ориентир; со сложными случаями (бизнес, пенсия, долги) подойди к имаму. Всё хранится только у тебя.', 'Zakat goes to the eight groups in ayah 9:60: the poor, the needy, those in debt and others. This is a guide; take complex cases (business, pension, debts) to an imam. Everything stays on your device.')}</p>
    </>
  );
}
