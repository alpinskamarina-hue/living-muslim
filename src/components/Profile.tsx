import { BadgeShelf } from './Badges';
import { themeMode } from '../theme';
import { themeLabel } from './ThemeSwitch';
import { GuidePage } from './Guide';
import { AdminPage, useIsAdmin } from './Admin';
import type { GoTo } from '../guide';
import { WordCard } from './Words';
import { LogoLockup } from './Logo';
import { ProPlans } from './Pro';
import { ADVISED, LIMITS_ON, SOFT, usePlan } from '../plan';
import { Advice } from './Plan';
import { openPath } from './NewPath';
import { pathNow } from '../newpath';
import { GiftPass } from './GiftPass';
import { Garden } from './Garden';
import { garden, journey } from '../gamify';
import { authMe, signInUrl, signOut } from '../auth';
import { useEffect, useRef, useState } from 'react';
import { ShareRow } from './ShareRow';
import { RamadanPushFields } from './Ramadan';
import { AdhanSettings, tryAdhan } from './Adhan';
import { adhanOf, reciterName } from '../adhan';
import { canPrompt, DEFAULT_PREFS, disablePush, enablePush, isIOS, isStandalone, onInstallChange, promptInstall, pushSupported } from '../push';
import { isCloud, nicksReady, forgetIdentity, signupName } from '../cloud';
import { MyProfile, Ava, cachedProfile, refreshProfile } from './Nick';
import { NikahPage } from './Nikah';
import { AssistantSettings, IdeasPage } from './Assistant';
import { aiName } from '../assistant';
import { useNikahReady, useNikahMe, nikahTodo } from '../nikah';
import type { Anchor, AppState, Habit, MethodId } from '../types';
import { ANCHOR_LABEL } from '../types';
import { METHODS, PLACES, type DayTimes } from '../prayer';
import { addDays, dayKey, daysBetween, hhmm, plural } from '../dates';
import { activeLimit, initialState, slotsUsed } from '../store';
import { _t, _tj, LANG } from '../i18n';

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  replace: (s: AppState) => void;
  times: DayTimes;
  onEdit: (h: Habit) => void;
  start?: Page;
  onGo?: (t: GoTo) => void;
}

