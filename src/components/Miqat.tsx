import { useEffect, useState } from 'react';
import type { AppState, UmrahState } from '../types';
import { IHRAM_RULES, STEPS } from '../umrah/guide';
import { umrahOf } from './Umrah';
import { _t, _tj, LOC } from '../i18n';

// The miqat on a flight: the plane crosses it in the air, often while people sleep or queue for the toilet.
// The person says where they fly from and when they land; we count down to a safe moment for the intention
// and then keep them in "ihram mode" with the talbiya and the rules until the rites are done.

type Dir = 'north' | 'east' | 'south' | 'medina';
const ROUTES: Record<Dir, { label: string; who: string; miqat: string; before: number }> = {
  north: { label: _t("С севера или запада"), who: _t("Россия, Европа, Турция, Кавказ, Египет"), miqat: _t("аль-Джухфа (у Рабига)"), before: 25 },
  east: { label: _t("С востока"), who: _t("Казахстан, Узбекистан, Таджикистан, Залив, Иран"), miqat: _t("Карн аль-Маназиль или Зату Ирк"), before: 35 },
  south: { label: _t("С юга"), who: _t("Йемен, Африка, Азия через Индийский океан"), miqat: _t("Яламлам"), before: 20 },
  medina: { label: _t("Сначала в Медину"), who: _t("Ихрам не в самолёте, а в Медине"), miqat: _t("Зуль-Хулейфа (Абйар Али)"), before: 0 },
};
// Intention a quarter of an hour before the estimated crossing: better early than after the miqat.
const MARGIN = 15;

const patch = (s: AppState, p: Partial<UmrahState>): AppState => ({ ...s, umrah: { ...umrahOf(s), ...p } });
const hm = (t: number) => new Date(t).toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' });

export function MiqatView({ state, update, onBack }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; onBack: () => void }) {
  const u = umrahOf(state);
  const f = u.flight;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  const setFlight = (p: Partial<NonNullable<UmrahState['flight']>>) => update((s) => patch(s, { flight: { dir: 'north', land: '', ...(umrahOf(s).flight ?? {}), ...p } }));

  const route = f ? ROUTES[f.dir] : null;
  const landAt = f?.land ? Date.parse(f.land) : NaN;
  const niyyaAt = route && !Number.isNaN(landAt) && f!.dir !== 'medina' ? landAt - (route.before + MARGIN) * 60000 : null;
  const left = niyyaAt ? Math.round((niyyaAt - now) / 60000) : null;

  // A reminder while the app is open: ten minutes before the intention, and at the moment itself.
  const [remind, setRemind] = useState(false);
  useEffect(() => {
    if (!remind || !niyyaAt || u.ihram) return;
    const say = (body: string) => navigator.serviceWorker?.ready.then((r) => r.showNotification(_t("Микат"), { body, tag: 'miqat' })).catch(() => {});
    const ts = [niyyaAt - 10 * 60000, niyyaAt].map((t, i) => setTimeout(() => say(i ? _t("Сейчас время намерения: Ляббайк, Аллахумма, умратан.") : _t("Через 10 минут намерение. Ихрам надет?")), Math.max(0, t - Date.now())));
    return () => ts.forEach(clearTimeout);
  }, [remind, niyyaAt, u.ihram]);
  const ask = async () => { try { if ((await Notification.requestPermission()) === 'granted') setRemind(true); } catch { /* not supported */ } };

  const enter = () => update((s) => patch(s, { ihram: Date.now() }));
  const leave = () => update((s) => patch(s, { ihram: undefined }));
  const intent = STEPS.find((s) => s.id === 'ihram')?.dua?.[0];
  const talbiya = STEPS.find((s) => s.id === 'talbiya')?.dua?.[0];

  return (
    <div className="sess miqat">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onBack} aria-label={_t("Назад")}>‹</button>
        <div><b>{u.ihram ? _t("Ты в ихраме") : _t("Микат в самолёте")}</b><small>{u.ihram ? _t("с {0}", hm(u.ihram)) : _t("Чтобы не пролететь микат без намерения")}</small></div>
      </div>

      {u.ihram ? (
        <>
          <p className="mq-lead">{_t("Повторяй тальбию до начала тавафа. Братья вслух, сёстры тихо.")}</p>
          {talbiya && <div className="mq-dua"><p className="ar-dua" lang="ar" dir="rtl">{talbiya.ar}</p><p>{talbiya.tr}</p><small>{talbiya.ru}</small></div>}
          <div className="mq-card"><b>{_t("В ихраме нельзя")}</b><ul>{IHRAM_RULES.map((r) => <li key={r}>{r}</li>)}</ul></div>
          <button type="button" className="mq-link" onClick={leave}>{_t("Я вышел из ихрама")}</button>
        </>
      ) : (
        <>
          <div className="mq-form">
            <b>{_t("Откуда летишь?")}</b>
            <div className="mq-dirs">
              {(Object.keys(ROUTES) as Dir[]).map((d) => (
                <button key={d} type="button" aria-pressed={f?.dir === d} onClick={() => setFlight({ dir: d })}>
                  <b>{ROUTES[d].label}</b><small>{ROUTES[d].who}</small>
                </button>
              ))}
            </div>
            {f && f.dir !== 'medina' && (
              <label className="mq-land"><span>{_t("Посадка в Джидде по часам телефона")}</span>
                <input type="datetime-local" value={f.land} onChange={(e) => setFlight({ land: e.target.value })} />
              </label>
            )}
          </div>

          {route && f!.dir === 'medina' && (
            <div className="mq-card"><b>{_tj("Микат: {0}", route.miqat)}</b><p>{_t("Летишь в Медину, значит в самолёте ихрам не нужен. В Медине ты ещё не в ихраме. Перед выездом в Мекку сделай гусль, надень ихрам и сделай намерение в мечети Зуль-Хулейфа (Абйар Али) по дороге.")}</p></div>
          )}

          {niyyaAt && left !== null && (
            <div className="mq-count">
              <small>{_tj("Микат: {0}", route!.miqat)}</small>
              {left > 0 ? (
                <>
                  <div className="big-t">{left >= 60 ? _t("{0} ч {1} мин", Math.floor(left / 60), left % 60) : _t("{0} мин", left)}</div>
                  <b>{_tj("до намерения, в {0}", hm(niyyaAt))}</b>
                  <p>{left > 90 ? _t("Надень ихрам до вылета или в начале полёта, пока свободен туалет.") : _t("Пора надевать ихрам, если ещё не надел.")}</p>
                </>
              ) : (
                <>
                  <div className="big-t">{_t("Сейчас")}</div>
                  <b>{_t("время намерения")}</b>
                </>
              )}
              {intent && <div className="mq-dua"><p className="ar-dua" lang="ar" dir="rtl">{intent.ar}</p><p>{intent.tr}</p><small>{intent.ru}</small></div>}
              {!remind && left > 10 && 'Notification' in window && <button type="button" className="mq-link" onClick={ask}>{_t("Напомнить за 10 минут")}</button>}
              {remind && <small className="mq-note">{_t("Напомню, пока приложение открыто.")}</small>}
            </div>
          )}

          <button type="button" className="gold-btn mq-go" onClick={enter}>{_t("Я сделал намерение, я в ихраме")}</button>
          <p className="mq-note">{_tj("Время примерное: самолёт пересекает микат за {0} минут до посадки, а мы советуем намерение ещё на {1} минут раньше. Экипаж рейсов в Джидду обычно объявляет микат: слушай его. Лучше сделать намерение раньше, чем после миката.", route?.before || '20–40', MARGIN)}</p>
        </>
      )}
    </div>
  );
}
