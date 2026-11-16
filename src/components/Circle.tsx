import type { CircleApi, Member } from '../circle';
import { plural } from '../dates';
import type { UmrahApi } from '../umrahCircle';
import { UmrahTrips } from './UmrahTrips';
import type { KhatmApi } from '../khatm';
import { KhatmSection } from './Khatm';
import type { IftarApi } from '../iftar';
import { IftarSection } from './Iftar';

interface Props {
  circle: CircleApi;
  joined: boolean;
  today: string;
  summary: Omit<Member, 'id' | 'updated'>;
  onJoin: () => void;
  onLeave: () => void;
  umrah: UmrahApi;
  myReady: number;
  khatm: KhatmApi;
  iftar: IftarApi;
}

const REACTIONS = [
  { e: '🤲', label: 'Дуа за тебя' },
  { e: '✨', label: 'МашаАллах' },
];

export function Circle({ circle, joined, today, summary, onJoin, onLeave, umrah, myReady, khatm, iftar }: Props) {
  const { status, me, members, reacts, names, isOwner } = circle;

  if (status === 'loading')
    return <div className="page"><h1 className="page-h">Круг</h1><p className="page-sub">Подключаюсь…</p></div>;

  if (status === 'off')
    return (
      <div className="page">
        <h1 className="page-h">Круг</h1>
        <p className="page-sub">Круг работает, когда приложение открыто по ссылке claude.ai и ты вошёл в аккаунт. В этом окне он недоступен, остальные разделы работают как обычно.</p>
      </div>
    );

  const sorted = [...members].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : (b.day === today ? 1 : 0) - (a.day === today ? 1 : 0)));
  const activeToday = members.filter((m) => m.day === today && (m.done > 0 || m.prayers > 0)).length;
  const received = (to: string) => {
    const out: Record<string, number> = {};
    for (const [from, map] of Object.entries(reacts)) {
      if (from === to) continue;
      const r = map?.[to];
      if (r && r.day === today) out[r.e] = (out[r.e] ?? 0) + 1;
    }
    return out;
  };

  return (
    <div className="page">
      <h1 className="page-h">Круг</h1>
      <p className="page-sub">Близкие люди, которые держат друг друга в постоянстве. Друзья видят только итог дня, без названий привычек.</p>

      {circle.error && <div className="warn">{circle.error}</div>}
      {circle.stale && <p className="tiny">Данные круга пока не загрузились, могут быть устаревшими.</p>}

      {!joined ? (
        <div className="join">
          <b>Присоединиться к кругу</b>
          <p>Остальные увидят: сколько привычек и намазов ты отметил сегодня. Названия привычек, заметки и мухасаба остаются только у тебя.</p>
          <button type="button" className="pri-btn big-btn" onClick={onJoin}>Присоединиться</button>
        </div>
      ) : (
        <div className="stat-card">
          <div className="big">{activeToday}</div>
          <div>
            <b>{plural(activeToday, 'человек', 'человека', 'человек')} из {members.length} сегодня в деле</b>
            <small>твой итог обновляется сам, когда ты отмечаешь</small>
          </div>
        </div>
      )}

      <h2 className="sub-h">Участники <small>{members.length}</small></h2>
      {members.length === 0 && <p className="tiny">Пока никого. Присоединись первым и пригласи близких.</p>}
      <div className="members">
        {sorted.map((m) => {
          const p = names[m.id];
          const isMe = m.id === me;
          const fresh = m.day === today;
          const got = received(m.id);
          const mine = me ? reacts[me]?.[m.id] : undefined;
          return (
            <div className="member" key={m.id}>
              {p?.avatarUrl ? <img className="ava" src={p.avatarUrl} alt="" /> : <span className="ava" style={{ background: p?.color }} />}
              <div className="m-x">
                <b>{isMe ? `${p?.name || 'Ты'} (ты)` : p?.name || 'Участник'}</b>
                <small>
                  {fresh ? `Привычки ${m.done}/${m.total} · Намазы ${m.prayers}/5${m.fast ? ' · постится ✓' : ''}` : 'Сегодня ещё не отмечался'}
                </small>
                {(m.goals ?? []).map((g) => <span key={g.t} className="m-goal">🎯 {g.t} · {g.p}%</span>)}
                {fresh && m.total > 0 && <span className="m-bar"><i style={{ width: `${(m.done / m.total) * 100}%` }} /></span>}
                {Object.keys(got).length > 0 && (
                  <span className="m-got">{Object.entries(got).map(([e, n]) => `${e} ${n}`).join('  ')}</span>
                )}
              </div>
              {!isMe && joined && (
                <div className="m-react">
                  {REACTIONS.map((r) => (
                    <button key={r.e} type="button" aria-label={r.label} title={r.label} aria-pressed={mine?.e === r.e && mine.day === today} onClick={() => circle.react(m.id, r.e, today)}>
                      {r.e}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <IftarSection api={iftar} today={today} nameOf={(id) => names[id]?.name || iftar.names[id] || 'Участник'} />
      <KhatmSection api={khatm} today={today} nameOf={(id) => names[id]?.name || khatm.names[id] || umrah.names[id] || 'Участник'} />
      <UmrahTrips api={umrah} myReady={myReady} nameOf={(id) => names[id]?.name || umrah.names[id] || khatm.names[id] || 'Участник'} />

      <p className="tiny">🤲 — «сделал за тебя дуа», ✨ — «машаАллах». Лайков и счётчиков подписчиков нет: круг для поддержки, не для показа.</p>

      {isOwner && (
        <div className="invite">
          <b>Как пригласить</b>
          <p>Открой меню «Поделиться» у этой страницы на claude.ai и добавь человека с уровнем «Участник» (Contributor). Он откроет ту же ссылку, нажмёт «Присоединиться», и вы увидите друг друга.</p>
        </div>
      )}

      {joined && (
        <button type="button" className="danger" onClick={onLeave}>Выйти из круга</button>
      )}
      <p className="tiny ver">Твой итог сейчас: привычки {summary.done}/{summary.total}, намазы {summary.prayers}/5</p>
    </div>
  );
}
