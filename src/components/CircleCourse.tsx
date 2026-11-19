import type { Member } from '../circle';
import { courseOfCircle, type CCourse } from '../courseSocial';
import { fromKey, plural } from '../dates';
import { _t, _tj, LOC } from '../i18n';

const dayLabel = (d: string) => fromKey(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long' });

/** The circle's course of the week: who is on which lesson. Notes and test scores are never shared. */
export function CircleCourse({ members, me, today, isOwner, nameOf, onOpen, onCheer, onEnd }: {
  members: Member[]; me: string; today: string; isOwner: boolean;
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
  onCheer: (text: string) => void;
  onEnd: (c: CCourse) => void;
}) {
  const c = courseOfCircle(members, today);
  if (!c) return null;
  const rows = members.map((m) => {
    const p = m.cp?.id === c.id ? m.cp : null;
    return { m, d: p ? Math.min(c.n, p.d) : 0, ok: p?.ok ?? '' };
  }).sort((a, b) => (a.ok && b.ok ? (a.ok < b.ok ? -1 : 1) : a.ok ? -1 : b.ok ? 1 : b.d - a.d));
  const mine = rows.find((r) => r.m.id === me);
  const first = rows.find((r) => r.ok);
  const doneN = rows.filter((r) => r.ok).length;
  const over = Boolean(c.until && c.until < today);
  const myBtn = mine?.ok ? _t("Мой сертификат") : mine && mine.d > 0 ? _t("Мой урок {0}", Math.min(c.n, mine.d + 1)) : _t("Начать курс");
  const end = () => { if (confirm(_t("Закончить курс недели «{0}» для всего круга?", c.title))) onEnd({ id: '', title: '', n: 0, until: '', at: new Date().toISOString() }); };

  return (
    <div className="wc-card">
      <small className="wc-k">{c.until ? (over ? _t("Курс недели · срок был до {0}", dayLabel(c.until)) : _t("Курс недели · до {0}", dayLabel(c.until))) : _t("Курс недели · без срока")}</small>
      <b className="wc-t">{c.title}</b>
      <small className="wc-sub">{_tj("{0} {1} · предложил {2}", c.n, plural(c.n, _t("урок"), _t("урока"), _t("уроков")), c.by === me ? _t("ты") : nameOf(c.by))}</small>
      <div className="wc-rows">
        {rows.map(({ m, d, ok }) => (
          <div key={m.id} className={`wc-row${!d && !ok ? ' none' : ''}`}>
            <div className="wc-who">
              <b>{nameOf(m.id)}{m.bd && <span className="wc-bd">{m.bd.ic} {m.bd.t}</span>}</b>
              <span className={ok ? 'ok' : ''}>{ok ? _t("прошёл курс") : d ? _t("урок {0} из {1}", d, c.n) : _t("ещё не начал")}</span>
            </div>
            {(d > 0 || ok) && <div className="wc-bar"><i style={{ width: `${ok ? 100 : Math.round((d / c.n) * 100)}%` }} /></div>}
          </div>
        ))}
      </div>
      <div className="wc-btns">
        <button type="button" className="pri-btn" onClick={() => onOpen(c.id)}>{myBtn}</button>
        {members.length > 1 && <button type="button" className="ghost-btn" onClick={() => onCheer(_t("Как идёт курс «{0}»? Давайте сегодня по одному уроку, ин шаа Аллах.", c.title))}>{_t("Подбодрить")}</button>}
      </div>
      {first && <p className="wc-first">{first.m.id === me ? _t("Ты первым прошёл курс. Машаллах!") : _t("{0} первым прошёл курс. Машаллах!", nameOf(first.m.id))}{doneN > 1 ? _t(" Всего прошли: {0}.", doneN) : ''}</p>}
      <small className="wc-priv">{_t("Видно только, кто на каком уроке. Заметки и баллы тестов остаются у каждого свои.")}</small>
      {(c.by === me || isOwner) && <button type="button" className="link-btn wc-end" onClick={end}>{_t("Закончить курс недели")}</button>}
    </div>
  );
}

/** One line for the Friday summary. */
export function courseLine(members: Member[], today: string): string {
  const c = courseOfCircle(members, today);
  if (!c) return '';
  let ok = 0, going = 0;
  for (const m of members) { if (m.cp?.id !== c.id) continue; if (m.cp.ok) ok++; else if (m.cp.d > 0) going++; }
  if (!ok && !going) return '';
  return _t("📚 Курс «{0}»: прошли {1} из {2}, в процессе {3}", c.title, ok, members.length, going);
}
