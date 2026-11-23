import { useEffect, useState } from 'react';
import type { Anchor, AppState, PrayerMark } from '../types';
import { ANCHOR_LABEL } from '../types';
import { setPrayer } from '../store';
import { addDays } from '../dates';
import { listsOf, pid, type Plan } from '../plans';
import { newKid, patchF } from '../family';
import { _t, _tj } from '../i18n';
import { plural } from '../dates';
import { MAMA_KINDS, isSister, mamaOf, setMama, toggleNap, setSis, sisCancel, sisDayN, sisEnd, sisOf, sisStart, sisSummary, sisNow, syncSw } from '../sisters';
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
export function SistersPage({ state, update, today, onPrivacy, onCycle }: { state: AppState; update: Update; today: string; onPrivacy: () => void; onCycle: () => void }) {
  const x = sisOf(state);
  const [born, setBorn] = useState(false);
  const on = sisNow(state);
  const sw = (k: 'zikr' | 'quran' | 'soft' | 'guess', def: boolean) => {
    const v = x[k] ?? def;
    return <span className="switch"><input type="checkbox" checked={v} onChange={(e) => update((s) => setSis(s, { [k]: e.target.checked }))} /><span /></span>;
  };
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
      </div>

      <div className="nk-sec">{_t("Что видит круг")}</div>
      <div className="nk-grp">
        <div className="nk-r"><span>{_t("Твой «Свет дня» в круге выглядит как обычно")}<small>{_t("Зикр на время намаза засчитывается как намаз. Никаких меток, пауз и полумесяцев")}</small></span></div>
        <div className="nk-r"><span>{_t("На сервер не уходит ничего")}<small>{_t("Сменишь телефон: эта история начнётся заново (резервная копия в «Данных» её сохранит)")}</small></span></div>
      </div>

      <div className="nk-sec">{_t("Мой цикл")}</div>
      <div className="nk-grp">
        <button type="button" className="nk-r sis-row" onClick={onCycle}><span>{_t("Календарь, прогноз, посты к восполнению")}<small>{x.lock ? _t("Закрыто PIN-кодом") : _t("Мазхаб, замок, только на телефоне")}</small></span><i aria-hidden="true">›</i></button>
      </div>

      <MamaSection state={state} update={update} today={today} onBorn={() => setBorn(true)} />
      {born && <BabyBorn state={state} update={update} today={today} onClose={() => setBorn(false)} />}

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

// ───── Режим «Мама» ─────

/** Profile → «Для сестёр» → «Мама»: what she is going through now, and what changes. */
export function MamaSection({ state, update, today, onBorn }: { state: AppState; update: Update; today: string; onBorn: () => void }) {
  const m = mamaOf(state);
  return (
    <>
      <div className="nk-sec">{_t("Режим «Мама»")}</div>
      <div className="nk-grp sis-mama">
        <p className="sis-q" style={{ fontStyle: 'normal', margin: '4px 0 8px' }}>{_t("Я сейчас")}</p>
        <div className="sis-chips">
          {MAMA_KINDS.map((x) => (
            <button key={x.k} type="button" aria-pressed={m?.k === x.k} onClick={() => update((s) => setMama(s, x.k, today))}>{x.l()}</button>
          ))}
          <button type="button" aria-pressed={!m} onClick={() => update((s) => setMama(s, null, today))}>{_t("Нет")}</button>
        </div>
        {m ? (
          <>
            <label className="nk-r"><span>{_t("Привычки на шаг легче")}<small>{_t("Минимум привычки засчитывается полностью и стоит на карточке как «сейчас хватит»")}</small></span>
              <span className="switch"><input type="checkbox" checked={m.easy !== false} onChange={(e) => update((s) => setSis(s, { mama: { ...m, easy: e.target.checked } }))} /><span /></span></label>
            <div className="sis-li"><i>✓</i><span>{_t("3 прощённых пропуска в неделю вместо 1")}<small>{_t("Бессонная ночь не рвёт серию")}</small></span></div>
            <div className="sis-li"><i>✓</i><span>{_t("«Пока малыш спит» в Практике")}<small>{_t("Дела на 1–3 минуты под одну руку")}</small></span></div>
            <div className="sis-li"><i>✓</i><span>{_t("Мягкие тренировки и питание")}<small>{m.k === 'preg' ? _t("Режим «Жду малыша» в Питании, «Беременность: мягко» в Тренировках") : _t("Режим «Кормлю» в Питании, «После родов» и «Спина и осанка» в Тренировках")}</small></span></div>
            <div className="sis-note">
              <b>{_t("Посты")}</b>
              <span>{_t("Беременная и кормящая могут не поститься в Рамадан, если боятся за себя или ребёнка. Пропущенные дни восполняют позже. Нужна ли ещё фидья, зависит от мазхаба: спроси имама. Дни отмечай в «Постах» Рамадана как «Другое».")}</span>
            </div>
            {m.k === 'preg' && <button type="button" className="pri-btn sis-born" onClick={onBorn}>{_t("Малыш родился")}</button>}
          </>
        ) : (
          <p className="tiny" style={{ margin: '8px 0 4px' }}>{_t("Видишь только ты. Срок и возраст малыша хранятся только на телефоне.")}</p>
        )}
      </div>
    </>
  );
}

/** «Малыш родился»: nifas, sunnah steps, aqiqa in Plans, the baby in «Семья». */
export function BabyBorn({ state, update, today, onClose }: { state: AppState; update: Update; today: string; onClose: () => void }) {
  const [nifas, setNifas] = useState(true);
  const [aqiqa, setAqiqa] = useState(true);
  const [kid, setKid] = useState(true);
  const [name, setName] = useState('');
  const [tahnik, setTahnik] = useState(false);
  const all = () => {
    update((s0) => {
      let s = setSis(s0, { mama: { ...(sisOf(s0).mama ?? { since: today }), k: 'feed', since: today, born: today } });
      if (nifas) s = sisStart(sisNow(s) ? sisEnd(s, today) : s, today, true);
      if (aqiqa) {
        const d = addDays(today, 6);
        const p: Plan = { id: pid(), text: name.trim() ? _tj("Акика и имя: {0}", name.trim()) : _t("Акика и имя малыша"), date: d, after: 'dhuhr', remind: 'at', list: listsOf(s)[1], note: _t("Сунна на 7-й день: принести в жертву (за мальчика две овцы, за девочку одну), дать имя, сбрить волосы и дать садаку весом волос серебром."), made: Date.now(), upd: Date.now() };
        s = { ...s, plans: [...(s.plans ?? []), p] };
      }
      if (kid) s = patchF(s, (f) => ({ kids: [...f.kids, { ...newKid(name.trim() || _t("Малыш"), 0, f.kids.length), tasks: [] }] }));
      return s;
    });
    onClose();
  };
  return (
    <>
      <div className="dim" onClick={onClose} />
      <div className="sheet sis-sheet" role="dialog" aria-modal="true" aria-label={_t("Малыш родился")}>
        <div className="grab" />
        <h2 className="sis-h">{_t("Машаллах, поздравляем!")}</h2>
        <p className="sis-q">{_t("Пусть Аллах сделает малыша праведным и радостью для глаз.")}</p>
        <label className="sis-li"><input type="checkbox" checked={nifas} onChange={(e) => setNifas(e.target.checked)} /><span>{_t("Дни без намаза на время нифаса")}<small>{_t("Закончишь одной кнопкой, когда кровь прекратится (не дольше 40 дней)")}</small></span></label>
        <button type="button" className="sis-li warn" onClick={() => setTahnik(!tahnik)}><i>1</i><span>{_t("Тахник и дуа малышу")}<small>{tahnik ? _t("Пророк ﷺ разжёвывал финик и смазывал им нёбо новорождённого, делал дуа о баракате для него (Бухари 5467, Муслим 2145).") : _t("Коротко, что делать ›")}</small></span></button>
        <label className="sis-li"><input type="checkbox" checked={aqiqa} onChange={(e) => setAqiqa(e.target.checked)} /><span>{_t("Акика и имя на 7-й день")}<small>{_t("Попадёт в «Планы» с напоминанием")}</small></span></label>
        <label className="sis-li"><input type="checkbox" checked={kid} onChange={(e) => setKid(e.target.checked)} /><span>{_t("Добавить малыша в «Семью»")}<small>{_t("Позже там будут детские привычки")}</small></span></label>
        <input className="sis-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={_t("Имя малыша (можно позже)")} maxLength={40} />
        <button type="button" className="pri-btn big-btn" onClick={all}>{_t("Готово")}</button>
        <button type="button" className="link-btn sis-later" onClick={onClose}>{_t("Позже")}</button>
      </div>
    </>
  );
}

const NAP: { id: string; ic: string; t: () => string; m: number; ar?: string; tr?: () => string; go?: 'quran' | 'tasbih' }[] = [
  { id: 'dua', ic: '🤲', t: () => _t("Дуа за ребёнка"), m: 1, ar: 'رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِن ذُرِّيَّتِي ۚ رَبَّنَا وَتَقَبَّلْ دُعَاءِ', tr: () => _t("«Господи, сделай меня и моё потомство выстаивающими намаз. Господь наш, прими мою мольбу» (14:40)") },
  { id: 'dua2', ic: '🤍', t: () => _t("Дуа о радости для глаз"), m: 1, ar: 'رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا', tr: () => _t("«Господь наш, даруй нам в супругах и потомстве радость для глаз и сделай нас примером для богобоязненных» (25:74)") },
  { id: 'ayah', ic: '📖', t: () => _t("Один аят на слух"), m: 2, go: 'quran' },
  { id: 'tasbih', ic: '📿', t: () => _t("Тасбих 33 раза"), m: 1, go: 'tasbih' },
  { id: 'hadith', ic: '🌸', t: () => _t("Хадис о матери"), m: 1, tr: () => _t("Человек спросил: «Кто больше всех достоин моего доброго отношения?» Пророк ﷺ ответил: «Твоя мать», трижды, а потом: «Твой отец» (Бухари 5971, Муслим 2548). Твоя усталость сейчас не напрасна.") },
];

/** Practice → «Пока малыш спит»: one small deed in 1–3 minutes. */
export function MamaNap({ state, update, today, onExit, onOpen }: { state: AppState; update: Update; today: string; onExit: () => void; onOpen: (m: 'quran' | 'tasbih') => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const done = sisOf(state).nap?.[today] ?? [];
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label={_t("Выйти")}>✕</button>
        <div><b>{_t("Пока малыш спит")}</b><small>{_t("Есть 3 минуты? Выбери одно")}</small></div>
      </div>
      <div className="h-wrap sis-nap">
        <p className="sis-q" style={{ fontStyle: 'normal' }}>{_t("«Самые любимые дела у Аллаха — самые постоянные, даже если их мало» (Бухари, Муслим)")}</p>
        {NAP.map((x) => {
          const ok = done.includes(x.id);
          return (
            <div key={x.id} className={`sis-nap-it${ok ? ' ok' : ''}`}>
              <button type="button" className="sis-nap-h" onClick={() => (x.go ? onOpen(x.go) : setOpen(open === x.id ? null : x.id))}>
                <span className="sis-nap-ic" aria-hidden="true">{ok ? '✓' : x.ic}</span>
                <span><b>{x.t()}</b><small>{_tj("{0} мин", x.m)}{x.go ? ' ›' : ''}</small></span>
              </button>
              {open === x.id && (
                <div className="sis-nap-body">
                  {x.ar && <p className="sis-ar" lang="ar" dir="rtl">{x.ar}</p>}
                  {x.tr && <p className="sis-q">{x.tr()}</p>}
                </div>
              )}
              <button type="button" className="sis-nap-tick" aria-pressed={ok} onClick={() => update((s) => toggleNap(s, today, x.id))}>{ok ? _t("Сделано") : _t("Отметить")}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
