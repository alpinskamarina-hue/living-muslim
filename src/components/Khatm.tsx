import { useState } from 'react';
import type { KhatmApi } from '../khatm';
import { addDays, fromKey } from '../dates';
import { _t, _tj, LOC } from '../i18n';

const fmt = (k: string) => fromKey(k).toLocaleDateString(LOC, { day: 'numeric', month: 'long' });

export function KhatmSection({ api, nameOf, today }: { api: KhatmApi; nameOf: (id: string) => string; today: string }) {
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState(_t("Хатм всем Кругом"));
  const [due, setDue] = useState(addDays(today, 14));
  const [dedicate, setDedicate] = useState('');
  if (!api.ready) return null;
  const hosts = Object.keys(api.list).sort((a, b) => (api.list[b].created ?? '').localeCompare(api.list[a].created ?? ''));
  return (
    <section className="umrah-c">
      <h2 className="sub-h">{_t("Общий хатм")}</h2>
      {api.error && <div className="warn">{api.error}</div>}
      {hosts.length === 0 && !form && <p className="tiny">{_t("Прочитайте Коран целиком вместе: каждый берёт свободные джузы.")}</p>}
      {hosts.map((h) => <KhatmCard key={h} host={h} api={api} nameOf={nameOf} />)}
      {api.me && !api.list[api.me] && (form ? (
        <div className="join">
          <label className="field"><span>{_t("Название")}</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>{_t("До какого дня")}</span><input type="date" value={due} min={today} onChange={(e) => setDue(e.target.value)} /></label>
          <label className="field"><span>{_t("Награду дарим за… (необязательно)")}</span><input value={dedicate} onChange={(e) => setDedicate(e.target.value)} placeholder={_t("за родителей Юсуфа")} /></label>
          <div className="row2 light">
            <button type="button" onClick={() => setForm(false)}>{_t("Отмена")}</button>
            <button type="button" className="pri-btn" disabled={!title.trim()} onClick={() => { api.start({ title: title.trim(), due, dedicate: dedicate.trim() || undefined, created: new Date().toISOString() }); setForm(false); }}>{_t("Начать хатм")}</button>
          </div>
        </div>
      ) : <button type="button" className="pri-btn big-btn" onClick={() => setForm(true)}>{_t("📖 Начать общий хатм")}</button>)}
    </section>
  );
}

function KhatmCard({ host, api, nameOf }: { host: string; api: KhatmApi; nameOf: (id: string) => string }) {
  const k = api.list[host];
  const [open, setOpen] = useState(true);
  const owner: Record<number, string> = {};
  const done = new Set<number>();
  for (const [uid, m] of Object.entries(api.juz)) {
    const v = m?.[host];
    if (!v) continue;
    for (const j of v.taken ?? []) if (!owner[j]) owner[j] = uid;
    for (const j of v.done ?? []) { done.add(j); owner[j] = owner[j] ?? uid; }
  }
  const me = api.me!;
  const mine = api.juz[me]?.[host] ?? { taken: [], done: [] };
  const free = Array.from({ length: 30 }, (_, i) => i + 1).filter((j) => !owner[j]);
  const tap = (j: number) => {
    if (!owner[j]) api.setMine(host, { ...mine, taken: [...mine.taken, j] });
    else if (owner[j] === me) {
      if (!mine.done.includes(j)) api.setMine(host, { ...mine, done: [...mine.done, j] });
      else api.setMine(host, { taken: mine.taken.filter((x) => x !== j), done: mine.done.filter((x) => x !== j) });
    }
  };
  const people = Object.entries(api.juz).filter(([, m]) => m?.[host] && ((m[host].taken?.length ?? 0) > 0));
  return (
    <div className="trip">
      <button type="button" className="trip-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="trip-ic">📖</span>
        <span className="q-t">
          <b>{k.title}</b>
          <small>{_tj("до {0} · собирает {1}", fmt(k.due), host === me ? _t("ты") : nameOf(host))}</small>
          <small>{_tj("Прочитано {0} из 30 джузов", done.size)}</small>
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="trip-body">
          <div className="pbar"><i style={{ width: `${(done.size / 30) * 100}%` }} /></div>
          <div className="juz">
            {Array.from({ length: 30 }, (_, i) => i + 1).map((j) => (
              <button type="button" key={j} className={`${done.has(j) ? 'd' : owner[j] ? 'a' : ''}${owner[j] === me ? ' me' : ''}`}
                disabled={Boolean(owner[j] && owner[j] !== me)} onClick={() => tap(j)}
                aria-label={_t("Джуз {0}: {1}", j, done.has(j) ? _t("прочитан") : owner[j] ? _t("у {0}", nameOf(owner[j])) : _t("свободен"))}>{j}</button>
            ))}
          </div>
          <p className="tiny">{_t("Зелёные прочитаны, светлые разобраны, серые свободны. Твои обведены: касание по своему отмечает «прочитал», ещё раз возвращает джуз.")}</p>
          {people.map(([uid, m]) => (
            <div key={uid} className="tp2"><span>{nameOf(uid)}{uid === me ? _t(" (ты)") : ''}</span><small>{_tj("{0} ✓ · взято {1}", (m[host].done ?? []).length, (m[host].taken ?? []).length)}</small></div>
          ))}
          {free.length > 0 && <button type="button" className="pri-btn" onClick={() => tap(free[0])}>{_tj("Взять свободный джуз ({0})", free[0])}</button>}
          {k.dedicate && <p className="tiny">{_tj("Награду хатма дарим: {0}", k.dedicate)}</p>}
          {host === me && <button type="button" className="link-btn" onClick={() => api.remove()}>{_t("Завершить и убрать хатм")}</button>}
        </div>
      )}
    </div>
  );
}
