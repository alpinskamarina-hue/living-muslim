// «Место» in circle chats: the send sheet, the card in the chat and the map «Кто где сейчас».
import { useEffect, useMemo, useState } from 'react';
import type { Msg, MsgRef } from '../chat';
import { addressOf, fitZoom, here, km, livePt, mosqueNear, myLive, openAt, routeTo, startLive, stopLive, TILE, worldPx, type LivePt, type Pt } from '../location';
import { distLabel, lastPos, locate } from '../mosques';
import { _t, _tj } from '../i18n';

type Names = Record<string, { name: string } | undefined>;
export interface MapPin extends Pt { cls?: string; label?: string; dot?: boolean }

/** OpenStreetMap tiles around a centre, with pins. Width follows the container. */
export function TileMap({ pins, h, zoom, fit }: { pins: MapPin[]; h: number; zoom?: number; fit?: { w: number; h: number } }) {
  const pts = pins.length ? pins : [{ lat: 0, lng: 0 }];
  const z = zoom ?? (fit ? fitZoom(pts, fit.w, fit.h) : 16);
  const xs = pts.map((p) => worldPx(p, z));
  const c = { x: (Math.min(...xs.map((q) => q.x)) + Math.max(...xs.map((q) => q.x))) / 2, y: (Math.min(...xs.map((q) => q.y)) + Math.max(...xs.map((q) => q.y))) / 2 };
  const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE), n = 2 ** z;
  const tiles: { x: number; y: number }[] = [];
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const y = ty + dy; if (y >= 0 && y < n) tiles.push({ x: tx + dx, y }); }
  const at = (x: number, y: number) => ({ left: `calc(50% + ${Math.round(x - c.x)}px)`, top: `calc(50% + ${Math.round(y - c.y)}px)` });
  return (
    <div className="lc-map" style={{ height: h }}>
      {tiles.map((t) => <img key={`${t.x}/${t.y}`} alt="" draggable={false} loading="lazy" src={`https://tile.openstreetmap.org/${z}/${((t.x % n) + n) % n}/${t.y}.png`} style={at(t.x * TILE, t.y * TILE)} />)}
      {pins.map((p, i) => {
        const q = worldPx(p, z);
        return p.dot ? <i key={i} className="lc-me" style={at(q.x, q.y)} />
          : <span key={i} className={`lc-pin ${p.cls ?? ''}`} style={at(q.x, q.y)}><i />{p.label && <b>{p.label}</b>}</span>;
      })}
      <small className="lc-osm">© OpenStreetMap</small>
    </div>
  );
}

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? _tj("обновлено {0} сек назад", Math.max(5, Math.round(s / 5) * 5)) : _tj("обновлено {0} мин назад", Math.round(s / 60));
};
const left = (until: number) => { const m = Math.max(1, Math.round((until - Date.now()) / 60000)); return m >= 60 ? (m % 60 ? _tj("ещё {0} ч {1} мин", Math.floor(m / 60), m % 60) : _tj("ещё {0} ч", m / 60)) : _tj("ещё {0} мин", m); };

