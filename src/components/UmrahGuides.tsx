// «Люди → Гиды»: verified umrah guides. The list with filters, a guide's profile (verified by Living Muslim,
// services, reviews, «Позвать в поездку»), the application «Стать гидом» in 5 steps, and my own guide card
// with the calls to me. Money goes from person to guide directly: the app never holds it.
import { useEffect, useState } from 'react';
import { _t, _tj } from '../i18n';
import { openPerson } from '../person';
import { shrink } from '../foodphoto';
import {
  hideContacts as hc, guideAnswer, guideApply, guideCall, guideGet, guideMine, guidePause, guideReport, guideReview,
  type Apply, type Guide, type Kind, type GuideFull, type MyGuide, type Place, type Service,
} from '../guides';

const ini = (n: string) => { const w = n.trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '').slice(0, 2)).toUpperCase() || '؟'; };
const PLACE = (): Record<Place, string> => ({ makkah: _t("🕋 Сейчас в Мекке"), madinah: _t("🌴 Сейчас в Медине"), fly: _t("✈ Готов вылететь") });
const KIND = (): Record<Kind, string> => ({ guide: _t("Гид на месте"), mentor: _t("Наставник") });
const placeLine = (g: Guide) => g.kind === 'mentor' ? _t("💻 Онлайн до поездки") + (g.free ? ` · ${g.free}` : '') : g.place === 'fly'
  ? (g.city ? _tj("✈ Вылетит из {0}", g.city) : _t("✈ Готов вылететь")) + (g.free ? ` · ${g.free}` : '')
  : PLACE()[g.place] + (g.until ? _tj(" · до {0}", g.until) : '');
const plur = (n: number, a: string, b: string, c: string) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
const price = (s: Service) => `€${s.price}${s.per ? ` / ${s.per}` : ''}`;

function Face({ g, big }: { g: Pick<Guide, 'name' | 'color'>; big?: boolean }) {
  return <span className={`ug-face${big ? ' big' : ''}`} style={{ background: g.color || 'var(--green-2)' }}>{ini(g.name)}<i aria-label={_t("проверен")}>✓</i></span>;
}

type Filter = '' | Kind | 'sisters' | string;
const dmy = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(_t("ru-RU"), { day: 'numeric', month: 'long', year: 'numeric' }) : '');
const Badge = ({ onClick }: { onClick?: () => void }) => <span className="ug-vb" role={onClick ? 'button' : undefined} onClick={onClick}>{_t("✓ Документы проверены")}{onClick ? ' ⓘ' : ''}</span>;