export function Profile({ state, update, replace, times, onEdit, start, onGo }: Props) {
  const s = state.settings;
  const set = (patch: Partial<AppState['settings']>) => update((x) => ({ ...x, settings: { ...x.settings, ...patch } }));
  const [page, setPage] = useState<Page>(start ?? 'main');
  const [, bump] = useState(0);
  const [nicks, setNicks] = useState(false);
  const nikahOn = useNikahReady();
  const nk = useNikahMe(nikahOn);
  const nkTodo = nikahTodo(nk);
  const admin = useIsAdmin();
  const plan = usePlan();
  useEffect(() => { nicksReady().then(setNicks); }, []);
  useEffect(() => { if (isCloud && page === 'main') refreshProfile().then((ch) => ch && bump((n) => n + 1)); }, [page]);
  const go = (p: Page) => { setPage(p); window.scrollTo(0, 0); };
  const back = () => go('main');

  if (page === 'garden') return <Sub title={_t("Мой сад")} onBack={back}><Garden state={state} today={dayKey(new Date())} /><WordCard t="garden" state={state} today={dayKey(new Date())} /></Sub>;
  if (page === 'pro') return <ProPlans onBack={back} />;
  if (page === 'gift') return <Sub title={_t("Садака")} onBack={back}><GiftPass /></Sub>;
  if (page === 'prayer') return <Sub title={_t("Намазы")} onBack={back}><PrayerSettings s={s} set={set} times={times} /></Sub>;
  if (page === 'habits') return <Sub title={_t("Мои привычки")} onBack={back}><HabitsSettings state={state} update={update} onEdit={onEdit} /></Sub>;
  if (page === 'adhan') return <Sub title={_t("Азан")} onBack={back}><AdhanSettings s={s} set={set} times={times} onTry={tryAdhan} /></Sub>;
  if (page === 'remind') return <Sub title={_t("Напоминания")} onBack={back}><RemindPage s={s} set={set} times={times} /></Sub>;
  if (page === 'words') return <Sub title={_t("Фразы и напоминания")} onBack={back}><WordsSettings s={s} set={set} /></Sub>;
  if (page === 'lang') return <Sub title="Язык · Language" onBack={back}><LangSettings s={s} set={set} /></Sub>;
  if (page === 'look') return <Sub title={_t("Внешний вид")} onBack={back}><LookSettings s={s} set={set} /></Sub>;
  if (page === 'data') return <Sub title={_t("Данные")} onBack={back}><DataSettings state={state} replace={replace} /></Sub>;
  if (page === 'nikah') return <Sub title={_t("Никах")} onBack={back}><NikahPage /></Sub>;
  if (page === 'admin') return <Sub title={_t("Для владельца")} onBack={back}><AdminPage /></Sub>;
  if (page === 'guide') return <Sub title={_t("Как пользоваться")} onBack={back}><GuidePage go={(t) => onGo?.(t)} /></Sub>;
  if (page === 'assistant') return <Sub title={aiName(s)} onBack={back}><AssistantSettings s={s} set={set} admin={admin} onOpen={() => onGo?.({ assistant: true })} /></Sub>;
  if (page === 'ideas') return <Sub title={_t("Идеи и напоминания")} onBack={back}><IdeasPage state={state} update={update} onAsk={() => onGo?.({ assistant: true })} /></Sub>;
  if (page === 'help') return <Sub title={_t("Помощь")} onBack={back}><HelpPage /></Sub>;
  if (page === 'me') return <Sub title={_t("Мой профиль")} onBack={back}><MyProfile name={s.name.trim() || authMe()?.name || ''} onName={(n) => set({ name: n })} onSex={(g) => set({ me: g })} /></Sub>;
  if (page === 'account') return <Sub title={_t("Аккаунт")} onBack={back}><AccountPage s={s} set={set} /></Sub>;

  const me = authMe();
  const prof = isCloud ? cachedProfile() : null;
  const st = stats(state);
  const gd = garden(journey(state, dayKey(new Date())).lit);
  const used = slotsUsed(state);
  const name = s.name.trim() || me?.name || signupName() || _t("Друг");
  const methodName = METHODS.find((m) => m.id === s.method)?.ru ?? '';
  const theme = themeLabel(themeMode(s)).toLowerCase();

  return (
    <div className="page">
      <div className="me-card">
        <button type="button" className="me-top me-edit" onClick={() => go(isCloud && nicks ? 'me' : 'account')} aria-label={_t("Изменить профиль")}>
          {isCloud && nicks && prof?.avatar ? <Ava pick={prof.avatar} color={prof.color} photo={prof.photo} name={name} size={56} />
            : <span className="me-av" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>}
          <span className="me-txt">
            <b>{name}</b>
            <small>{prof?.nick ? `@${prof.nick}` : me?.email ?? _t("Вход по почте не выполнен")}</small>
            {prof?.bio ? <small>{prof.bio}</small> : <small>{_tj("С нами {0}  {1}", st.days, plural(st.days, _t("день"), _t("дня"), _t("дней")))}</small>}
          </span>
          <span className="me-pen">{_t("✎ Изменить")}</span>
        </button>
        <div className="me-stats">
          <div><b>{st.onTime}<i>/35</i></b><small>{_t("намазов вовремя за неделю")}</small></div>
          <div><b>{st.formed}</b><small>{plural(st.formed, _t("привычка закреплена"), _t("привычки закреплены"), _t("привычек закреплено"))}</small></div>
          <div><b>{st.chapters}</b><small>{plural(st.chapters, _t("глава прочитана"), _t("главы прочитаны"), _t("глав прочитано"))}</small></div>
        </div>
      </div>

      <BadgeShelf state={state} update={update} onOpen={onGo ? () => onGo({ practice: 'videos' }) : undefined} />

      {admin && (
        <button type="button" className="pro-entry adm-entry" onClick={() => go('admin')}>
          <span className="pro-badge adm-badge">📊</span>
          <span><b>{_t("Аналитика и курсы")}</b><small>{_t("Кто заходит и откуда, курсы приложения. Видно только тебе")}</small></span>
          <i aria-hidden="true">›</i>
        </button>
      )}

      {LIMITS_ON && (
      <button type="button" className="pro-entry" onClick={() => go('pro')}>
        <span className="pro-badge">PRO</span>
        <span><b>Living Muslim Pro</b><small>{plan.owner ? _t("Ты владелец: всё открыто, без тарифа") : plan.gift ? _t("Pro в подарок на первый год") : plan.early ? _t("Ты в списке первых: Pro открыт") : plan.trial ? _t("Pro открыт ещё {0} {1}. Потом по 3", plan.daysLeft, plural(plan.daysLeft, _t("день"), _t("дня"), _t("дней"))) : _t("Сейчас бесплатный: по 3. Первый год Pro −37%")}</small></span>
        <i aria-hidden="true">›</i>
      </button>
      )}

      <button type="button" className="pro-entry gp-pentry" onClick={() => go('gift')}>
        <span className="pro-badge gp-badge">€10</span>
        <span><b>{_t("Подари пропуск на умру")}</b><small>{_t("Садака тому, кто едет к Каабе, но не может оплатить")}</small></span>
        <i aria-hidden="true">›</i>
      </button>

      <div className="menu">
        <Row icon="✨" title={aiName(s)} sub={admin ? _t("Аватар, имя, как говорит и обучение") : _t("Аватар, имя и как он говорит")} onClick={() => go('assistant')} />
        <Row icon="💡" title={_t("Идеи и напоминания")} sub={(() => { const n = (state.pings ?? []).filter((p) => p.at > Date.now()).length; return n ? _t("Напоминаний впереди: {0}", n) : state.ideas?.length ? _t("Записано: {0}", state.ideas.length) : _t("Идеи и мысли, которые записал ты или помощник"); })()} onClick={() => go('ideas')} />
        <Row icon="📖" title={_t("Как пользоваться")} sub={_t("Гид по всем разделам и частые вопросы")} onClick={() => go('guide')} />
        <Row icon="🌳" title={_t("Мой сад")} sub={_t("{0} {1} · до плода {2} {3} · вехи", gd.leaves, plural(gd.leaves, _t("лист"), _t("листа"), _t("листьев")), gd.toFruit, plural(gd.toFruit, _t("день"), _t("дня"), _t("дней")))} onClick={() => go('garden')} />
        {isCloud && nikahOn && <Row icon="💍" title={_t("Никах")} sub={nkTodo.props || nkTodo.wali.length ? _t("Новое: {0}", [nkTodo.props && `${nkTodo.props} ${plural(nkTodo.props, _t("предложение"), _t("предложения"), _t("предложений"))}`, nkTodo.wali.length && _t("просьба быть вали")].filter(Boolean).join(', ')) : nk?.mine ? _t("Моя анкета, предложения, шаги") : _t("Ищу пару через свои круги, с вали")} onClick={() => go('nikah')} />}
        {isCloud && nicks && <Row icon="🪪" title={_t("Мой профиль")} sub={prof?.nick ? _t("@{0} · фото, приватность", prof.nick) : _t("Ник, фото, кто может звать в круги")} onClick={() => go('me')} />}
        {!onClaude && <Row icon="👤" title={_t("Аккаунт")} sub={me ? _t("{0} · имя «{1}»", me.email, name) : _t("Войти по почте, имя")} onClick={() => go('account')} />}
        {onClaude && <Row icon="👤" title={_t("Имя")} sub={name} onClick={() => go('account')} />}
        <Row icon="🌙" title={_t("Новый путь")} sub={state.newpath?.on ? _t("День {0} из 40 · учитель намаза, суры", pathNow(state, dayKey(new Date())).day) : _t("Для тех, кто недавно принял ислам")} onClick={() => openPath({ v: 'list' })} />
        <Row icon="🕌" title={_t("Намазы")} sub={`${s.place} · ${methodName}`} onClick={() => go('prayer')} />
        <Row icon="📢" title={_t("Азан")} sub={adhanOf(s).on ? _tj("Включён · {0}", reciterName(adhanOf(s).reciter)) : _t("Выключен · выбери чтеца")} onClick={() => go('adhan')} />
        {isCloud && <Row icon="🔔" title={_t("Напоминания")} sub={s.reminders?.on ? _t("Включены · {0} из 5 намазов", s.reminders.prayers.length) : (isStandalone() ? _t("Выключены") : _t("Установить на телефон, напоминания"))} onClick={() => go('remind')} />}
        <Row icon="🌱" title={_t("Мои привычки")} sub={SOFT ? _t("Активных: {0} · рекомендуем до {1}", used, ADVISED) : _t("{0} из {1} мест занято", used, activeLimit())} onClick={() => go('habits')} />
        <Row icon="🤲" title={_t("Фразы и напоминания")} sub={`${s.me === 'f' ? _t("Я сестра") : s.me === 'm' ? _t("Я брат") : _t("Брат или сестра?")} · ${(s.words ?? 'calm') === 'normal' ? _t("обычно") : (s.words ?? 'calm') === 'calm' ? _t("спокойно") : _t("только фразы")}`} onClick={() => go('words')} />
        <Row icon="🌐" title="Язык · Language" sub={LANG === 'en' ? 'English' : 'Русский'} onClick={() => go('lang')} />
        <Row icon="🎨" title={_t("Внешний вид")} sub={_t("Тема {0} · текст {1}", theme, s.textScale && s.textScale > 1 ? _t("крупнее") : _t("обычный"))} onClick={() => go('look')} />
        <Row icon="💾" title={_t("Данные")} sub={_t("Резервная копия, перенос, удаление")} onClick={() => go('data')} />
        <Row icon="🤝" title={_t("Помощь")} sub={SUPPORT_EMAIL ? _t("Написать нам, поделиться, конфиденциальность") : _t("Поделиться приложением, конфиденциальность")} onClick={() => go('help')} />
      </div>

      <LogoLockup />
      <p className="tiny ver">{_t("Версия 0.2")}<br />{_t("«Самые любимые дела у Аллаха — самые постоянные, даже если их мало»")}</p>
    </div>
  );
}

