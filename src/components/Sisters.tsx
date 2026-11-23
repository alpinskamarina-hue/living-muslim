import { useEffect, useState } from 'react';
import type { Anchor, AppState, PrayerMark } from '../types';
import { ANCHOR_LABEL } from '../types';
import { setPrayer } from '../store';
import { fromKey } from '../dates';
import { _t, _tj, LOC } from '../i18n';
import { plural } from '../dates';
import { isSister, setSis, sisCancel, sisDayN, sisEnd, sisGuess, sisOf, sisStart, sisSummary, sisNow, syncSw } from '../sisters';
import { cloudMe, getProfile, saveProfile } from '../cloud';
import { rememberGender } from '../openCircles';

type Update = (fn: (s: AppState) => AppState) => void;

/** A sister taps a prayer circle: on time, late, clear, or «Дни без намаза». */
export function PrayerPick({ state, update, today, a, onClose }: { state: AppState; update: Update; today: string; a: Anchor; onClose: () => void }) {
  const m = state.prayers[today]?.[a];
  const set = (v: PrayerMark | null) => { update((s) => setPrayer(s, today, a, v)); onClose(); };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet sis-sheet" role="dialog" aria-modal="true" aria-label={ANCHOR_LABEL[a].ru}>
        <div className="grab" />
        <h2 className="sis-h">{ANCHOR_LABEL[a].ru}</h2>
        <p className="sis-q">{_t("Как прошёл намаз?")}</p>
        <button type="button" className={`sis-opt${m === 'ontime' ? ' on' : ''}`} onClick={() => set('ontime')}><i>✓</i><span>{_t("Вовремя")}</span></button>
        <button type="button" className={`sis-opt late${m === 'late' ? ' on' : ''}`} onClick={() => set('late')}><i>✓</i><span>{_t("С опозданием")}</span></button>
        {m && <button type="button" className="sis-opt off" onClick={() => set(null)}><i>✕</i><span>{_t("Снять отметку")}</span></button>}
        <button type="button" className="sis-opt moon" onClick={() => { update((s) => sisStart(s, today)); onClose(); }}>
          <i>☾</i><span><b>{_t("Дни без намаза")}</b><small>{_t("Серия бережётся до конца дней. Видишь только ты.")}</small></span>
        </button>
        <p className="sis-lock">🔒 {_t("Хранится только на этом телефоне")}</p>
      </div>
    </>
  );
}

/** The line above the day on days without prayer. */
export function SisBand({ state, update, today, onEnd }: { state: AppState; update: Update; today: string; onEnd: () => void }) {
  const n = sisDayN(state, today);
  const nifas = sisOf(state).nifas;
  return (
    <div className="sis-band">
      <b>☾ {nifas ? _t("Нифас") : _t("Дни без намаза")} · {_tj("день {0}", n)}</b>
      <span>{_t("Серия и сад на паузе, ничего не сгорает. Аллах записывает награду за то, что ты делала всегда.")}</span>
      <div className="sis-band-row">
        <button type="button" className="sis-end" onClick={onEnd}>{_t("Дни закончились")}</button>
        {n === 1 && <button type="button" className="sis-undo" onClick={() => update(sisCancel)}>{_t("Отмечено по ошибке")}</button>}
      </div>
    </div>
  );
}

/** «Дни закончились»: what was kept, ghusl, Ramadan days to make up. */
export function SisEnd({ state, update, today, next, onClose, onGhusl }: { state: AppState; update: Update; today: string; next: string; onClose: () => void; onGhusl: () => void }) {
  const sum = sisSummary(state, today);
  const end = () => { update((s) => sisEnd(s, today)); onClose(); };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet sis-sheet" role="dialog" aria-modal="true" aria-label={_t("С возвращением к намазу")}>
        <div className="grab" />
        <h2 className="sis-h">{_t("С возвращением к намазу")}</h2>
        <p className="sis-ar" lang="ar" dir="rtl">إِنَّ اللَّهَ يُحِبُّ التَّوَّابِينَ وَيُحِبُّ الْمُتَطَهِّرِينَ</p>
        <p className="sis-q">{_t("«Аллах любит кающихся и любит очищающихся» (2:222)")}</p>
        <div className="sis-li"><i>✓</i><span>{_tj("Серия цела")}<small>{_tj("{0} {1} не считались, но и не оборвали её", sum.days, plural(sum.days, _t("день"), _t("дня"), _t("дней")))}</small></span></div>
        {sum.zk > 0 && <div className="sis-li"><i>✓</i><span>{_tj("Зикров за эти дни: {0}", sum.zk)}<small>{_t("Они вошли в «Свет дня» и в сад")}</small></span></div>}
        <button type="button" className="sis-li warn" onClick={onGhusl}><i>!</i><span>{_t("Гусль перед следующим намазом")}<small>{_t("Как делать гусль: коротко")} ›</small></span></button>
        {sum.ram > 0 && <div className="sis-li"><i>☾</i><span>{_tj("Рамадан: +{0} {1} поста восполнить", sum.ram, plural(sum.ram, _t("день"), _t("дня"), _t("дней")))}<small>{_t("Уже отмечены в «Постах» Рамадана")}</small></span></div>}
        <button type="button" className="pri-btn big-btn" onClick={end}>{next ? _tj("Готово. Следующий намаз: {0}", next) : _t("Готово")}</button>
        <button type="button" className="link-btn sis-later" onClick={onClose}>{_t("Ещё нет")}</button>
      </div>
    </>
  );
}