/** The whole «Гиды» pane inside «Люди». */
export function GuidesPane({ list, reload, code, becomeFirst }: { list: Guide[] | null; reload: () => void; code: string | null; becomeFirst?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [become, setBecome] = useState(Boolean(becomeFirst));
  const [mine, setMine] = useState<MyGuide | null | undefined>(undefined);
  const [f, setF] = useState<Filter>('');
  const loadMine = () => guideMine().then((m) => setMine(m ?? null));
  useEffect(() => { loadMine(); }, []);
  if (become && mine === undefined) return <p className="tiny">{_t("Загружаю…")}</p>;
  if (become) return <BecomeGuide mine={mine ?? null} onBack={() => { setBecome(false); loadMine(); }} />;
  if (open) return <GuideProfile uid={open} code={code} onBack={() => { setOpen(null); reload(); }} />;
  if (!list) return <p className="tiny">{_t("Загружаю гидов…")}</p>;
  const langs = Array.from(new Set(list.flatMap((g) => g.langs))).slice(0, 4);
  const shown = list.filter((g) => !f || (f === 'sisters' ? g.sisters : f === 'guide' || f === 'mentor' ? (g.kind ?? 'guide') === f : g.langs.includes(f)));
  const chips: [Filter, string][] = [['', _t("Все")], ['guide', _t("🕋 Гид на месте")], ['mentor', _t("💻 Наставник онлайн")], ...langs.map((l): [Filter, string] => [l, l]), ['sisters', _t("Для сестёр")]];
  return (
    <div className="ug">
      {mine && <MyGuideCard g={mine} onEdit={() => setBecome(true)} reload={loadMine} />}
      {list.length > 0 && (
        <div className="uo-chips ug-chips">{chips.map(([k, t]) => <button key={k || 'all'} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{t}</button>)}</div>
      )}
      {!shown.length && (
        <div className="uo-empty">
          <b>{list.length ? _t("Таких гидов пока нет") : _t("Гиды скоро появятся")}</b>
          <small>{_t("Мы проверяем каждого: диплом, лицензию, рекомендацию имама. Только потом гид виден здесь.")}</small>
        </div>
      )}
      {shown.map((g) => (
        <button key={g.uid} type="button" className="ug-card" onClick={() => setOpen(g.uid)}>
          <Face g={g} />
          <span className="ug-main">
            <b>{g.name}<em className={`ug-kind ${g.kind ?? 'guide'}`}>{KIND()[g.kind ?? 'guide']}</em>{g.sisters && <em className="ug-sis">{_t("для сестёр")}</em>}</b>
            <small>{g.school}{g.field ? ` · ${g.field}` : ''}</small>
            <small>{[g.years ? _tj("{0} {1} в знании", g.years, plur(g.years, _t("год"), _t("года"), _t("лет"))) : '', g.groups ? _tj("{0} групп", g.groups) : '', g.reviews ? `★ ${g.stars} (${g.reviews})` : ''].filter(Boolean).join(' · ')}</small>
            <span className="ug-tags"><Badge /><i className={`ug-tag ${g.kind === 'mentor' ? 'fly' : g.place}`}>{placeLine(g)}</i></span>
          </span>
          <span className="ug-side">
            <small>{g.langs.join(' · ')}</small>
            {g.services[0] && <><b>€{g.services[0].price}</b><small>{g.services[0].per}</small></>}
          </span>
        </button>
      ))}
      <p className="tiny ug-note">{_t("Сначала гиды с действующей лицензией КСА, потом по отзывам. «Документы проверены» значит: мы посмотрели документы. Это не гарантия качества услуг. Отзывы только от тех, кого гид принял в поездку через приложение. Оплата гиду напрямую, мы деньги не держим.")}</p>
      {mine === null && <button type="button" className="ghost-btn ug-become" onClick={() => setBecome(true)}>{_t("Я гид · подать заявку")}</button>}
    </div>
  );
}

/** My own guide card: status of the check, pause, and the calls to me. */
function MyGuideCard({ g, onEdit, reload }: { g: MyGuide; onEdit: () => void; reload: () => void }) {
  const [busy, setBusy] = useState('');
  const answer = async (id: string, yes: boolean) => { setBusy(id); await guideAnswer(id, yes); setBusy(''); reload(); };
  const st = g.status === 'pending' ? _t("Заявка на проверке, обычно 2–3 дня. Пока профиль никто не видит.")
    : g.status === 'no' ? _tj("Заявка не прошла проверку{0}. Можно исправить и отправить снова.", g.note ? `: ${g.note}` : '')
    : g.paused ? _t("Ты на паузе: в списке гидов тебя не видно.") : _t("✓ Ты в списке гидов.");
  const pending = g.calls.filter((c) => c.status === 'pending');
  return (
    <div className="ug-mine">
      <div className="ug-mine-h"><b>{_t("Мой профиль гида")}</b><button type="button" className="link-btn" onClick={onEdit}>{_t("Изменить")}</button></div>
      <small>{st}</small>
      {g.status === 'ok' && <button type="button" className="link-btn" onClick={async () => { await guidePause(!g.paused); reload(); }}>{g.paused ? _t("Снять паузу") : _t("Поставить на паузу")}</button>}
      {pending.map((c) => (
        <div key={c.id} className="ug-call">
          <b>{_tj("{0} зовёт тебя в поездку", c.name)}</b>
          {c.note && <p>«{hc(c.note)}»</p>}
          <div className="uo-b">
            <button type="button" className="gold-btn" disabled={busy === c.id} onClick={() => answer(c.id, true)}>{_t("Принять")}</button>
            <button type="button" className="ghost-btn" disabled={busy === c.id} onClick={() => answer(c.id, false)}>{_t("Не в этот раз")}</button>
            <button type="button" className="link-btn" onClick={() => openPerson(c.uid)}>{_t("Написать")}</button>
          </div>
        </div>
      ))}
      {g.calls.filter((c) => c.status === 'accepted').slice(0, 3).map((c) => (
        <small key={c.id} className="ug-acc">{_tj("✓ {0}: ты принял, приглашение в круг поездки отправлено", c.name)}</small>
      ))}
    </div>
  );
}

function GuideProfile({ uid, code, onBack }: { uid: string; code: string | null; onBack: () => void }) {
  const [g, setG] = useState<GuideFull | null | undefined>(undefined);
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [stars, setStars] = useState(5);
  const [text, setText] = useState('');
  const [ver, setVer] = useState(false);
  const [warn, setWarn] = useState<null | (() => void)>(null);
  const [rep, setRep] = useState<'' | 'open' | 'sent'>('');
  const [repText, setRepText] = useState('');
  const load = () => guideGet(uid).then((r) => { setG(r); if (r?.my_review) { setStars(r.my_review.stars); setText(r.my_review.text); } });
  useEffect(() => { load(); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const back = <button type="button" className="link-btn ug-back" onClick={onBack}>{_t("← Все гиды")}</button>;
  if (g === undefined) return <div className="ug">{back}<p className="tiny">{_t("Загружаю…")}</p></div>;
  if (!g) return <div className="ug">{back}<p className="tiny">{_t("Этот гид сейчас недоступен.")}</p></div>;
  const call = async () => {
    const r = await guideCall(g.uid, code, hc(note));
    setMsg(r === 'ok' ? _tj("✓ Отправлено. {0} ответит здесь же, а если примет, придёт в круг поездки.", g.name)
      : r === 'already' ? _t("Ты уже позвал, ждём ответа.") : r === 'limit' ? _t("Сегодня уже много приглашений. Попробуй завтра.")
      : r === 'closed' ? _t("Гид сейчас не принимает приглашения.") : _t("Не получилось отправить. Проверь интернет."));
    if (r === 'ok') { setAsk(false); load(); }
  };
  const review = async () => { const r = await guideReview(g.uid, stars, hc(text)); setMsg(r === 'ok' ? _t("✓ Спасибо за отзыв") : _t("Не получилось сохранить отзыв.")); if (r === 'ok') load(); };
  const st = g.mine?.status;
  // The warning is shown once before the first message or call to a guide, with one button «Понятно».
  const seen = () => { try { return localStorage.getItem('lm.gWarn') === '1'; } catch { return false; } };
  const gate = (fn: () => void) => () => { if (seen()) fn(); else setWarn(() => fn); };
  const okWarn = () => { try { localStorage.setItem('lm.gWarn', '1'); } catch { /* */ } const fn = warn; setWarn(null); fn?.(); };
  const report = async () => { const r = await guideReport(g.uid, repText); if (r === 'ok') { setRep('sent'); setRepText(''); } else setMsg(r === 'limit' ? _t("Сегодня уже много жалоб. Попробуй завтра.") : _t("Не получилось отправить. Проверь интернет.")); };
  const warning = (
    <div className="ug-warn">
      <b>{_t("Перед тем как договориться")}</b> {_t("Гид самостоятельный, не сотрудник Living Muslim. Мы проверили его документы, но не отвечаем за его услуги. Договариваетесь и платите вы напрямую.")}
      <ul>
        <li>{_t("Не платите всю сумму вперёд, договоритесь об оплате по частям.")}</li>
        <li>{_t("Никому не отдавайте паспорт.")}</li>
        <li>{_t("Визу и пакет умры оформляйте только через лицензированные компании, их можно проверить в Nusuk.")}</li>
        <li>{_t("Если что-то смущает, нажмите «Пожаловаться» ниже.")}</li>
      </ul>
    </div>
  );
  if (warn) return (
    <div className="ug ug-prof">
      {warning}
      <button type="button" className="pri-btn" onClick={okWarn}>{_t("Понятно")}</button>
      <button type="button" className="link-btn" onClick={() => setWarn(null)}>{_t("Назад")}</button>
    </div>
  );
  return (
    <div className="ug ug-prof">
      {back}
      <div className="ug-ph"><Face g={g} big /><span><h2>{g.name}</h2><small>{KIND()[g.kind ?? 'guide']}{g.langs.length ? ` · ${g.langs.join(' · ')}` : ''}</small><span className="ug-tags"><Badge onClick={() => setVer(!ver)} /><i className={`ug-tag ${g.kind === 'mentor' ? 'fly' : g.place}`}>{placeLine(g)}</i></span></span></div>
      {ver && (
        <div className="ug-ver">
          <h4>{g.decided ? _tj("Что мы проверили · {0}", dmy(g.decided)) : _t("Что мы проверили")}</h4>
          <p className={g.checks.diploma ? 'ok' : ''}>{_t("Диплом:")} <b>{g.school}</b>{[g.field, g.grad].filter(Boolean).map((x) => `, ${x}`).join('')}</p>
          {g.license && <p className="ok">{_t("Лицензия гида Минтуризма КСА")}{g.lic_until ? _tj(", действует до {0}", g.lic_until) : ''}</p>}
          {g.imam && <p className={g.checks.imam ? 'ok' : ''}>{_tj("Рекомендация: {0}", hc(g.imam))}</p>}
          <small>{_t("Это проверка документов, а не гарантия качества услуг гида.")}</small>
        </div>
      )}
      <div className="ug-stats">
        <span><b>{g.years}</b><small>{_t("лет в знании")}</small></span>
        <span><b>{g.groups}</b><small>{_t("групп провёл")}</small></span>
        <span><b>{g.reviews ? `★ ${g.stars}` : '—'}</b><small>{g.reviews ? _tj("{0} отзывов", g.reviews) : _t("нет отзывов")}</small></span>
      </div>
      {g.about && <p className="ug-about">{hc(g.about)}</p>}
      {g.services.length > 0 && <div className="ug-serv">{g.services.map((s, i) => <div key={i}><span>{hc(s.t)}</span><small>{price(s)}</small></div>)}</div>}
      {g.list.map((r, i) => <blockquote key={i} className="ug-rev">«{hc(r.text) || '★'.repeat(r.stars)}»<small>{r.name} · ★ {r.stars}</small></blockquote>)}
      {g.free && <div className="ug-free"><b>{_t("Свободен:")}</b> {hc(g.free)}</div>}
      {msg && <p className="uo-msg" role="status">{msg}</p>}
      {g.can_review && (
        <div className="ug-revf">
          <b>{g.my_review ? _t("Твой отзыв") : _t("Оставь отзыв о гиде")}</b>
          <div className="ug-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={n <= stars} onClick={() => setStars(n)}>★</button>)}</div>
          <textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={_t("Что было хорошо, что помогло")} />
          <button type="button" className="pri-btn" onClick={review}>{_t("Сохранить отзыв")}</button>
        </div>
      )}
      {ask && (
        <div className="ug-ask">
          <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={_t("Когда едете, сколько вас, что нужно (обряды, зиярат)")} />
          <small className="tiny">{_t("Номер телефона не пиши: договоритесь в чате приложения.")}</small>
          <button type="button" className="pri-btn" onClick={call}>{_t("Отправить приглашение")}</button>
        </div>
      )}
      {warning}
      <div className="ug-act">
        <button type="button" className="ghost-btn" onClick={gate(() => openPerson(g.uid))}>{_t("✉ Написать")}</button>
        {st === 'pending' ? <span className="uo-sent">{_t("✓ Приглашение отправлено")}</span>
          : st === 'accepted' ? <span className="uo-ok">{_t("✓ Гид принял приглашение")}</span>
          : !ask && <button type="button" className="pri-btn" onClick={gate(() => { setAsk(true); setMsg(''); })}>{_t("Позвать в поездку")}</button>}
      </div>
      {rep === 'sent' ? <p className="uo-msg" role="status">{_t("✓ Жалоба отправлена. Владелец приложения разберётся и, если нужно, скроет профиль.")}</p>
        : rep === 'open' ? (
          <div className="ug-ask">
            <textarea value={repText} maxLength={600} onChange={(e) => setRepText(e.target.value)} placeholder={_t("Что случилось? Например: просил паспорт, требовал всю сумму вперёд")} />
            <button type="button" className="pri-btn" disabled={repText.trim().length < 5} onClick={report}>{_t("Отправить жалобу")}</button>
          </div>
        ) : <button type="button" className="link-btn ug-rep" onClick={() => setRep('open')}>{_t("⚑ Пожаловаться")}</button>}
    </div>
  );
}

const EMPTY: Apply = { kind: 'guide', lic_until: '', terms: false, consent: false, name: '', langs: ['RU'], about: '', school: '', field: '', grad: '', years: '', groups: '', place: 'fly', city: '', until: '', free: '', services: [{ t: '', price: 0, per: _t("день") }], sisters: false, license: true, imam: '' };
const LANGS = ['RU', 'EN', 'AR', 'TT', 'UZ', 'KZ', 'TR'];

/** The terms for guides and mentors (legal thread, 21.11), shown in full from the application. */
const TERMS = () => [
  _t("Living Muslim (НАВО МОТЪРС БЪЛГАРИЯ ЕООД, ЕИК 200117125) — площадка, которая помогает паломникам найти гида или наставника. Мы не туроператор, не сторона вашего договора с паломником и не принимаем за вас оплату."),
  _t("Вы оказываете услуги самостоятельно и сами отвечаете за их качество, безопасность, цены, налоги и соблюдение законов страны, где работаете, в том числе Саудовской Аравии."),
  _t("Вы подтверждаете, что документы подлинные и принадлежат вам. Если лицензия истекла или отозвана, сообщите нам в течение 3 дней."),
  _t("Гид на месте работает только с действующей лицензией КСА. Наставник не предлагает платное сопровождение на месте."),
  _t("Нельзя: брать у паломников паспорта, обещать визу или «гарантированную умру», давать неверные сведения о себе, просить отзывы за вознаграждение."),
  _t("Отзывы оставляют только паломники, которых вы приняли в поездку через приложение. За критику отзывы не удаляем. Удаляем оскорбления и доказанную ложь."),
  _t("Мы можем скрыть или убрать профиль, если документы недействительны, есть обоснованные жалобы или нарушены условия. Причину сообщим письменно, вы можете ответить и попросить пересмотра."),
  _t("Порядок в списке: сначала гиды с действующей лицензией, затем по отзывам и числу поездок. Если появится платный «Гид Pro», который поднимает выше, он будет помечен."),
  _t("Если введём плату за проверку или «Гид Pro», либо изменим условия, сообщим минимум за 15 дней."),
  _t("Применяется право Болгарии. Споры сначала решаем переговорами."),
];
const CONSENT = () => _t("Я соглашаюсь, что Living Muslim (НАВО МОТЪРС БЪЛГАРИЯ ЕООД) обработает фото моих документов (диплом или иджаза, лицензия КСА, рекомендация) только для проверки заявки. Я понимаю, что диплом исламского учебного заведения может указывать на мои религиозные убеждения, и даю на это явное согласие. Фото видит только владелец приложения. Они хранятся на серверах в ЕС (Ирландия) и удаляются сразу после решения по заявке, а без решения не позже 30 дней. Остаётся только отметка: что проверено и когда. Я могу отозвать согласие, написав нам, тогда заявка закрывается.");

/** «Стать гидом»: kind, about, knowledge, where and services, check and consent; then the owner's check. */
function BecomeGuide({ mine, onBack }: { mine: MyGuide | null; onBack: () => void }) {
  const [p, setP] = useState<Apply>(() => mine ? {
    kind: mine.kind ?? 'guide', lic_until: mine.lic_until ?? '', terms: false, consent: false,
    name: mine.name, langs: mine.langs, about: mine.about, school: mine.school, field: mine.field, grad: mine.grad ? String(mine.grad) : '',
    years: String(mine.years || ''), groups: String(mine.groups || ''), place: mine.place, city: mine.city, until: mine.until, free: mine.free,
    services: mine.services.length ? mine.services : EMPTY.services, sisters: mine.sisters, license: (mine.kind ?? 'guide') === 'guide', imam: mine.imam,
  } : EMPTY);
  const [step, setStep] = useState(0);
  const [dip, setDip] = useState<string | null>(null);
  const [lic, setLic] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<'' | 'terms' | 'consent'>('');
  const set = (x: Partial<Apply>) => setP((o) => ({ ...o, ...x }));
  const guide = p.kind === 'guide';
  const hadLic = Boolean(mine && (mine.kind ?? 'guide') === 'guide' && (mine.license || mine.status === 'pending'));
  const STEPS = [
    [_t("Кем ты будешь"), _t("гид на месте или наставник онлайн")],
    [_t("О себе"), _t("имя, языки, коротко о себе")],
    [_t("Знание"), _t("университет или медресе, год, специальность, сколько лет")],
    [_t("Где я и услуги"), guide ? _t("в Мекке, в Медине или готов вылететь; цены") : _t("свободные даты, уроки и цены")],
    [_t("Проверка и согласие"), guide ? _t("диплом, лицензия КСА, рекомендация имама, две галочки") : _t("диплом, рекомендация имама, две галочки")],
  ];
  const okStep = [true, p.name.trim().length > 1 && p.langs.length > 0, p.school.trim().length >= 3, p.services.some((s) => s.t.trim()),
    Boolean(dip || mine?.has_diploma) && (!guide || Boolean(lic || hadLic)) && p.terms && p.consent];
  const photo = async (f: File | undefined, to: (s: string) => void) => { if (!f) return; try { to((await shrink(f, 1200)).data); } catch { setMsg(_t("Не получилось прочитать фото.")); } };
  const send = async () => {
    setBusy(true);
    const r = await guideApply({ ...p, license: guide, about: hc(p.about), free: hc(p.free), services: p.services.filter((s) => s.t.trim()).map((s) => ({ ...s, t: hc(s.t) })) }, dip, guide ? lic : null);
    setBusy(false);
    if (r === 'ok') { setMsg(_t("✓ Заявка отправлена. Проверяем 2–3 дня, ответ придёт сюда же.")); setTimeout(onBack, 1500); }
    else setMsg(r === 'school' ? _t("Впиши, где ты учился.") : r === 'big' ? _t("Фото слишком большое, выбери другое.")
      : r === 'license' ? _t("Для гида на месте нужно фото действующей лицензии КСА.") : r === 'consent' ? _t("Отметь обе галочки.") : _t("Не получилось отправить. Проверь интернет."));
  };
  const svc = (i: number, x: Partial<Service>) => set({ services: p.services.map((s, j) => (j === i ? { ...s, ...x } : s)) });
  const body = [
    <>
      {([['guide', '🕋', _t("Гид на месте"), _t("Сопровождаю за плату в Мекке и Медине. Нужна действующая лицензия гида Минтуризма КСА или мутаввифа. Без неё заявку не принимаем.")],
        ['mentor', '💻', _t("Наставник онлайн"), _t("Готовлю к умре до поездки: уроки, ответы на вопросы. Лицензия КСА не нужна. Платное сопровождение на месте не предлагаю.")]] as [Kind, string, string, string][]).map(([k, ic, t, d]) => (
        <button key={k} type="button" className={`ug-kc${p.kind === k ? ' on' : ''}`} aria-pressed={p.kind === k} onClick={() => set({ kind: k, license: k === 'guide' })}>
          <span className="ic">{ic}</span><span><b>{t}</b><small>{d}</small></span>
        </button>
      ))}
    </>,
    <>
      <label className="ug-f"><small>{_t("Имя, как тебя увидят")}</small><input value={p.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="uo-chips">{LANGS.map((l) => <button key={l} type="button" aria-pressed={p.langs.includes(l)} onClick={() => set({ langs: p.langs.includes(l) ? p.langs.filter((x) => x !== l) : [...p.langs, l] })}>{l}</button>)}</div>
      <label className="ug-f"><small>{_t("Коротко о себе")}</small><textarea value={p.about} maxLength={600} onChange={(e) => set({ about: e.target.value })} /></label>
      <p className="tiny">{_t("Номера телефонов, почту и ссылки на мессенджеры мы скрываем: люди пишут тебе через чат приложения.")}</p>
      <label className="chk"><input type="checkbox" checked={p.sisters} onChange={(e) => set({ sisters: e.target.checked })} /> {_t("Я гид для сестёр")}</label>
    </>,
    <>
      <label className="ug-f"><small>{_t("Университет или медресе")}</small><input value={p.school} maxLength={120} placeholder={_t("Исламский университет Медины")} onChange={(e) => set({ school: e.target.value })} /></label>
      <label className="ug-f"><small>{_t("Специальность")}</small><input value={p.field} maxLength={80} placeholder={_t("шариат, хадис, фикх, хафиз")} onChange={(e) => set({ field: e.target.value })} /></label>
      <div className="ug-row">
        <label className="ug-f"><small>{_t("Год выпуска")}</small><input inputMode="numeric" value={p.grad} onChange={(e) => set({ grad: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
        <label className="ug-f"><small>{_t("Лет в знании")}</small><input inputMode="numeric" value={p.years} onChange={(e) => set({ years: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
        <label className="ug-f"><small>{_t("Групп провёл")}</small><input inputMode="numeric" value={p.groups} onChange={(e) => set({ groups: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
      </div>
    </>,
    <>
      {guide && <>
        <div className="uo-chips ug-wrap">{([['makkah', _t("🕋 Живу в Мекке")], ['madinah', _t("🌴 Живу в Медине")], ['fly', _t("✈ Готов вылететь")]] as [Place, string][]).map(([k, t]) => <button key={k} type="button" aria-pressed={p.place === k} onClick={() => set({ place: k })}>{t}</button>)}</div>
        {p.place === 'fly'
          ? <label className="ug-f"><small>{_t("Из какого города")}</small><input value={p.city} maxLength={60} placeholder={_t("Казань")} onChange={(e) => set({ city: e.target.value })} /></label>
          : <label className="ug-f"><small>{_t("В КСА до")}</small><input value={p.until} maxLength={20} placeholder={_t("20 марта 2027")} onChange={(e) => set({ until: e.target.value })} /></label>}
      </>}
      <label className="ug-f"><small>{_t("Свободные даты")}</small><input value={p.free} maxLength={120} placeholder={_t("1–10 февраля · 15–25 марта")} onChange={(e) => set({ free: e.target.value })} /></label>
      {p.services.map((s, i) => (
        <div key={i} className="ug-svc">
          <input value={s.t} maxLength={60} placeholder={guide ? _t("Сопровождение обрядов умры") : _t("Урок онлайн до поездки")} onChange={(e) => svc(i, { t: e.target.value })} />
          <input inputMode="numeric" value={s.price || ''} placeholder="€" onChange={(e) => svc(i, { price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
          <input value={s.per} maxLength={20} placeholder={_t("день")} onChange={(e) => svc(i, { per: e.target.value })} />
        </div>
      ))}
      {p.services.length < 6 && <button type="button" className="link-btn" onClick={() => set({ services: [...p.services, { t: '', price: 0, per: _t("час") }] })}>{_t("+ Ещё услуга")}</button>}
      <p className="tiny">{_t("Оплату ты получаешь напрямую от людей. Приложение деньги не держит и процент не берёт.")}</p>
    </>,
    <>
      <label className="ug-f ug-file"><small>{_t("Фото диплома или иджазы")}</small><input type="file" accept="image/*" onChange={(e) => photo(e.target.files?.[0], setDip)} />{(dip || mine?.has_diploma) && <em>{_t("✓ есть")}</em>}</label>
      {guide && <>
        <label className="ug-f ug-file"><small>{_t("Фото лицензии КСА · обязательно")}</small><input type="file" accept="image/*" onChange={(e) => photo(e.target.files?.[0], setLic)} />{(lic || hadLic) && <em>{_t("✓ есть")}</em>}</label>
        <label className="ug-f"><small>{_t("Лицензия действует до")}</small><input value={p.lic_until} maxLength={20} placeholder="03.2027" onChange={(e) => set({ lic_until: e.target.value })} /></label>
      </>}
      <label className="ug-f"><small>{_t("Кто рекомендует: имам, мечеть, контакт (контакт видит только владелец)")}</small><input value={p.imam} maxLength={120} placeholder={_t("имам мечети «Марджани», Казань")} onChange={(e) => set({ imam: e.target.value })} /></label>
      <div className="ug-cbs">
        <label className="ug-cb"><input type="checkbox" checked={p.terms} onChange={(e) => set({ terms: e.target.checked })} />
          <span>{_t("Я принимаю условия для гидов и наставников: Living Muslim только площадка, услуги и оплату я веду сам.")} <button type="button" className="link-btn" onClick={() => setShow(show === 'terms' ? '' : 'terms')}>{_t("Условия")}</button></span></label>
        {show === 'terms' && <ol className="ug-terms">{TERMS().map((t, i) => <li key={i}>{t}</li>)}</ol>}
        <label className="ug-cb"><input type="checkbox" checked={p.consent} onChange={(e) => set({ consent: e.target.checked })} />
          <span>{_t("Я даю явное согласие на обработку фото документов для проверки. Понимаю, что диплом может указывать на мою веру. Фото видит только владелец, хранятся в ЕС и удаляются сразу после решения (не позже 30 дней).")} <button type="button" className="link-btn" onClick={() => setShow(show === 'consent' ? '' : 'consent')}>{_t("Подробнее")}</button></span></label>
        {show === 'consent' && <p className="ug-terms">{CONSENT()}</p>}
      </div>
      <p className="tiny">{_t("Паспорт мы не просим. Отправить заявку можно, когда обе галочки отмечены.")}</p>
    </>,
  ];
  return (
    <div className="ug ug-become-f">
      <button type="button" className="link-btn ug-back" onClick={onBack}>{_t("← Гиды")}</button>
      <h2>{_t("Стать гидом")}</h2>
      <small className="ug-sub">{_t("Заявку проверяем 2–3 дня")}</small>
      <div className="ug-steps">
        {STEPS.map(([t, s], i) => (
          <button key={i} type="button" className={`${i === step ? 'on' : ''}${okStep[i] && i !== step ? ' ok' : ''}`} onClick={() => setStep(i)}>
            <em>{okStep[i] && i !== step ? '✓' : i + 1}</em><span><b>{t}</b><small>{s}</small></span>
          </button>
        ))}
      </div>
      <h4 className="ug-sh">{_tj("Шаг {0} · {1}", step + 1, STEPS[step][0])}</h4>
      {body[step]}
      {msg && <p className="uo-msg" role="status">{msg}</p>}
      <p className="tiny">{_t("Пока заявка на проверке, профиль никто не видит. После проверки появится значок ✓ и тебя найдут в «Гидах».")}</p>
      {step < 4
        ? <button type="button" className="pri-btn ug-next" disabled={!okStep[step]} onClick={() => setStep(step + 1)}>{_t("Дальше →")}</button>
        : <button type="button" className="pri-btn ug-next" disabled={busy || !okStep.every(Boolean)} onClick={send}>{busy ? _t("Отправляю…") : mine ? _t("Сохранить и отправить") : _t("Отправить на проверку")}</button>}
    </div>
  );
}