export type Page = 'assistant' | 'ideas' | 'adhan' | 'lang' | 'nikah' | 'admin' | 'guide' | 'main' | 'gift' | 'words' | 'me' | 'garden' | 'remind' | 'pro' | 'account' | 'prayer' | 'habits' | 'look' | 'data' | 'help';
const onClaude = typeof location !== 'undefined' && /claude|anthropic/.test(location.hostname);
const SUPPORT_EMAIL = 'alpinskamarina@gmail.com';
const ANCHORS: Anchor[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

function stats(state: AppState) {
  const today = dayKey(new Date());
  let onTime = 0;
  for (let i = 0; i < 7; i++) {
    const d = state.prayers[addDays(today, -i)] ?? {};
    for (const a of ANCHORS) if (d[a] === 'ontime') onTime++;
  }
  const keys = [...Object.keys(state.log), ...Object.keys(state.prayers), ...state.habits.map((h) => h.createdAt)].filter(Boolean).sort();
  const days = keys.length ? Math.max(1, daysBetween(keys[0], today) + 1) : 1;
  return { onTime, formed: state.habits.filter((h) => h.formed).length, chapters: state.summaryRead?.length ?? 0, days };
}

function Row({ icon, title, sub, onClick }: { icon: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="menu-row" onClick={onClick}>
      <span className="mi" aria-hidden="true">{icon}</span>
      <span className="mt"><b>{title}</b><small>{sub}</small></span>
      <i aria-hidden="true">›</i>
    </button>
  );
}

function Sub({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="page">
      <button type="button" className="link-btn pro-back" onClick={onBack}>{_t("← Профиль")}</button>
      <h1 className="page-h">{title}</h1>
      {children}
    </div>
  );
}

type SetFn = (patch: Partial<AppState['settings']>) => void;

function AccountPage({ s, set }: { s: AppState['settings']; set: SetFn }) {
  return (
    <>
      <label className="field">
        <span>{_t("Как к тебе обращаться")}</span>
        <input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder={_t("Имя")} maxLength={40} />
      </label>
      <AccountCard />
      {!onClaude && <p className="tiny">{_t("Почта нужна, чтобы не потерять доступ и получать новости приложения. Привычки и заметки пока хранятся на этом устройстве.")}</p>}
    </>
  );
}

function PrayerSettings({ s, set, times }: { s: AppState['settings']; set: SetFn; times: DayTimes }) {
  const [geo, setGeo] = useState('');
  const locate = () => {
    if (!navigator.geolocation) return setGeo(_t("Геолокация недоступна, выбери город из списка."));
    setGeo(_t("Определяю…"));
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: p.coords.latitude, lng: p.coords.longitude, place: _t("Моё место") }); setGeo(_t("Готово")); },
      () => setGeo(_t("Не получилось, выбери город из списка.")),
      { timeout: 10000 },
    );
  };
  const off = s.offsets ?? {};
  const bump = (a: Anchor, d: number) => {
    const v = Math.max(-30, Math.min(30, (off[a] ?? 0) + d));
    set({ offsets: { ...off, [a]: v } });
  };
  const anyOff = ANCHORS.some((a) => off[a]);
  return (
    <>
      <div className="adj">
        {ANCHORS.map((a) => {
          const v = off[a] ?? 0;
          return (
            <div key={a} className="adj-row">
              <span className="ar">{ANCHOR_LABEL[a].ar}</span>
              <span className="an"><b>{ANCHOR_LABEL[a].ru}</b><small>{v ? _t("{0}{1} мин", v > 0 ? '+' : '−', Math.abs(v)) : _t("по расчёту")}</small></span>
              <button type="button" aria-label={_t("{0} на минуту раньше", ANCHOR_LABEL[a].ru)} onClick={() => bump(a, -1)}>−</button>
              <b className="at">{hhmm(times[a])}</b>
              <button type="button" aria-label={_t("{0} на минуту позже", ANCHOR_LABEL[a].ru)} onClick={() => bump(a, 1)}>+</button>
            </div>
          );
        })}
      </div>
      <p className="tiny">{_t("Сверь время с мечетью рядом и поправь кнопками − и + по минуте.")}{anyOff && <> <button type="button" className="link-btn" onClick={() => set({ offsets: {} })}>{_t("Сбросить поправки")}</button></>}</p>

      <label className="field">
        <span>{_t("Город")}</span>
        <select
          value={PLACES.some((p) => p.name === s.place) ? s.place : ''}
          onChange={(e) => { const p = PLACES.find((x) => x.name === e.target.value); if (p) set({ place: p.name, lat: p.lat, lng: p.lng }); }}
        >
          {!PLACES.some((p) => p.name === s.place) && <option value="">{s.place} ({s.lat.toFixed(2)}, {s.lng.toFixed(2)})</option>}
          {PLACES.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </label>
      <button type="button" className="ghost-btn" onClick={locate}>{_t("Определить по геолокации")}</button>
      {geo && <p className="tiny">{geo}</p>}
      <label className="field">
        <span>{_t("Метод расчёта")}</span>
        <select value={s.method} onChange={(e) => set({ method: e.target.value as MethodId })}>
          {METHODS.map((m) => <option key={m.id} value={m.id}>{m.ru}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{_t("Аср по мазхабу")}</span>
        <select value={s.madhab} onChange={(e) => set({ madhab: e.target.value as 'shafi' | 'hanafi' })}>
          <option value="shafi">{_t("Шафии, Малики, Ханбали")}</option>
          <option value="hanafi">{_t("Ханафи (Аср позже)")}</option>
        </select>
      </label>
    </>
  );
}

function HabitsSettings({ state, update, onEdit }: { state: AppState; update: Props['update']; onEdit: Props['onEdit'] }) {
  const byStatus = (st: Habit['status']) => state.habits.filter((h) => h.status === st);
  const setStatus = (id: string, status: Habit['status']) =>
    update((x) => ({ ...x, habits: x.habits.map((h) => (h.id === id ? { ...h, status } : h)) }));
  const remove = (id: string) => update((x) => ({ ...x, habits: x.habits.filter((h) => h.id !== id) }));
  const used = slotsUsed(state);
  return (
    <>
      <p className="page-sub">{SOFT ? _tj("Активных: {0}. Нажми на привычку, чтобы изменить её.", used) : _tj("{0} из {1} мест занято. Нажми на привычку, чтобы изменить её.", used, activeLimit())}</p>
      <Advice k="habits" n={used} adding={0} />
      <HabitGroup title={_t("Активные")} list={byStatus('active')} onEdit={onEdit} action={(h) => [_t("В архив"), () => setStatus(h.id, 'archived')]} />
      <HabitGroup title={_t("Очередь «Скоро»")} list={byStatus('queued')} onEdit={onEdit} action={(h) => [_t("Убрать"), () => setStatus(h.id, 'archived')]} />
      <HabitGroup
        title={_t("Архив")}
        list={byStatus('archived')}
        onEdit={onEdit}
        action={(h) => (used < activeLimit() ? [_t("Вернуть"), () => setStatus(h.id, 'active')] : [_t("Удалить"), () => remove(h.id)])}
      />
      {!state.habits.length && <p className="tiny">{_t("Привычек пока нет. Добавь первую на экране «Сегодня».")}</p>}
    </>
  );
}

function WordsSettings({ s, set }: { s: AppState['settings']; set: SetFn }) {
  const mode = s.words ?? 'calm';
  const sex = s.me ?? '';
  return (
    <>
      <p className="page-sub">{_t("Исламские фразы на твои дела, аяты и хадисы с источником, ответы братьям и сёстрам в Круге.")}</p>
      <h2 className="sub-h">{_t("Я")}</h2>
      <div className="seg3" role="radiogroup" aria-label={_t("Я")}>
        {([['m', _t("Брат")], ['f', _t("Сестра")]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={sex === v} onClick={() => set({ me: v })}>{l}</button>
        ))}
      </div>
      <p className="tiny">{_tj("От этого зависят формы: «{0}», «БаракАллаху {1}».", sex === 'f' ? _t("выполнила") : _t("выполнил"), sex === 'f' ? _t("фики") : _t("фик"))}</p>
      <h2 className="sub-h">{_t("Как часто")}</h2>
      <div className="seg3" role="radiogroup" aria-label={_t("Как часто")}>
        {([['normal', _t("Обычно")], ['calm', _t("Спокойно")], ['phrases', _t("Только фразы")]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => set({ words: v })}>{l}</button>
        ))}
      </div>
      <p className="tiny">{_tj("{0} Коран, Садака и другие разделы встречают одним напоминанием в день. Внизу экранов Сегодня и Цели есть напоминание дня, его можно скрыть. Один и тот же текст не повторяется чаще раза в неделю.", mode === 'normal' ? _t("Короткая фраза на каждое дело, до 3 аятов или хадисов в день.") : mode === 'calm' ? _t("Короткая фраза на дело, аят или хадис изредка, не больше 2 в день.") : _t("Только короткие фразы: Альхамдулиллях, МашаАллах. Без аятов и хадисов."))}</p>
      <div className="wc" style={{ margin: '14px 0' }}>
        <div className="wc-top"><em>{_t("Хадис")}</em></div>
        <p>{_t("Самые любимые дела у Аллаха — самые постоянные, даже если их мало.")}</p>
        <small className="wd-src">{_t("аль-Бухари, 6464; Муслим, 783")}</small>
      </div>
    </>
  );
}

/** Switching the language reloads the app: every screen reads it once at start. */
function LangSettings({ s, set }: { s: AppState['settings']; set: SetFn }) {
  const pick = (lang: 'ru' | 'en') => {
    if (lang === LANG) return;
    set({ lang });
    setTimeout(() => location.reload(), 200);
  };
  return (
    <>
      <div className="seg3" role="radiogroup" aria-label="Язык · Language" style={{ gridTemplateColumns: '1fr 1fr' }}>
        {([['ru', 'Русский'], ['en', 'English']] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={LANG === v} onClick={() => pick(v)}>{l}</button>
        ))}
      </div>
      <p className="tiny">{_t("Весь интерфейс, напоминания Рамадана и даты переключатся на выбранный язык. Твои привычки и заметки останутся как есть.")}</p>
      {s.lang == null && <p className="tiny">{_t("Сейчас язык выбран по языку телефона.")}</p>}
    </>
  );
}