/** The card inside a chat bubble. */
export function LocCard({ m, mine, live, onMap }: { m: Msg; mine: boolean; live: LivePt[]; onMap: () => void }) {
  const r = m.ref as MsgRef;
  const pt = { lat: Number(r.la), lng: Number(r.lo) };
  const lv = r.lv ? new Date(r.lv).getTime() : 0;
  const cur = lv ? live.find((l) => l.uid === m.uid) : undefined;
  const on = Boolean(cur && new Date(cur.until).getTime() > Date.now());
  const p = on && cur ? { lat: cur.lat, lng: cur.lng } : pt;
  const me = lastPos();
  if (!Number.isFinite(pt.lat) || !Number.isFinite(pt.lng)) return <span className="cc-t">{m.body}</span>;
  return (
    <div className={`lc-card${lv ? ' live' : ''}`}>
      <a href={openAt(p)} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (lv && on) { e.preventDefault(); onMap(); } }}>
        <TileMap pins={[{ ...p, cls: lv ? 't' : '' }]} h={lv ? 120 : 140} zoom={16} />
      </a>
      {lv ? (
        on && cur ? <>
          <span className="lc-live"><i />{mine ? _tj("Ты делишься местом · {0}", left(new Date(cur.until).getTime())) : _tj("Делится местом · {0}", left(new Date(cur.until).getTime()))}</span>
          <small className="lc-sub">{ago(cur.upd)}{!mine && me ? ` · ${_tj("{0} от тебя", distLabel(km(me, p)))}` : ''}</small>
          <div className="lc-btns"><button type="button" onClick={onMap}>{_t("Смотреть на карте")}</button></div>
        </> : <>
          <span className="lc-sub">{_t("Делился местом · время вышло")}</span>
          <div className="lc-btns"><a href={routeTo(pt)} target="_blank" rel="noopener noreferrer">{_t("Последняя точка")}</a></div>
        </>
      ) : <>
        <b className="lc-addr">📍 {r.a || _t("Моё место")}</b>
        {r.m && <small className="lc-sub">🕌 {r.m}{typeof r.mk === 'number' ? ` · ${distLabel(r.mk)}` : ''}</small>}
        <div className="lc-btns">
          <a href={routeTo(pt)} target="_blank" rel="noopener noreferrer">{_t("Маршрут")}</a>
          <a href={openAt(pt)} target="_blank" rel="noopener noreferrer">{_t("Открыть")}</a>
        </div>
      </>}
    </div>
  );
}

type Send = (body: string, ref: MsgRef) => Promise<boolean>;

/** «Место» sheet: where I am, the nearest mosque, send one point or share live. */
export function LocSheet({ code, send, onClose, flash }: { code: string; send: Send; onClose: () => void; flash: (t: string) => void }) {
  const [p, setP] = useState<Pt | null>(null);
  const [err, setErr] = useState('');
  const [addr, setAddr] = useState('');
  const [mq, setMq] = useState<{ name: string; km: number; lat: number; lng: number } | null>(null);
  const [mins, setMins] = useState(15);
  const [busy, setBusy] = useState(false);
  const sharing = myLive(code);
  useEffect(() => {
    let alive = true;
    const quick = livePt();
    if (quick) { setP(quick); addressOf(quick).then((a) => alive && setAddr(a)); mosqueNear(quick).then((m) => alive && setMq(m)); return () => { alive = false; }; }
    here().then((r) => {
      if (!alive) return;
      if ('err' in r) { setErr(r.err === 'denied' ? _t("Разреши доступ к геолокации для этого сайта в настройках браузера и попробуй ещё раз") : _t("Не получилось определить место. Проверь, включена ли геолокация на телефоне")); return; }
      setP(r);
      addressOf(r).then((a) => alive && setAddr(a));
      mosqueNear(r).then((m) => alive && setMq(m));
    });
    return () => { alive = false; };
  }, []);
  const one = async () => {
    if (!p) return;
    setBusy(true);
    const ok = await send(`📍 ${addr || _t("Моё место")}`, { t: 'loc', la: p.lat, lo: p.lng, a: addr || undefined, m: mq?.name, mk: mq ? Math.round(mq.km * 100) / 100 : undefined });
    setBusy(false);
    if (ok) onClose();
  };
  const share = async () => {
    if (!p) return;
    setBusy(true);
    const until = await startLive(code, mins, p);
    const ok = await send(_t("📍 Делюсь местом"), { t: 'loc', la: p.lat, lo: p.lng, lv: new Date(until).toISOString() });
    setBusy(false);
    if (ok) { flash(_t("Место обновляется, пока приложение открыто")); onClose(); }
  };
  const pins: MapPin[] = p ? [{ ...p, dot: true }, ...(mq ? [{ lat: mq.lat, lng: mq.lng, cls: 'g', label: `🕌 ${distLabel(mq.km)}` }] : [])] : [];
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet lc-sheet" role="dialog" aria-label={_t("Место")}>
        <h3>{_t("Место")}</h3>
        {sharing ? <button type="button" className="lc-opt" disabled={busy} onClick={async () => { await stopLive(code); flash(_t("Ты больше не делишься местом")); onClose(); }}><i className="r">◉</i><span><b>{_t("Остановить моё место")}</b><small>{_tj("Ты делишься местом · {0}", left(sharing))}</small></span></button> : null}
        {err ? <p className="lc-err">{err}</p> : !p ? <p className="lc-sub">{_t("Ищу, где ты…")}</p> : <>
          <p className="lc-sub">{_t("Точность около 10 м")}{addr ? ` · ${addr}` : ''}</p>
          <TileMap pins={pins} h={180} fit={mq ? { w: 240, h: 100 } : undefined} zoom={mq ? undefined : 16} />
          {mq && <p className="lc-sub">🕌 {mq.name} · {distLabel(mq.km)}</p>}
          <button type="button" className="lc-opt pri" disabled={busy} onClick={one}><i>📍</i><span><b>{_t("Отправить моё место")}</b><small>{_t("Одна точка, ничего не обновляется")}</small></span></button>
          {sharing ? null : (
            <div className="lc-opt">
              <i className="r">◉</i>
              <span><b>{_t("Делиться местом")}</b><small>{_t("Точка обновляется, пока не истечёт время")}</small>
                <span className="lc-chips">{([[15, _t("15 мин")], [60, _t("1 час")], [480, _t("До встречи")]] as [number, string][]).map(([v, l]) => <button key={v} type="button" className={mins === v ? 'on' : ''} onClick={() => setMins(v)}>{l}</button>)}</span>
                <button type="button" className="pri-btn" disabled={busy} onClick={share}>{_t("Начать делиться")}</button>
              </span>
            </div>
          )}
        </>}
        <p className="lc-priv">🔒 {_t("Видят только участники этого круга. История передвижений нигде не хранится.")}</p>
        <button type="button" className="link-btn" onClick={onClose}>{_t("Закрыть")}</button>
      </div>
    </>
  );
}

