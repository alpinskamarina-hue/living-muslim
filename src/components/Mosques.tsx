import { useEffect, useMemo, useState } from 'react';
import type { Anchor, AppState } from '../types';
import { ANCHORS, ANCHOR_LABEL } from '../types';
import { hhmm } from '../dates';
import { here } from '../safar';
import { qibla as qiblaDeg } from '../safar';
import { Qibla } from './Safar';
import {
  type CardInfo, type MyMosque, type Near, type Pos, FRIDAY_SUNNAH,
  cachedNear, distLabel, findMosques, hideCard, lastPos, locate, mapsSearchUrl, mosq, mosqueCard,
  mosqueName, routeUrl, setMine, sortNear, toggleFriday, wayLabel,
} from '../mosques';
import { _t, _tj } from '../i18n';

type Update = (fn: (s: AppState) => AppState) => void;
export type QiblaTab = 'qibla' | 'mosques';

const Dome = ({ c = 'currentColor' }: { c?: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V11a8 8 0 0116 0v10" /><path d="M12 3V1M2 21h20M9 21v-5a3 3 0 016 0v5" />
  </svg>
);

/** The small «Кибла 118°» chip in the Today header. */
export function QiblaChip({ state, today, onOpen }: { state: AppState; today: string; onOpen: () => void }) {
  const h = here(state, today);
  const deg = Math.round(qiblaDeg(h.lat, h.lng));
  return (
    <button type="button" className="safar-chip qibla-chip" onClick={onOpen} aria-label={_t("Кибла {0}°. Открыть компас и мечети рядом", deg)}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${deg}deg)` }}>
        <path d="M12 3v18M12 3l-5 6M12 3l5 6" />
      </svg>
      {_t("Кибла {0}°", deg)}
    </button>
  );
}

/** Keeps the position fresh without ever asking: only when the person already allowed location. */
function usePos(auto: boolean) {
  const [pos, setPos] = useState<Pos | null>(() => lastPos());
  useEffect(() => {
    if (!auto) return;
    const p = lastPos();
    if (p && Date.now() - p.at < 20 * 60000) return;
    let off = false;
    locate(true).then(async (np) => {
      if (off || !np) return;
      setPos(np);
      // Search again only for people who searched before, and only when they moved to another area.
      if (!cachedNear(np)) { try { await findMosques(np); if (!off) setPos({ ...np }); } catch { /* offline */ } }
    });
    return () => { off = true; };
  }, [auto]);
  return [pos, setPos] as const;
}

/** The card on Today before a prayer and on Friday before Jumu'ah. */
export function MosqueCard({ state, update, today, now, times, next, onOpen }: {
  state: AppState; update: Update; today: string; now: Date; times: Record<Anchor | 'sunrise', Date>; next: Anchor | null;
  onOpen: (tab: QiblaTab) => void;
}) {
  const ms = mosq(state);
  const used = Boolean(ms.mine) || lastPos() !== null;
  const [kept] = usePos(used && ms.card !== false);
  // The mosques screen may have saved a newer position meanwhile.
  const pos = lastPos() ?? kept;
  const [hidden, setHidden] = useState('');
  const c: CardInfo | null = mosqueCard(state, today, now, times, next, pos);
  if (!c || hidden === c.key) return null;
  const fri = c.kind === 'jumuah';
  const ticks = ms.friday?.[today] ?? [];
  const head = fri
    ? (c.typed ? _t("Джума · хутба в {0}", hhmm(c.at)) : _t("Джума сегодня · Зухр в {0}", hhmm(c.at)))
    : _t("{0} в {1} · рядом", ANCHOR_LABEL[c.anchor].ru, hhmm(c.at));
  const SUN: Record<string, string> = { ghusl: _t("Гусль"), kahf: _t("Сура «Аль-Кахф»"), salawat: _t("Салават на Пророка ﷺ") };
  return (
    <div className={`mq-card${fri ? ' fri' : ''}`}>
      <div className="mq-head">
        <span className="mq-ico"><Dome /></span>
        <span className="mq-txt">
          <small>{head}{c.mine ? _t(" · моя мечеть") : ''}</small>
          <b>{c.mosque ? mosqueName(c.mosque) : _t("Где совершить Джума?")}</b>
          {c.mosque && c.km !== null && <span>{distLabel(c.km)} · {wayLabel(c.km)}</span>}
          {!c.mosque && <span>{_t("Найди мечеть рядом и отметь свою: впишешь время хутбы.")}</span>}
        </span>
        <button type="button" className="mq-x" aria-label={_t("Скрыть до следующего намаза")} onClick={() => { hideCard(c.key); setHidden(c.key); }}>✕</button>
      </div>
      {c.leave && c.leave > now && <p className="mq-leave">{_t("Выйти в {0}, чтобы успеть{1}", hhmm(c.leave), fri && c.typed ? _t(" к началу хутбы") : '')}</p>}
      <div className="mq-btns">
        {c.mosque
          ? <a className="mq-go" href={routeUrl(c.mosque, c.km ?? undefined)} target="_blank" rel="noopener noreferrer">{_t("Маршрут")}</a>
          : <button type="button" className="mq-go" onClick={() => onOpen('mosques')}>{_t("Найти мечеть")}</button>}
        <button type="button" className="mq-more" onClick={() => onOpen(c.mosque ? 'mosques' : 'qibla')}>{c.mosque ? _t("Другие рядом") : _t("Кибла")}</button>
      </div>
      {fri && (
        <div className="mq-sunnah" role="group" aria-label={_t("Сунна пятницы")}>
          {FRIDAY_SUNNAH.map((k) => (
            <button key={k} type="button" aria-pressed={ticks.includes(k)} onClick={() => update((s) => toggleFriday(s, today, k))}>
              {ticks.includes(k) ? '✓ ' : ''}{SUN[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full screen: compass and mosques nearby. */
export function QiblaScreen({ state, update, today, start, onClose }: { state: AppState; update: Update; today: string; start: QiblaTab; onClose: () => void }) {
  const [tab, setTab] = useState<QiblaTab>(start);
  const h = here(state, today);
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("Закрыть")}>✕</button>
        <div><b>{tab === 'qibla' ? _t("Кибла") : _t("Мечети рядом")}</b><small>{tab === 'qibla' ? h.place : _t("В радиусе 3 км · данные OpenStreetMap")}</small></div>
      </div>
      <div className="seg">
        {([['qibla', _t("Кибла")], ['mosques', _t("Мечети рядом")]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="h-wrap">
        {tab === 'qibla' ? <Qibla lat={h.lat} lng={h.lng} place={h.place} /> : <Mosques state={state} update={update} today={today} />}
      </div>
    </div>
  );
}

type Status = 'idle' | 'locating' | 'loading' | 'ready' | 'denied' | 'error';

function Mosques({ state, update, today }: { state: AppState; update: Update; today: string }) {
  const ms = mosq(state);
  const mine = ms.mine ?? null;
  const [pos, setPos] = useState<Pos | null>(() => { const p = lastPos(); return p && Date.now() - p.at < 6 * 3600e3 ? p : null; });
  const [list, setList] = useState<Near[] | null>(() => (pos ? (() => { const c = cachedNear(pos); return c ? sortNear(c, pos) : null; })() : null));
  const [status, setStatus] = useState<Status>(list ? 'ready' : 'idle');
  const [edit, setEdit] = useState(false);
  const [manual, setManual] = useState(false);
  const [city, setCity] = useState(false);

  const search = async (p: { lat: number; lng: number }, fresh = false) => {
    setStatus('loading');
    try {
      const l = await findMosques(p, fresh);
      setList(sortNear(l, p));
      setStatus('ready');
    } catch { setStatus('error'); }
  };
  const go = async (fresh = false) => {
    setStatus('locating');
    const p = await locate(false);
    if (!p) { setStatus('denied'); return; }
    setCity(false);
    setPos(p);
    await search(p, fresh);
  };
  const byCity = async () => {
    const h = here(state, today);
    const p = { lat: h.lat, lng: h.lng, at: Date.now() };
    setCity(true);
    setPos(p);
    await search(p);
  };
  // Location already allowed: search straight away, no extra tap.
  useEffect(() => { if (status === 'idle') locate(true).then((p) => { if (p) { setPos(p); search(p); } }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = ({ km: _km, ...m }: Near) => update((s) => setMine(s, { ...m, jumuah: mine?.id === m.id ? mine.jumuah : undefined, jamaat: mine?.id === m.id ? mine.jamaat : undefined }));
  const mineKm = mine && pos ? sortNear([mine], pos, 1e6)[0].km : null;
  const others = (list ?? []).filter((m) => m.id !== mine?.id);

  return (
    <>
      {mine && (
        <div className="h-card mq-mine">
          <div className="mq-head">
            <span className="mq-ico"><Dome /></span>
            <span className="mq-txt">
              <small>{_t("Моя мечеть")}</small>
              <b>{mosqueName(mine)}</b>
              <span>{[mine.addr, mineKm !== null ? `${distLabel(mineKm)} · ${wayLabel(mineKm)}` : ''].filter(Boolean).join(' · ')}</span>
              {(mine.jumuah || Object.keys(mine.jamaat ?? {}).length > 0) && (
                <span className="mq-times">
                  {mine.jumuah && _t("Хутба {0}", mine.jumuah)}
                  {ANCHORS.filter((a) => mine.jamaat?.[a]).map((a) => ` · ${ANCHOR_LABEL[a].ru} ${mine.jamaat![a]}`)}
                </span>
              )}
            </span>
          </div>
          <div className="mq-btns">
            <a className="mq-go" href={routeUrl(mine, mineKm ?? undefined)} target="_blank" rel="noopener noreferrer">{_t("Маршрут")}</a>
            <button type="button" className="mq-more" aria-expanded={edit} onClick={() => setEdit(!edit)}>{_t("Время джамаата")}</button>
          </div>
          {edit && <Jamaat mine={mine} update={update} />}
        </div>
      )}

      {status !== 'ready' && (
        <div className="h-card mq-empty">
          {status === 'idle' && <>
            <p>{_t("Покажу мечети и молельные комнаты в радиусе 3 км, с расстоянием и маршрутом.")}</p>
            <button type="button" className="pri-btn" onClick={() => go()}>{_t("📍 Найти мечети рядом")}</button>
            <small>{_t("Место нужно только на телефоне. В поиск уходит точка, округлённая примерно до километра, у нас на сервере она не хранится.")}</small>
          </>}
          {status === 'locating' && <p>{_t("Определяю, где ты…")}</p>}
          {status === 'loading' && <p>{_t("Ищу мечети рядом…")}</p>}
          {status === 'denied' && <>
            <p>{_t("Не получилось узнать место. Можно разрешить геолокацию в настройках браузера или искать около центра города.")}</p>
            <button type="button" className="pri-btn" onClick={() => go()}>{_t("Попробовать ещё раз")}</button>
            <button type="button" className="link-btn left" onClick={byCity}>{_tj("Искать около центра: {0}", here(state, today).place)}</button>
          </>}
          {status === 'error' && <>
            <p>{_t("Сервис карт сейчас не отвечает. Попробуй через минуту или открой поиск в Google Картах.")}</p>
            <button type="button" className="pri-btn" onClick={() => (pos ? search(pos, true) : go(true))}>{_t("Попробовать ещё раз")}</button>
          </>}
        </div>
      )}

      {status === 'ready' && pos && list && (
        <>
          <Radar list={list} pos={pos} mineId={mine?.id} />
          {city && <p className="q-msg left">{_tj("Расстояние от центра: {0}. Для точного разреши геолокацию.", here(state, today).place)}</p>}
          {!mine && list.length > 0 && <p className="q-msg left">{_t("Отметь свою мечеть звёздочкой: она будет первой, и можно вписать время джамаата и хутбы.")}</p>}
          {list.length === 0 && <p className="q-msg left">{_t("В радиусе 3 км мечетей на карте нет. Попробуй поиск в Google Картах или добавь свою вручную.")}</p>}
          {others.length > 0 && (
            <div className="h-card mq-list">
              {others.map((m) => {
                const n = list.indexOf(m) + 1;
                return (
                  <div key={m.id} className="mq-row">
                    <span className={`mq-n${m.kind === 'musalla' ? ' small' : ''}`}>{n}</span>
                    <span className="mq-txt">
                      <b>{mosqueName(m)}</b>
                      <small>{[distLabel(m.km), wayLabel(m.km), m.kind === 'musalla' ? _t("молельная комната") : '', m.addr].filter(Boolean).join(' · ')}</small>
                    </span>
                    <a className="mq-route" href={routeUrl(m, m.km)} target="_blank" rel="noopener noreferrer" aria-label={_tj("Маршрут: {0}", mosqueName(m))}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z" /></svg>
                    </a>
                    <button type="button" className="mq-star" onClick={() => choose(m)} aria-label={_tj("Сделать моей мечетью: {0}", mosqueName(m))}>☆</button>
                  </div>
                );
              })}
            </div>
          )}
          <button type="button" className="link-btn left" onClick={() => go(true)}>{_t("↻ Обновить по моему месту")}</button>
        </>
      )}

      {pos && !manual && <button type="button" className="link-btn left" onClick={() => setManual(true)}>{_t("+ Моей мечети нет в списке")}</button>}
      {manual && pos && <Manual pos={pos} onSave={(m) => { update((s) => setMine(s, m)); setManual(false); }} onCancel={() => setManual(false)} />}

      <a className="link-btn left" href={mapsSearchUrl()} target="_blank" rel="noopener noreferrer">{_t("Открыть поиск мечетей в Google Картах")}</a>

      <label className="chk">
        <input type="checkbox" checked={ms.card !== false} onChange={(e) => update((s) => ({ ...s, mosque: { ...mosq(s), card: e.target.checked } }))} />
        <span><b>{_t("Мечеть на «Сегодня»")}</b><small>{_t("За 40 минут до намаза, если мечеть ближе 2 км, и в пятницу перед Джума")}</small></span>
      </label>
      {mine && <button type="button" className="link-btn left" onClick={() => update((s) => setMine(s, null))}>{_t("Убрать «мою мечеть»")}</button>}
      <p className="q-msg left tiny-note">{_t("Данные © участники OpenStreetMap. Время намаза в мечети может отличаться от расчётного: уточни у имама и впиши его сюда.")}</p>
    </>
  );
}

function Jamaat({ mine, update }: { mine: MyMosque; update: Update }) {
  const patch = (p: Partial<MyMosque>) => update((s) => { const m = mosq(s).mine; return m ? setMine(s, { ...m, ...p }) : s; });
  const setJ = (a: Anchor, v: string) => {
    const j = { ...(mine.jamaat ?? {}) };
    if (v) j[a] = v; else delete j[a];
    patch({ jamaat: j });
  };
  return (
    <div className="mq-jamaat">
      <label className="field"><span>{_t("Хутба в пятницу")}</span><input type="time" value={mine.jumuah ?? ''} onChange={(e) => patch({ jumuah: e.target.value || undefined })} /></label>
      <small>{_t("Джамаат в мечети (если не совпадает с расчётным временем):")}</small>
      <div className="mq-jgrid">
        {ANCHORS.map((a) => (
          <label key={a} className="field"><span>{ANCHOR_LABEL[a].ru}</span><input type="time" value={mine.jamaat?.[a] ?? ''} onChange={(e) => setJ(a, e.target.value)} /></label>
        ))}
      </div>
    </div>
  );
}

function Manual({ pos, onSave, onCancel }: { pos: Pos; onSave: (m: MyMosque) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  return (
    <div className="h-card mq-manual">
      <p>{_t("Встань рядом с мечетью или внутри и впиши название. Её место сохранится по твоей геолокации.")}</p>
      <label className="field"><span>{_t("Название")}</span><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={_t("Например, мечеть Ас-Салям")} /></label>
      <div className="mq-btns">
        <button type="button" className="mq-go" disabled={!name.trim()} onClick={() => onSave({ id: `own/${Date.now()}`, name: name.trim(), lat: pos.lat, lng: pos.lng, kind: 'mosque' })}>{_t("Сохранить, я рядом с ней")}</button>
        <button type="button" className="mq-more" onClick={onCancel}>{_t("Отмена")}</button>
      </div>
    </div>
  );
}

/** A plain schematic: you in the middle, rings at 1, 2 and 3 km, mosques as numbered dots. No map tiles. */
function Radar({ list, pos, mineId }: { list: Near[]; pos: Pos; mineId?: string }) {
  // Hundredths of a kilometre, so the text sizes stay sane for every browser.
  const R = 320;
  const pts = useMemo(() => list.map((m, i) => {
    const x = (m.lng - pos.lng) * 11132 * Math.cos((pos.lat * Math.PI) / 180);
    const y = -(m.lat - pos.lat) * 11057;
    return { m, i, x, y };
  }), [list, pos]);
  return (
    <div className="mq-radar" aria-hidden="true">
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}>
        {[100, 200, 300].map((r) => <circle key={r} cx="0" cy="0" r={r} className="ring" />)}
        <text x="0" y={-R + 28} className="n">{_t("С")}</text>
        {[1, 2, 3].map((r) => <text key={r} x={r * 71 + 5} y={-r * 71 - 5} className="km">{_t("{0} км", r)}</text>)}
        {pts.slice().reverse().map(({ m, i, x, y }) => (
          <g key={m.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className={m.id === mineId ? 'mine' : i < 9 ? 'top' : 'rest'}>
            <circle r={m.id === mineId ? 20 : i < 9 ? 16 : 7} />
            {(i < 9 || m.id === mineId) && <text y="6">{m.id === mineId ? '★' : i + 1}</text>}
          </g>
        ))}
        <circle cx="0" cy="0" r="13" className="me" />
      </svg>
    </div>
  );
}