function LookSettings({ s, set }: { s: AppState['settings']; set: SetFn }) {
  const theme = themeMode(s);
  const size = s.textScale ?? 1;
  return (
    <>
      <h2 className="sub-h">{_t("Тема")}</h2>
      <div className="seg3 seg4" role="radiogroup" aria-label={_t("Тема")}>
        {([['prayer', _t("После Магриба")], ['light', _t("Светлая")], ['dark', _t("Тёмная")], ['auto', _t("Как в телефоне")]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => set({ theme: v })}>{l}</button>
        ))}
      </div>
      <p className="tiny">{_t("«После Магриба»: тёмная с Магриба до Фаджра, днём светлая. Переключить можно и на «Сегодня», значок вверху справа.")}</p>
      <h2 className="sub-h">{_t("Размер текста")}</h2>
      <div className="seg3" role="radiogroup" aria-label={_t("Размер текста")}>
        {([[1, _t("Обычный")], [1.1, _t("Крупнее")], [1.2, _t("Крупный")]] as const).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={size === v} onClick={() => set({ textScale: v })} style={{ fontSize: `${14 * v}px` }}>{l}</button>
        ))}
      </div>
      <p className="tiny">{_t("Настройки сохраняются на этом устройстве.")}</p>
    </>
  );
}