/** Short ghusl steps (Bukhari 248, Muslim 316). */
export function GhuslSheet({ onClose }: { onClose: () => void }) {
  const steps = [
    _t("Намерение в сердце: очиститься для намаза."),
    _t("«Бисмиллях», вымыть кисти рук три раза."),
    _t("Смыть нечистоту, вымыть интимные места."),
    _t("Сделать полное омовение (вуду), как для намаза."),
    _t("Пролить воду на голову три раза, чтобы вода дошла до корней волос. Косы расплетать не обязательно."),
    _t("Облить всё тело, начиная с правой стороны, чтобы не осталось сухого места."),
  ];
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet sis-sheet" role="dialog" aria-modal="true" aria-label={_t("Гусль")}>
        <div className="grab" />
        <h2 className="sis-h">{_t("Гусль")}</h2>
        <ol className="sis-steps">{steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
        <p className="tiny">{_t("По хадисам Аиши и Маймуны (Бухари 248, 249; Муслим 316, 330). Подробности по своему мазхабу уточни у знающей сестры или имама.")}</p>
        <button type="button" className="pri-btn big-btn" onClick={onClose}>{_t("Понятно")}</button>
      </div>
    </>
  );
}

/** Profile → «Для сестёр». */
export function SistersPage({ state, update, today, onPrivacy }: { state: AppState; update: Update; today: string; onPrivacy: () => void }) {
  const x = sisOf(state);
  const on = sisNow(state);
  const sw = (k: 'zikr' | 'quran' | 'soft' | 'guess', def: boolean) => {
    const v = x[k] ?? def;
    return <span className="switch"><input type="checkbox" checked={v} onChange={(e) => update((s) => setSis(s, { [k]: e.target.checked }))} /><span /></span>;
  };
  const guess = x.guess ? sisGuess(state, today) : null;
  const fmt = (d: string) => fromKey(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long' });
  return (
    <div className="sis-page">
      <div className="nk-sec">{_t("Дни без намаза")}</div>
      <div className="nk-grp">
        <div className="nk-r"><span>{on ? _tj("Сейчас: день {0}", sisDayN(state, today)) : _t("Сейчас обычные дни")}<small>{on ? _t("Закончить можно на «Сегодня» или здесь") : _t("Включаются касанием по кружку намаза на «Сегодня»")}</small></span>
          {on ? <button type="button" className="sis-mini" onClick={() => update((s) => sisEnd(s, today))}>{_t("Закончились")}</button>
            : <button type="button" className="sis-mini" onClick={() => update((s) => sisStart(s, today))}>{_t("Начались")}</button>}
        </div>
        <label className="nk-r"><span>{_t("Зикр на время намаза")}<small>{_t("Короткий, 1–6 минут")}</small></span>{sw('zikr', true)}</label>
        <label className="nk-r"><span>{_t("Коран на слух")}<small>{_t("Слушать можно всегда")}</small></span>{sw('quran', true)}</label>
        <label className="nk-r"><span>{_t("Напоминания о намазе")}<small>{_t("В эти дни телефон сам заменит их мягким «время зикра»")}</small></span>{sw('soft', true)}</label>
        <label className="nk-r"><span>{_t("Подсказать, когда дни примерно начнутся")}<small>{guess ? (guess.inDays >= 0 ? _tj("Примерно {0} (через {1} {2})", fmt(guess.day), guess.inDays, plural(guess.inDays, _t("день"), _t("дня"), _t("дней"))) : _tj("Примерно {0}", fmt(guess.day))) : _t("Считает только телефон, нужно хотя бы 2 раза")}</small></span>{sw('guess', false)}</label>
      </div>

      <div className="nk-sec">{_t("Что видит круг")}</div>
      <div className="nk-grp">
        <div className="nk-r"><span>{_t("Твой «Свет дня» в круге выглядит как обычно")}<small>{_t("Зикр на время намаза засчитывается как намаз. Никаких меток, пауз и полумесяцев")}</small></span></div>
        <div className="nk-r"><span>{_t("На сервер не уходит ничего")}<small>{_t("Сменишь телефон: эта история начнётся заново (резервная копия в «Данных» её сохранит)")}</small></span></div>
      </div>

      {(x.past?.length ?? 0) > 0 && (
        <>
          <div className="nk-sec">{_t("Прошлые дни")}</div>
          <div className="nk-grp">
            {x.past!.slice(0, 6).map((r) => (
              <div key={r.from} className="nk-r"><span>{r.from === r.to ? fmt(r.from) : `${fmt(r.from)} – ${fmt(r.to)}`}{r.nifas && <small>{_t("нифас")}</small>}</span></div>
            ))}
            <button type="button" className="link-btn sis-clear" onClick={() => update((s) => setSis(s, { past: [] }))}>{_t("Стереть историю")}</button>
          </div>
        </>
      )}

      <div className="nk-sec">{_t("Приватность")}</div>
      <div className="nk-grp">
        <button type="button" className="nk-r sis-row" onClick={onPrivacy}><span>{_t("Кто может звать, писать и видеть фото")}<small>{_t("Аккаунт и приватность")}</small></span><i aria-hidden="true">›</i></button>
      </div>
    </div>
  );
}

const PRIV_KEY = 'lm.sisPriv';
/** «Включили для тебя»: privacy by default for a sister, applied to her cloud profile once she has one. */
export function applySisterPrivacy() {
  try { localStorage.setItem(PRIV_KEY, '1'); } catch { /* */ }
  rememberGender('f');
  return flushSisterPrivacy();
}
/** Waits for an identity: the profile is written only once one exists (no account is made for this). */
export async function flushSisterPrivacy() {
  let want = false;
  try { want = localStorage.getItem(PRIV_KEY) === '1'; } catch { /* */ }
  if (!want || !cloudMe()) return;
  const p = await getProfile();
  if (!p) return;
  const patch: Record<string, unknown> = { gender: 'f', sisters_only: true, show_photo: false };
  if (!p.avatar?.k || p.avatar.k === 'initials') patch.avatar = { k: 'pattern', v: 'star', c: '#b04f5a' };
  const r = await saveProfile(patch, p.name || cloudMe()?.name || '');
  if (r === 'ok') { try { localStorage.removeItem(PRIV_KEY); } catch { /* */ } }
}

/** After «Я сестра»: what was switched on for her. */
export function SisterPrivacyCard({ state, update, onOwn }: { state: AppState; update: Update; onOwn: () => void }) {
  const x = sisOf(state);
  if (!isSister(state) || x.priv === 'done' || x.priv === 'own') return null;
  const ok = () => { void applySisterPrivacy(); update((s) => setSis(s, { priv: 'done' })); };
  const own = () => { update((s) => setSis(s, { priv: 'own' })); onOwn(); };
  return (
    <div className="sis-priv">
      <b>{_t("Сестра, мы закрыли для тебя лишнее")}</b>
      <div className="sis-li"><i>✓</i><span>{_t("Звать в круги и писать могут только сёстры")}<small>{_t("Братья не найдут тебя по нику")}</small></span></div>
      <div className="sis-li"><i>✓</i><span>{_t("Фото скрыто")}<small>{_t("Включишь сама, его увидят только участники твоих кругов")}</small></span></div>
      <div className="sis-li"><i>✓</i><span>{_t("Аватар без лица")}<small>{_t("Узор вместо фото, сменить можно в профиле")}</small></span></div>
      <div className="sis-li"><i>✓</i><span>{_t("Дни без намаза видишь только ты")}</span></div>
      <button type="button" className="pri-btn" onClick={ok}>{_t("Хорошо")}</button>
      <button type="button" className="link-btn" onClick={own}>{_t("Настроить по-своему")}</button>
    </div>
  );
}

/** Keeps the service worker flag in step after a reload (it may have been cleared with the site data). */
export function useSisSync(state: AppState) {
  const on = Boolean(state.sis?.cur) && state.sis?.soft !== false;
  useEffect(() => { syncSw(state); flushSisterPrivacy().catch(() => {}); }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useSisSheets() {
  const [pick, setPick] = useState<Anchor | null>(null);
  const [end, setEnd] = useState(false);
  const [ghusl, setGhusl] = useState(false);
  return { pick, setPick, end, setEnd, ghusl, setGhusl };
}
