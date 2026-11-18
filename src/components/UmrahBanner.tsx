import { useState } from 'react';
import type { UmrahApi, UStatus } from '../umrahCircle';
import type { CircleApi } from '../circle';
import type { HubTab } from './UmrahHub';
import { plural } from '../dates';
import { _t, _tj } from '../i18n';

// The call to umrah in the middle of the Circle. It changes by itself: no trip yet, someone is gathering one,
// I am going, the brothers are there now, the brothers are back.

const KEY = 'lm.umBanner';
const day = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const diff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Months to Ramadan by the Umm al-Qura calendar (0 while it is Ramadan), or null if the browser can't tell. */
function toRamadan(today: string): number | null {
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric' });
    const m = Number(f.formatToParts(new Date(today)).find((p) => p.type === 'month')?.value);
    if (!m) return null;
    return (9 - m + 12) % 12;
  } catch { return null; }
}

export function UmrahBanner({ api, names, today, family, myReady, unread, onOpen, onEvent }: {
  api: UmrahApi; names: CircleApi['names']; today: string; family: boolean; myReady: number; unread: (host: string) => number;
  onOpen: (tab: HubTab) => void; onEvent: (host: string, text: string) => void;
}) {
  const [hidden, setHidden] = useState(() => { try { return (localStorage.getItem(KEY) || '') > today; } catch { return false; } });
  const [ask, setAsk] = useState('');
  const [sent, setSent] = useState(false);
  const { me, trips, rsvp } = api;
  if (!me) return null;
  const nm = (id: string) => names[id]?.name || api.names[id] || _t("Участник");
  const st = (id: string, h: string) => rsvp[id]?.[h]?.s;
  const goingOf = (h: string) => [...new Set([h, ...Object.keys(rsvp).filter((id) => st(id, h) === 'go')])].filter((id) => id === h ? st(h, h) !== 'no' && st(h, h) !== 'maybe' : true);
  const datesOf = (h: string) => trips[h]?.dates?.find((d) => d.id === trips[h].chosen);
  const hosts = Object.keys(trips).sort((a, b) => (trips[b].created ?? '').localeCompare(trips[a].created ?? ''));
  const hide = () => { try { localStorage.setItem(KEY, day(today, 30)); } catch { /* */ } setHidden(true); };
  const faces = (ids: string[]) => (
    <span className="ub-faces">
      {ids.slice(0, 5).map((id) => { const p = names[id]; return p?.avatarUrl ? <img key={id} src={p.avatarUrl} alt="" /> : <i key={id} style={{ background: p?.color || '#d9ad55' }}>{nm(id).slice(0, 1).toUpperCase()}</i>; })}
      {ids.length > 5 && <i className="more">+{ids.length - 5}</i>}
    </span>
  );

  // 4 and 3: a trip whose dates are today. Those who stayed ask for dua; those there open the rite.
  const now = hosts.find((h) => { const d = datesOf(h); return d && d.from <= today && today <= d.to; });
  if (now) {
    const there = goingOf(now);
    if (there.includes(me)) {
      return (
        <button type="button" className="ub ub-go" onClick={() => onOpen('rites')}>
          <em>{_t("Умра · ты на месте")}</em><b>{_t("Ляббайк, Аллахумма ляббайк")}</b>
          <small>{_t("Открыть обряд, группу и «Я потерялся» ›")}</small>
        </button>
      );
    }
    const mine = api.duas[me]?.[now] ?? [];
    return (
      <div className="ub">
        <em>{_t("Умра · братья на месте")}</em>
        <b>{_tj("{0} сейчас в Мекке", there.map(nm).join(', '))}</b>
        {faces(there)}
        <p>{_t("Попроси дуа у Каабы: паломники увидят твою просьбу там.")}</p>
        {sent || mine.length ? <small className="ub-ok">{_tj("🤲 Твоих просьб: {0}. Они увидят их у Каабы", mine.length)}</small> : null}
        <div className="ub-ask">
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={_t("Сделайте дуа за…")} maxLength={200} />
          <button type="button" disabled={!ask.trim()} onClick={() => { api.setDuas(now, [...mine, ask.trim()]); setAsk(''); setSent(true); }}>{_t("Попросить")}</button>
        </div>
      </div>
    );
  }

  // 5: back within two weeks.
  const back = hosts.find((h) => { const d = datesOf(h); return d && d.to < today && diff(d.to, today) <= 14; });
  if (back) {
    const was = goingOf(back);
    return (
      <button type="button" className="ub" onClick={() => onOpen(was.includes(me) ? 'now' : 'trip')}>
        <em>{_t("Умра")}</em><b>{_t("Братья вернулись. Да примет Аллах")}</b>{faces(was)}
        <small>{was.includes(me) ? _t("Сохрани умру: картинка и 40 дней ›") : _t("Поздравь их в чате и спроси, как это было ›")}</small>
      </button>
    );
  }

  // 3: I am going.
  const mineH = hosts.find((h) => st(me, h) === 'go' || (h === me && st(me, h) !== 'no'));
  if (mineH) {
    const t = trips[mineH]; const d = datesOf(mineH); const g = goingOf(mineH);
    const ready = g.length ? Math.round(g.reduce((n, id) => n + (rsvp[id]?.[mineH]?.ready ?? 0), 0) / g.length) : 0;
    const left = d ? diff(today, d.from) : null;
    const un = unread(mineH);
    return (
      <button type="button" className="ub ub-go" onClick={() => onOpen('trip')}>
        <em>{_t("Умра · ты едешь")}</em>
        <b>{t.title}</b>
        {faces(g)}
        <small>{[left !== null && left > 0 ? _tj("до вылета {0} {1}", left, plural(left, _t("день"), _t("дня"), _t("дней"))) : _t("даты ещё не выбраны"), _tj("готовность группы {0}%", ready), un ? _tj("{0} новых в чате", un) : ''].filter(Boolean).join(' · ')} ›</small>
      </button>
    );
  }

  if (hidden) return null;

  // 2: someone is gathering a trip and I have not said «go».
  const open = hosts.find((h) => st(me, h) !== 'no');
  if (open) {
    const t = trips[open]; const g = goingOf(open);
    const answer = (s: UStatus) => { api.respond(open, { s, ready: myReady }); onEvent(open, s === 'go' ? _t("едет") : _t("пока думает")); if (s === 'go') onOpen('trip'); };
    return (
      <div className="ub">
        <button type="button" className="ub-x" onClick={hide} aria-label={_t("Скрыть на месяц")}>✕</button>
        <em>{_t("Умра")}</em>
        <b>{_tj("{0} собирает умру", nm(open))}</b>
        <p>{_tj("«{0}» · {1}{2} · едут {3}", t.title, t.month, t.city ? _t(" · из {0}", t.city) : '', g.length)}</p>
        {faces(g)}
        <div className="ub-btns">
          <button type="button" className="go" onClick={() => answer('go')}>{_t("Еду")}</button>
          <button type="button" aria-pressed={st(me, open) === 'maybe'} onClick={() => answer('maybe')}>{_t("Думаю")}</button>
          <button type="button" onClick={() => onOpen('trip')}>{_t("Открыть")}</button>
        </div>
      </div>
    );
  }

  // 1: no trip yet.
  const r = toRamadan(today);
  const line = r !== null && r <= 4 ? (r === 0 ? _t("Сейчас Рамадан. «Умра в Рамадан равна хаджу» (Бухари, Муслим)") : _tj("До Рамадана {0} {1}. «Умра в Рамадан равна хаджу» (Бухари, Муслим)", r, plural(r, _t("месяц"), _t("месяца"), _t("месяцев"))))
    : _t("Группой без агентства обычно дешевле пакета на 15–30%, и вы вместе с первого шага до Каабы.");
  return (
    <div className="ub">
      <button type="button" className="ub-x" onClick={hide} aria-label={_t("Скрыть на месяц")}>✕</button>
      <em>{_t("Умра")}</em>
      <b>{family ? _t("Умра всей семьёй") : _t("Поехать на умру вместе с братьями")}</b>
      <p>{line}</p>
      <div className="ub-btns">
        <button type="button" className="go" onClick={() => onOpen('trip')}>{_t("Собрать поездку")}</button>
        <button type="button" onClick={() => onOpen('now')}>{_t("Подробнее")}</button>
      </div>
    </div>
  );
}
