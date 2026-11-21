import type { AppState, UmrahState } from '../types';
import type { UmrahApi, URsvp } from '../umrahCircle';
import { PREP } from './guide';
import { _t, _tj } from '../i18n';

// «Моя умра»: one trip, one path. Whatever way a person goes (a group, alone, with an agency, or only
// dreaming for now), the same six steps and one readiness number: heart + tasks + money.
// The number is kept in the state (umrah.ready), so Goals, Practice and the group show the very same figure.

export type UMode = NonNullable<UmrahState['mode']>;
export const HEART = ['niyya', 'tawba', 'debts', 'learn', 'talbiya', 'duas', 'farewell'];
/** Prep «deeds» and the step where each one lives now. */
export const DEED_STEP: Record<string, number> = { tickets: 2, nusuk: 3, vaccine: 3, rawdah: 3, walk: 5, clothes: 5, family: 5 };

export interface PathStep { id: 'gather' | 'dates' | 'travel' | 'docs' | 'money' | 'road'; t: string; s: string; ok: boolean; next: string }
export interface PathModel { mode: UMode | null; steps: PathStep[]; now: number; heart: number; tasks: number; money: number; ready: number }

const uOf = (s: AppState): UmrahState => ({ prep: [], duas: [], tawaf: 0, saee: 0, ...(s.umrah ?? {}) });
const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fundSum = (f: { entries: { amt: number }[] }) => f.entries.reduce((a, e) => a + e.amt, 0);
const dl = (d: string) => { const [, m, day] = d.split('-').map(Number); return `${day} ${[_t("янв"), _t("фев"), _t("мар"), _t("апр"), _t("мая"), _t("июн"), _t("июл"), _t("авг"), _t("сен"), _t("окт"), _t("ноя"), _t("дек")][m - 1]}`; };

interface Group { api: UmrahApi; host: string; going: string[] }

export function pathModel(state: AppState, g: Group | null, modeIn?: UMode | null): PathModel {
  const u = uOf(state);
  const mode: UMode | null = g ? 'group' : modeIn ?? u.mode ?? (u.from ? 'solo' : null);
  const me = g?.api.me ?? null;
  const r: URsvp | undefined = g && me ? g.api.rsvp[me]?.[g.host] : undefined;
  const trip = g ? g.api.trips[g.host] : null;
  const chosen = trip?.dates?.find((d) => d.id === trip.chosen);
  const from = chosen?.from ?? u.from, to = chosen?.to ?? u.to;
  const docs = u.docs ?? [];
  const hasDoc = (k: string) => docs.some((d) => d.kind === k) || Boolean(r?.docs?.includes(k));
  const fund = (u.funds ?? []).find((f) => !f.for);
  const booked = u.booked ?? [];

  const going = g?.going.length ?? 1;
  const iRoom = Boolean(me && trip?.rooms?.some((x) => x.people.includes(me)));
  const ticketOk = mode === 'agency' || (g ? Boolean(r?.bought) : booked.includes('flight')) || hasDoc('ticket');
  const hotelOk = mode === 'agency' || (g ? Boolean(r?.hotel) || iRoom : booked.includes('hotel')) || hasDoc('hotel');
  const coreDocs = ['passport', 'visa', 'insurance', 'nusuk'];
  const docsHave = coreDocs.filter(hasDoc).length;
  const moneyPct = fund ? Math.min(100, pctOf(fundSum(fund), fund.goal)) : 0;

  const steps: PathStep[] = [
    {
      id: 'gather', t: _t("Собраться"),
      s: mode === 'group' ? _tj("{0} {1}", going, going === 1 ? _t("человек пока, позови братьев") : _t("едут вместе"))
        : mode === 'solo' ? _t("Еду один · попутчики по желанию")
        : mode === 'agency' ? (u.agency ? _tj("Агентство «{0}»", u.agency) : _t("Еду с агентством · впиши его"))
        : _t("Пока мечтаю · выбери, как поедешь"),
      ok: mode === 'group' ? going >= 2 : mode === 'solo' ? true : mode === 'agency' ? Boolean(u.agency) : false,
      next: mode === 'group' ? _t("Позвать братьев в поездку") : mode === 'agency' ? _t("Вписать своё агентство") : _t("Решить, как поедешь"),
    },
    {
      id: 'dates', t: _t("Даты"),
      s: from && to ? `${dl(from)} – ${dl(to)}` : g && trip?.dates?.length ? _tj("Вариантов: {0}, голосуем", trip.dates.length) : _t("Когда едешь и когда лучше ехать"),
      ok: Boolean(from && to),
      next: g ? _t("Предложить и выбрать даты") : _t("Выбрать даты поездки"),
    },
    {
      id: 'travel', t: _t("Билеты и жильё"),
      s: mode === 'agency' ? _t("Берёт агентство") : [ticketOk ? _t("билет ✓") : _t("билет"), hotelOk ? _t("отель ✓") : _t("отель")].join(' · '),
      ok: ticketOk && hotelOk,
      next: !ticketOk ? _t("Купить билеты") : _t("Найти отель у Харама"),
    },
    {
      id: 'docs', t: _t("Документы"), s: _tj("Собрано {0} из {1} · паспорт, виза, страховка, Nusuk", docsHave, coreDocs.length),
      ok: hasDoc('passport') && hasDoc('visa'),
      next: !hasDoc('passport') ? _t("Добавить фото паспорта") : _t("Оформить визу и добавить её"),
    },
    {
      id: 'money', t: _t("Деньги"),
      s: fund ? _tj("Копилка {0}{1} из {0}{2}", fund.cur, Math.round(fundSum(fund)), fund.goal) : _t("Копилка, общая касса, пропуск"),
      ok: moneyPct >= 100,
      next: fund ? _t("Пополнить копилку") : _t("Начать копилку на умру"),
    },
    {
      id: 'road', t: _t("В пути"), s: _t("Микат, отель для «Я потерялся», точка встречи"),
      ok: Boolean(u.site?.hotel && u.site?.meet),
      next: _t("Вписать отель и точку встречи"),
    },
  ];
  // Deeds that sit in a step: the step is only done when they are.
  const deeds = PREP.filter((p) => !HEART.includes(p.id));
  const deedsDone = deeds.filter((p) => u.prep.includes(p.id) || (p.id === 'tickets' && steps[2].ok)).length;
  const heart = pctOf(PREP.filter((p) => HEART.includes(p.id) && u.prep.includes(p.id)).length, HEART.length);
  const counted = [0, 1, 2, 3, 5];
  const tasks = pctOf(counted.filter((i) => steps[i].ok).length + deedsDone, counted.length + deeds.length);
  const parts = mode === 'dream' ? [heart, moneyPct] : [heart, tasks, moneyPct];
  const ready = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
  const now = steps.findIndex((x) => !x.ok);
  return { mode, steps, now, heart, tasks, money: moneyPct, ready };
}

/** The readiness number everywhere outside the umrah screen: Goals, Practice. */
export const umrahReady = (s: AppState) => uOf(s).ready ?? pctOf(uOf(s).prep.filter((id) => PREP.some((p) => p.id === id)).length, PREP.length);