function RemindPage({ s, set, times }: { s: AppState['settings']; set: SetFn; times: DayTimes }) {
  const [, tick] = useState(0);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const r = { ...DEFAULT_PREFS, ...s.reminders };
  const setR = (patch: Partial<typeof r>) => set({ reminders: { ...r, ...patch } });
  const standalone = isStandalone();
  const ios = isIOS();

  const turnOn = async () => {
    setBusy(true); setMsg('');
    try {
      const e = await enablePush(s, { ...r, on: true });
      if (!e) { setR({ on: true }); setMsg(_t("Готово. Первое напоминание придёт к ближайшему намазу.")); }
      else if (e === 'ios-install') setMsg(_t("На iPhone напоминания работают только после установки на экран «Домой». Сначала установи приложение, как написано выше."));
      else if (e === 'denied') setMsg(_t("Уведомления запрещены. Разреши их для этого сайта в настройках браузера или телефона и попробуй снова."));
      else setMsg(_t("Этот браузер не умеет присылать напоминания. Попробуй Chrome на Android или установи приложение на iPhone."));
    } catch { setMsg(_t("Не получилось связаться с сервером. Проверь интернет и попробуй ещё раз.")); }
    setBusy(false);
  };
  const turnOff = async () => { setBusy(true); await disablePush(); setR({ on: false }); setMsg(_t("Напоминания выключены.")); setBusy(false); };
  const togglePrayer = (a: Anchor) => setR({ prayers: r.prayers.includes(a) ? r.prayers.filter((x) => x !== a) : ANCHORS.filter((x) => x === a || r.prayers.includes(x)) });

  return (
    <>
      <div className="inst">
        {standalone ? (
          <p><b>{_t("✓ Приложение установлено.")}</b>{_t(" Оно открывается с экрана телефона, как обычное приложение.")}</p>
        ) : canPrompt() ? (
          <>
            <p><b>{_t("Установи Living Muslim на телефон.")}</b>{_t(" Иконка на экране, открывается без браузера и работает без интернета.")}</p>
            <button type="button" className="pri-btn big-btn" onClick={() => promptInstall()}>{_t("Установить")}</button>
          </>
        ) : ios ? (
          <>
            <p><b>{_t("Установи на iPhone в два касания.")}</b>{_t(" Без этого iPhone не присылает напоминания.")}</p>
            <ol><li>{_t("Открой сайт в Safari и нажми ")}<b>{_t("Поделиться")}</b>{_t(" (квадрат со стрелкой внизу экрана).")}</li><li>{_t("Выбери ")}<b>{_t("«На экран „Домой“»")}</b>{_t(" и нажми «Добавить».")}</li><li>{_t("Открой Living Muslim с иконки и вернись сюда.")}</li></ol>
          </>
        ) : (
          <>
            <p><b>{_t("Установи на телефон.")}</b>{_t(" В Chrome открой меню ")}<b>⋮</b>{_t(" и выбери ")}<b>{_t("«Установить приложение»")}</b>{_t(" или «Добавить на главный экран».")}</p>
          </>
        )}
      </div>

      <h2 className="sub-h">{_t("Мои дела и курсы")}</h2>
      <label className="check-row"><input type="checkbox" checked={r.habits !== false} onChange={(e) => setR({ habits: e.target.checked })} />{_t("Привычки после намаза: через 25 минут, если дело ещё не отмечено. Не больше 3 в день, Коран первым.")}</label>
      <label className="check-row"><input type="checkbox" checked={r.courses !== false} onChange={(e) => setR({ courses: e.target.checked })} />{_t("Когда выходит новый курс")}</label>
      <label className="check-row"><input type="checkbox" checked={r.chat !== false} onChange={(e) => setR({ chat: e.target.checked })} />{_t("Новые сообщения в кругу (во время намаза ждут)")}</label>

      <h2 className="sub-h">{_t("Напоминания о намазах")}</h2>
      <div className="chips5">
        {ANCHORS.map((a) => (
          <button key={a} type="button" aria-pressed={r.prayers.includes(a)} onClick={() => togglePrayer(a)}>
            <span className="ar">{ANCHOR_LABEL[a].ar}</span>{ANCHOR_LABEL[a].ru}<small>{hhmm(times[a])}</small>
          </button>
        ))}
      </div>
      <label className="field">
        <span>{_t("Когда напоминать")}</span>
        <select value={r.before} onChange={(e) => setR({ before: Number(e.target.value) })}>
          <option value={0}>{_t("В момент намаза")}</option>
          <option value={5}>{_t("За 5 минут")}</option>
          <option value={10}>{_t("За 10 минут")}</option>
          <option value={15}>{_t("За 15 минут")}</option>
          <option value={30}>{_t("За 30 минут")}</option>
        </select>
      </label>
      <label className="field">
        <span>{_t("Вечерняя мухасаба")}</span>
        <select value={r.muhasaba} onChange={(e) => setR({ muhasaba: e.target.value })}>
          <option value="">{_t("Не напоминать")}</option>
          {['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00'].map((t) => <option key={t} value={t}>{_tj("В {0}", t)}</option>)}
        </select>
      </label>

      <h2 className="sub-h">{_t("Рамадан")}</h2>
      <p className="tiny">{_t("Приходят только в Рамадан, на языке приложения (Профиль → Язык).")}</p>
      <RamadanPushFields l={s.lang ?? 'ru'} prefs={r} onChange={(x) => setR({ ramadan: x })} />

      {r.on ? (
        <button type="button" className="ghost-btn" disabled={busy} onClick={turnOff}>{_t("Выключить напоминания")}</button>
      ) : (
        <button type="button" className="pri-btn big-btn" disabled={busy} onClick={turnOn}>{busy ? _t("Включаю…") : _t("Включить напоминания")}</button>
      )}
      {msg && <p className="tiny">{msg}</p>}
      {!pushSupported() && !msg && <p className="tiny">{ios && !standalone ? _t("На iPhone сначала установи приложение на экран «Домой».") : _t("В этом браузере напоминания могут не работать.")}</p>}
      <p className="tiny">{_t("Сервер знает только твой город, время намазов и сколько дел ждёт после каждого намаза. Названия привычек и заметки остаются на телефоне.")}</p>
    </>
  );
}