/** «Кто где сейчас»: everyone sharing in this circle on one map. */
export function LiveMap({ code, me, names, live, onClose, flash }: { code: string; me: string; names: Names; live: LivePt[]; onClose: () => void; flash: (t: string) => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 5000); return () => clearInterval(t); }, []);
  // my own dot and distances: only if the phone already allowed location (no prompt here)
  useEffect(() => { locate(true).then((p) => { if (p) tick((x) => x + 1); }); }, []);
  const now = Date.now();
  const list = useMemo(() => live.filter((l) => new Date(l.until).getTime() > now), [live, now]);
  const mePos = lastPos();
  const mineOn = myLive(code);
  const pins: MapPin[] = [
    ...list.filter((l) => l.uid !== me).map((l, i) => ({ lat: l.lat, lng: l.lng, cls: ['', 't', 'p'][i % 3], label: (names[l.uid]?.name || _t("Участник")).split(' ')[0] })),
    ...(mePos ? [{ lat: mePos.lat, lng: mePos.lng, dot: true }] : []),
  ];
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet lc-sheet lc-full" role="dialog" aria-label={_t("Кто где сейчас")}>
        <h3>{_t("Кто где сейчас")} <small>{_tj("Делятся местом: {0}", list.length)}</small></h3>
        {pins.length ? <TileMap pins={pins} h={300} fit={{ w: 280, h: 240 }} /> : <p className="lc-sub">{_t("Сейчас никто не делится местом")}</p>}
        {list.map((l) => {
          const mine = l.uid === me;
          const p = { lat: l.lat, lng: l.lng };
          return (
            <div key={l.uid} className="lc-row">
              <b>{mine ? _t("Ты") : names[l.uid]?.name || _t("Участник")}<small>{ago(l.upd)} · {left(new Date(l.until).getTime())}</small></b>
              {!mine && mePos && <em>{distLabel(km(mePos, p))}</em>}
              {!mine && <a href={routeTo(p)} target="_blank" rel="noopener noreferrer">{_t("Маршрут")}</a>}
            </div>
          );
        })}
        {mineOn ? <button type="button" className="lc-stop" onClick={async () => { await stopLive(code); flash(_t("Ты больше не делишься местом")); onClose(); }}>{_t("Остановить моё место")}</button> : null}
        <p className="lc-priv">{_t("Место обновляется, пока у человека открыто приложение. Если он его свернул, видно, когда точка обновлялась последний раз.")}</p>
        <button type="button" className="link-btn" onClick={onClose}>{_t("Закрыть")}</button>
      </div>
    </>
  );
}