function DataSettings({ state, replace }: { state: AppState; replace: Props['replace'] }) {
  const [msg, setMsg] = useState('');
  const [wipe, setWipe] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const download = () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `living-muslim-${dayKey(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg(_t("Файл сохранён. Храни его в надёжном месте, например в облаке телефона."));
  };
  const load = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as AppState;
      if (d.version !== 1 || !Array.isArray(d.habits)) throw new Error();
      if (!confirm(_t("Заменить все данные на этом устройстве данными из файла?"))) return;
      replace({ ...initialState(), ...d });
      setMsg(_t("Данные загружены из файла."));
    } catch { setMsg(_t("Это не файл резервной копии Living Muslim.")); }
  };

  return (
    <>
      <p className="page-sub">{_t("Привычки, отметки и заметки хранятся на этом устройстве. Сохраняй резервную копию, чтобы не потерять их при смене телефона.")}</p>
      <div className="row2 light">
        <button type="button" onClick={download}>{_t("Скачать копию")}</button>
        <button type="button" onClick={() => file.current?.click()}>{_t("Загрузить из файла")}</button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
      {msg && <p className="tiny">{msg}</p>}
      <p className="tiny">{_t("Синхронизация между устройствами появится в Pro.")}</p>

      <h2 className="sub-h">{_t("Удалить всё")}</h2>
      <p className="tiny">{_t("Сотрёт все привычки, отметки и заметки на этом устройстве. Отменить нельзя. Чтобы подтвердить, напиши слово УДАЛИТЬ.")}</p>
      <div className="row2">
        <input className="wipe" value={wipe} onChange={(e) => setWipe(e.target.value)} placeholder={_t("УДАЛИТЬ")} aria-label={_t("Подтверждение удаления")} />
        <button type="button" className="danger" disabled={wipe.trim().toUpperCase() !== _t("УДАЛИТЬ")} onClick={() => { replace(initialState()); setWipe(''); setMsg(_t("Всё очищено.")); }}>{_t("Стереть")}</button>
      </div>
    </>
  );
}

function HelpPage() {
  const [open, setOpen] = useState(false);
  const url = typeof location !== 'undefined' && !onClaude ? location.origin + '/' : 'https://living-muslim.vercel.app/';
  const text = _t("Living Muslim: привычки вокруг пяти намазов, без рекламы и без вины за пропуски.");
  return (
    <div className="menu">
      <button type="button" className="menu-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="mi" aria-hidden="true">💌</span>
        <span className="mt"><b>{_t("Поделиться приложением")}</b><small>{_t("Садака джария: за каждого, кто начнёт молиться вовремя")}</small></span>
        <i aria-hidden="true">{open ? '⌃' : '›'}</i>
      </button>
      {open && <div className="menu-share"><ShareRow text={text} url={url} /></div>}
      {SUPPORT_EMAIL && (
        <a className="menu-row" href={`mailto:${SUPPORT_EMAIL}?subject=Living%20Muslim`}>
          <span className="mi" aria-hidden="true">✉️</span>
          <span className="mt"><b>{_t("Написать нам")}</b><small>{_t("Идеи, ошибки, вопросы")}</small></span>
          <i aria-hidden="true">›</i>
        </a>
      )}
      <a className="menu-row" href="/privacy.html" target="_blank" rel="noopener">
        <span className="mi" aria-hidden="true">🔒</span>
        <span className="mt"><b>{_t("Конфиденциальность")}</b><small>{_t("Что мы храним и что нет")}</small></span>
        <i aria-hidden="true">›</i>
      </a>
    </div>
  );
}

function HabitGroup({ title, list, onEdit, action }: {
  title: string; list: Habit[]; onEdit: (h: Habit) => void; action: (h: Habit) => [string, () => void];
}) {
  if (!list.length) return null;
  return (
    <div className="hgroup">
      <h4>{title}</h4>
      {list.map((h) => {
        const [label, fn] = action(h);
        return (
          <div className="hg" key={h.id} data-sphere={h.sphere}>
            <i />
            <button type="button" className="hg-name" onClick={() => onEdit(h)}>
              {h.action}<small>{ANCHOR_LABEL[h.anchor].after}{h.formed ? _t(" · закреплена") : ''}</small>
            </button>
            <button type="button" className="hg-act" onClick={fn}>{label}</button>
          </div>
        );
      })}
    </div>
  );
}

/** Email account: who is signed in, or a way to sign in. Hidden inside claude.ai, where there is no site to sign in on. */
function AccountCard() {
  const me = authMe();
  if (typeof location !== 'undefined' && /claude|anthropic/.test(location.hostname)) return null;
  if (!me) {
    return (
      <a className="acct" href={signInUrl}>
        <span><b>{_t("Войти по почте")}</b><small>{_t("Чтобы не потерять данные и получать новости приложения")}</small></span>
        <i aria-hidden="true">›</i>
      </a>
    );
  }
  return (
    <div className="acct">
      <span><b>{me.email}</b><small>{_t("Ты вошёл по почте")}</small></span>
      <button type="button" className="link-btn" onClick={async () => {
        if (!confirm(_t("Выйти из аккаунта на этом устройстве? Круги и профиль вернутся, когда снова войдёшь по этой почте."))) return;
        const wipe = confirm(_t("Удалить с этого телефона и твои привычки, намазы и заметки? Нажми «Отмена», если телефон только твой и их надо оставить."));
        await signOut(); forgetIdentity();
        if (wipe) { try { Object.keys(localStorage).filter((k) => k.startsWith('lm.') || k === 'qadam.v1' || k === 'istiqama.v1').forEach((k) => localStorage.removeItem(k)); } catch { /* */ } }
        location.replace(wipe ? '/?home' : '/app/'); // a wiped phone opens the sign-up page for the next person
      }}>{_t("Выйти")}</button>
    </div>
  );
}
