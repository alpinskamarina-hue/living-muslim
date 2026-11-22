// The startup circle's «Путь» tab: the path of 5 stages, the idea on one page, the 7-day idea check,
// customer talks, the team vote (with istikhara first), demo day on Thursdays and the weekly pulse.
import { useEffect, useState } from 'react';
import type { BizApi } from '../bizWork';
import { trReady, type Msg } from '../chat';
import { cloudMe } from '../cloud';
import { CHECK_DAYS, IDEA_FIELDS, QUESTIONS, STAGES, checkDay, forecast, isThursday, keyOf, mondayOf, talkSummary, thursdayOf, type Idea, type SuApi, type Vote } from '../startup';
import { askAssistant } from './Assistant';
import { _t, _tj, LOC } from '../i18n';

type Names = Record<string, { name: string } | undefined>;
type Seg = 'path' | 'idea' | 'check' | 'talks' | 'pulse';
interface Props {
  su: SuApi; biz: BizApi; me: string; names: Names; people: string[]; today: string;
  msgs: Msg[];
  /** posts a line into the circle chat (an event card) */
  post: (body: string) => void;
  /** opens the chat tab */
  toChat: () => void;
  code?: string;
  /** voice → text (chat-transcribe.sql); missing until it is run */
  transcribe?: (id: number) => Promise<{ text?: string; err?: string }>;
}
const D = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const first = (names: Names, me: string, id?: string | null) => (!id ? '' : id === me ? _t("Ты") : (names[id]?.name || _t("Участник")).split(' ')[0]);
const dm = (k: string) => D(k).toLocaleDateString(LOC, { day: 'numeric', month: 'short' });
const VOTE_L: Record<Vote, () => string> = { go: () => _t("Делаем"), change: () => _t("Меняем"), stop: () => _t("Стоп") };

export function StartupPane(p: Props) {
  const [seg, setSeg] = useState<Seg>('path');
  const d = p.su.data;
  if (!d) return <p className="tiny bw-load">{_t("Загружаю…")}</p>;
  const S: [Seg, string][] = [['path', _t("Путь")], ['idea', _t("Идея")], ['check', _t("Проверка")], ['talks', _t("Разговоры")], ['pulse', _t("Пульс")]];
  return (
    <div className="bw-pane su-pane">
      <div className="su-seg" role="tablist">
        {S.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={seg === k} onClick={() => { setSeg(k); window.scrollTo(0, 0); }}>{l}</button>)}
      </div>
      {seg === 'path' ? <PathView {...p} go={setSeg} />
        : seg === 'idea' ? <IdeaView {...p} />
          : seg === 'check' ? <CheckView {...p} go={setSeg} />
            : seg === 'talks' ? <TalksView {...p} />
              : <PulseView {...p} />}
    </div>
  );
}

function PathView(p: Props & { go: (s: Seg) => void }) {
  const { su, biz, me, names, people, today, msgs } = p;
  const st = su.data!.state;
  const stages = STAGES();
  const day = checkDay(st.chk, today);
  const ideaN = IDEA_FIELDS().filter((f) => (st.idea[f.k] ?? '').trim()).length;
  const [mentorPick, setMentorPick] = useState(false);
  // what matters now
  const now: { t: string; act?: () => void; btn?: string } = st.stage === 1
    ? (ideaN < 5 ? { t: _tj("Заполнить идею на одной странице: {0} из 5 строк", ideaN), act: () => p.go('idea'), btn: _t("Открыть идею") }
      : { t: _t("Идея готова. Начните проверку за 7 дней"), act: async () => { await su.set({ stage: 2, chk: { start: today, done: {} } }); p.go('check'); }, btn: _t("Начать проверку") })
    : st.stage === 2
      ? (day < 1 ? { t: _t("Начать проверку идеи за 7 дней"), act: async () => { await su.set({ chk: { start: today, done: {} } }); p.go('check'); }, btn: _t("Начать") }
        : day <= 7 ? { t: _tj("День {0} из 7: {1}", day, CHECK_DAYS()[day - 1]), act: () => p.go('check'), btn: _t("Открыть проверку") }
          : { t: _t("Проверка закончилась. Решите командой: делаем, меняем или стоп"), act: () => p.go('check'), btn: _t("К решению") })
      : (() => {
        const t = (biz.data?.tasks ?? []).filter((x) => x.status !== 'done').sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))[0];
        return t ? { t: `📋 ${t.title}${t.owner ? ` · ${first(names, me, t.owner)}` : ''}` } : { t: _t("Добавьте главное дело этой ступени во вкладке «Дела»") };
      })();
  // demo day: voice messages on Thursday
  const thu = isThursday(today) ? today : thursdayOf(today);
  const spoke = [...new Set(msgs.filter((m) => m.kind === 'voice' && !m.deleted && keyOf(new Date(m.at)) === thu).map((m) => m.uid))];
  const mentors = st.mentors.filter((u) => people.includes(u));
  const decisions = (biz.data?.decisions ?? []).slice(0, 4);

  return (
    <>
      <div className="bw-card">
        <span className="bw-k">{_t("Мы здесь")}</span>
        <b className="su-big">{_tj("{0} из 5 · {1}", st.stage, stages[st.stage - 1].t)}</b>
        <div className="bw-bar su-bar"><i style={{ width: `${Math.round(((st.stage - 1) + (st.stage === 2 && day > 0 ? Math.min(7, day) / 7 : 0.15)) / 5 * 100)}%` }} /></div>
        {st.stage === 2 && day > 0 && day <= 7 && <small className="bw-sm">{_tj("День {0} из 7 проверки идеи", day)}</small>}
      </div>
      <div className="bw-card su-steps">
        {stages.map((s, i) => {
          const n = i + 1, cls = n < st.stage ? 'ok' : n === st.stage ? 'now' : '';
          return (
            <div key={n} className={`su-st ${cls}`}>
              <span className="su-dot">{n < st.stage ? '✓' : n}</span>
              <div><b>{s.t}</b><small>{s.sub}</small></div>
            </div>
          );
        })}
        {st.stage >= 3 && st.stage < 5 && (
          <button type="button" className="link-btn su-next" onClick={() => { if (confirm(_tj("Ступень «{0}» пройдена? Круг перейдёт на «{1}».", stages[st.stage - 1].t, stages[st.stage].t))) { su.set({ stage: st.stage + 1 }); p.post(_tj("🪜 Круг перешёл на ступень {0}: «{1}»", st.stage + 1, stages[st.stage].t)); } }}>
            {_tj("Ступень пройдена → «{0}»", stages[st.stage].t)}
          </button>
        )}
      </div>
      <div className="bw-card bw-today su-now">
        <span className="bw-k">{_t("Главное сейчас")}</span>
        <p>{now.t}</p>
        {now.act && <button type="button" className="pri-btn" onClick={now.act}>{now.btn}</button>}
      </div>

      <div className="bw-card su-demo">
        <span className="bw-k">{isThursday(today) ? _t("Демо-день · сегодня") : _t("Демо-день · по четвергам")}</span>
        {isThursday(today) ? (
          <>
            <b>{_t("Каждый — одна минута голосом")}</b>
            <p className="bw-sm">{_t("Что сделал · где застрял · что нужно. Запиши голосом в чат до Магриба.")}</p>
            <p className="bw-sm">{spoke.length ? _tj("Уже записали: {0}", spoke.map((u) => first(names, me, u)).join(', ')) : _t("Пока никто не записал. Начни первым.")}</p>
            {!spoke.includes(me) && <button type="button" className="pri-btn" onClick={() => { p.post(_t("🎙 Демо-день: моя минута ниже. Что сделал · где застрял · что нужно")); p.toChat(); }}>{_t("🎙 Записать свою минуту")}</button>}
          </>
        ) : (
          <p className="bw-sm">{spoke.length
            ? _tj("В четверг {0} записали минуту: {1}. Послушайте в чате и ответьте советом.", dm(thu), spoke.map((u) => first(names, me, u)).join(', '))
            : _t("В четверг каждый записывает в чат минуту голосом: что сделал, где застрял, что нужно. Остальные отвечают советом.")}</p>
        )}
        {spoke.length > 0 && <DemoSum {...p} thu={thu} />}
      </div>

      <div className="bw-card">
        <div className="bw-dech"><span className="bw-k">{_t("Наставник")}</span>{!mentorPick && mentors.length < 5 && <button type="button" className="link-btn" onClick={() => setMentorPick(true)}>{_t("+ Отметить")}</button>}</div>
        {mentors.length ? mentors.map((u) => (
          <div key={u} className="su-mentor"><span>🎓 {names[u]?.name || _t("Участник")}{u === me ? ` (${_t("ты")})` : ''}</span><button type="button" className="link-btn" aria-label={_t("Убрать")} onClick={() => su.set({ mentors: st.mentors.filter((x) => x !== u) })}>✕</button></div>
        )) : !mentorPick && <p className="bw-none">{_t("Опытный брат или сестра, кто уже запускал своё дело. Позови его в круг и отметь здесь: он видит путь и решения и даёт советы.")}</p>}
        {mentorPick && (
          <div className="su-pick">
            {people.filter((u) => !mentors.includes(u)).map((u) => <button key={u} type="button" className="chip" onClick={() => { su.set({ mentors: [...st.mentors, u] }); setMentorPick(false); }}>{u === me ? _t("Я") : names[u]?.name || _t("Участник")}</button>)}
            <button type="button" className="link-btn" onClick={() => setMentorPick(false)}>{_t("Отмена")}</button>
          </div>
        )}
      </div>

      {decisions.length > 0 && (
        <div className="bw-card">
          <span className="bw-k">{_t("Решения команды")}</span>
          {decisions.map((x) => <div key={x.id} className="bw-dec su-dec"><i>✅</i><span><b>{dm(x.day)}</b> {x.body}</span></div>)}
        </div>
      )}
    </>
  );
}

function IdeaView({ su }: Props) {
  const st = su.data!.state;
  const fields = IDEA_FIELDS();
  const filled = fields.filter((f) => (st.idea[f.k] ?? '').trim()).length;
  const [edit, setEdit] = useState(filled === 0);
  const [f, setF] = useState<Idea>(st.idea);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const idea: Idea = {};
    for (const x of fields) { const v = (f[x.k] ?? '').trim().slice(0, 300); if (v) idea[x.k] = v; }
    await su.set({ idea });
    setBusy(false); setEdit(false);
  };
  const ask = () => askAssistant(_tj("Посмотри идею стартапа и найди 2–3 самых слабых места. Что проверить первым, чтобы не потратить месяцы зря? Отвечай коротко. Проблема: {0}. Для кого: {1}. Решение: {2}. Чем лучше: {3}. Как зарабатываем: {4}.",
    st.idea.problem || '—', st.idea.who || '—', st.idea.solution || '—', st.idea.better || '—', st.idea.earn || '—'));
  return (
    <>
      {edit ? (
        <div className="bw-card bw-form">
          <span className="bw-k">{_t("Идея на одной странице")}</span>
          {fields.map((x) => (
            <label key={x.k}><span className="su-fl">{x.t}</span><textarea rows={2} maxLength={300} value={f[x.k] ?? ''} placeholder={x.ph} onChange={(e) => setF({ ...f, [x.k]: e.target.value })} /></label>
          ))}
          <div className="bw-row">
            {filled > 0 && <button type="button" className="link-btn" onClick={() => { setF(st.idea); setEdit(false); }}>{_t("Отмена")}</button>}
            <button type="button" className="pri-btn" disabled={busy} onClick={save}>{_t("Сохранить")}</button>
          </div>
        </div>
      ) : (
        <div className="bw-card">
          <span className="bw-k">{_tj("Идея на одной странице · {0} из 5", filled)}</span>
          {fields.map((x) => (
            <div key={x.k} className="su-ln"><em>{x.t}</em>{st.idea[x.k] ? <span>{st.idea[x.k]}</span> : <span className="su-empty">{_t("не заполнено")}</span>}</div>
          ))}
          <button type="button" className="link-btn bw-edit" onClick={() => { setF(st.idea); setEdit(true); }}>{_t("✏️ Изменить")}</button>
        </div>
      )}
      {filled >= 3 && !edit && (
        <div className="su-ai">
          <p>{_t("✨ Помощник посмотрит идею и подскажет, где слабое место и что проверить первым.")}</p>
          <button type="button" className="ghost-btn" onClick={ask}>{_t("Найти слабые места")}</button>
        </div>
      )}
    </>
  );
}

function CheckView(p: Props & { go: (s: Seg) => void }) {
  const { su, me, names, people, today } = p;
  const d = su.data!;
  const st = d.state;
  const day = checkDay(st.chk, today);
  const tasks = CHECK_DAYS();
  const done = st.chk.done ?? {};
  const talksSince = st.chk.start ? d.talks.filter((t) => keyOf(new Date(t.created)) >= st.chk.start!).length : 0;
  const setChk = (c: Partial<typeof st.chk>) => su.set({ chk: { ...st.chk, ...c } });
  if (day < 1) {
    return (
      <div className="bw-card bw-start">
        <b>{_t("Проверка идеи за 7 дней")}</b>
        <p>{_t("Каждый день одно задание: найти людей с проблемой, поговорить с ними, позвать в список ожидания, попросить предзаказ. В конце команда решает: делаем, меняем или стоп. Так вы не потратите месяцы на то, что никому не нужно.")}</p>
        <button type="button" className="pri-btn" onClick={() => su.set({ stage: Math.max(2, st.stage), chk: { start: today, done: {} } })}>{_t("Начать сегодня")}</button>
      </div>
    );
  }
  return (
    <>
      <div className="bw-card">
        <span className="bw-k">{day <= 7 ? _tj("Проверка идеи · день {0} из 7", day) : _t("Проверка идеи · 7 дней прошли")}</span>
        <div className="su-days">{tasks.map((_, i) => <span key={i} className={done[String(i + 1)] ? 'ok' : i + 1 === day ? 'now' : ''}>{i + 1}</span>)}</div>
        {tasks.map((t, i) => {
          const k = String(i + 1), who = done[k];
          return (
            <button key={k} type="button" className={`su-task${who ? ' on' : ''}${i + 1 === day ? ' today' : ''}`}
              onClick={() => { const nd = { ...done }; if (who) delete nd[k]; else nd[k] = me; setChk({ done: nd }); }}>
              <span className="bw-chk" aria-hidden="true">{who ? '✓' : ''}</span>
              <span>{i + 1 === day && !who && <b>{_t("Сегодня: ")}</b>}{t}{who && <small> · {first(names, me, who)}</small>}</span>
            </button>
          );
        })}
      </div>
      <div className="bw-card">
        <span className="bw-k">{_t("Счёт проверки")}</span>
        <div className="su-score">
          <button type="button" onClick={() => p.go('talks')}><b>{talksSince}</b><small>{_t("разговоров")}</small></button>
          <Counter v={st.chk.list ?? 0} label={_t("в списке ожидания")} on={(v) => setChk({ list: v })} />
          <Counter v={st.chk.pre ?? 0} label={_t("предзаказов")} on={(v) => setChk({ pre: v })} />
        </div>
      </div>
      {day >= 6 && <Decide {...p} talksSince={talksSince} />}
      {day < 6 && people.length > 1 && <p className="tiny su-hint">{_t("Задания можно делить: кто отметил, тот и сделал. На 6-й день здесь появится решение команды.")}</p>}
    </>
  );
}

function Counter({ v, label, on }: { v: number; label: string; on: (v: number) => void }) {
  return (
    <div className="su-cnt">
      <b>{v}</b><small>{label}</small>
      <span><button type="button" aria-label="−" onClick={() => on(Math.max(0, v - 1))}>−</button><button type="button" aria-label="+" onClick={() => on(v + 1)}>+</button></span>
    </div>
  );
}

function Decide(p: Props & { talksSince: number }) {
  const { su, biz, me, names, people } = p;
  const d = su.data!;
  const st = d.state;
  const sum = talkSummary(d.talks);
  const mine = d.votes.find((v) => v.uid === me);
  const [note, setNote] = useState(mine?.note ?? '');
  const count = (v: Vote) => d.votes.filter((x) => x.vote === v).length;
  const top = (['go', 'change', 'stop'] as Vote[]).sort((a, b) => count(b) - count(a))[0];
  const all = people.length > 0 && d.votes.length >= people.length;
  const record = async () => {
    const v = top;
    const body = v === 'go' ? _t("Делаем. Идём в «Первую версию».") : v === 'change' ? _t("Меняем идею и проверяем ещё раз.") : _t("Стоп. Идея не подтвердилась, благодарим Аллаха за урок.");
    const notes = d.votes.filter((x) => x.note).map((x) => `${first(names, me, x.uid)}: ${x.note}`).join('; ');
    await biz.setDecision(0, { body: `${body}${notes ? ` (${notes})` : ''}`.slice(0, 300) });
    await su.set(v === 'go' ? { stage: 3, round: st.round + 1 } : v === 'change' ? { stage: 1, round: st.round + 1, chk: {} } : { round: st.round + 1, chk: {} });
    p.post(_tj("✅ Решение команды: {0}", body));
  };
  return (
    <>
      <div className="bw-card">
        <span className="bw-k">{_t("Решение после проверки")}</span>
        <b>{_t("Идём в «Первую версию»?")}</b>
        <p className="bw-sm">{_tj("{0} разговоров, {1} подтвердили проблему · {2} в списке ожидания · {3} предзаказов", sum.n, sum.strong, st.chk.list ?? 0, st.chk.pre ?? 0)}</p>
      </div>
      <div className="bw-card bw-today su-ist">
        <b>{_t("🤲 Сначала истихара")}</b>
        <p className="bw-sm">{_t("«Если кто-то из вас задумал дело, пусть совершит два ракаата, не относящиеся к обязательной молитве, а затем скажет…» (аль-Бухари, 1162). Совершите истихару, потом голосуйте.")}</p>
      </div>
      <div className="bw-card">
        <span className="bw-k">{_tj("Голос команды · {0} из {1}", d.votes.length, people.length)}</span>
        <div className="su-vote">
          {(['go', 'change', 'stop'] as Vote[]).map((v) => (
            <button key={v} type="button" aria-pressed={mine?.vote === v} className={v} onClick={() => su.vote(mine?.vote === v ? null : v, note)}>{VOTE_L[v]()}{count(v) > 0 && ` · ${count(v)}`}</button>
          ))}
        </div>
        <input className="su-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (mine && note !== mine.note) su.vote(mine.vote, note); }} placeholder={_t("Почему так? Одной строкой, по желанию")} />
        {d.votes.filter((v) => v.note).map((v) => <p key={v.uid} className="bw-sm su-vn">{first(names, me, v.uid)}: «{v.note}»</p>)}
        {d.votes.length > 0 && (
          <button type="button" className="pri-btn su-rec" onClick={() => { if (all || confirm(_t("Проголосовали не все. Записать решение сейчас?"))) record(); }}>
            {top === 'go' ? _t("Записать решение и перейти на ступень 3") : top === 'change' ? _t("Записать: меняем идею") : _t("Записать: стоп")}
          </button>
        )}
      </div>
    </>
  );
}

function TalksView({ su, me, names }: Props) {
  const d = su.data!;
  const [f, setF] = useState<{ id: number; who: string; quote: string; pain: number } | null>(null);
  const [qs, setQs] = useState(false);
  const sum = talkSummary(d.talks);
  const save = async () => {
    if (!f || !f.who.trim()) return;
    await su.setTalk(f.id, { who: f.who.trim(), quote: f.quote.trim(), pain: f.pain });
    setF(null);
  };
  const ask = () => askAssistant(_tj("Сведи итог разговоров с клиентами для стартапа: у кого проблема сильнее всего, кому неинтересно, что проверить дальше. Коротко. Разговоры: {0}",
    d.talks.slice(0, 30).map((t) => `${t.who} (боль ${t.pain}/5): ${t.quote}`).join('; ')));
  return (
    <>
      {sum.n > 0 && (
        <div className="su-ai">
          <p>{_tj("Итог: {0} из {1} подтвердили проблему (боль 4–5). Средняя боль {2} из 5.", sum.strong, sum.n, sum.avg)}</p>
          {sum.n >= 3 && <button type="button" className="ghost-btn" onClick={ask}>{_t("✨ Итог от помощника")}</button>}
        </div>
      )}
      {f ? (
        <div className="bw-card bw-form">
          <span className="bw-k">{f.id ? _t("Разговор") : _t("Новый разговор")}</span>
          <label><span className="su-fl">{_t("С кем говорил")}</span><input maxLength={80} value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder={_t("Например: мама троих, Нордвейк")} autoFocus /></label>
          <label><span className="su-fl">{_t("Главные слова человека")}</span><textarea rows={2} maxLength={200} value={f.quote} onChange={(e) => setF({ ...f, quote: e.target.value })} placeholder={_t("Например: «Каждую пятницу ищу, где заказать»")} /></label>
          <span className="su-fl">{_t("Насколько болит, от 1 до 5")}</span>
          <div className="su-painpick">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-pressed={f.pain === n} onClick={() => setF({ ...f, pain: n })}>{n}</button>)}</div>
          <div className="bw-row">
            {f.id > 0 && <button type="button" className="link-btn bw-del" onClick={async () => { if (confirm(_t("Удалить разговор?"))) { await su.setTalk(f.id, null); setF(null); } }}>{_t("Удалить")}</button>}
            <button type="button" className="link-btn" onClick={() => setF(null)}>{_t("Отмена")}</button>
            <button type="button" className="pri-btn" disabled={!f.who.trim()} onClick={save}>{_t("Сохранить")}</button>
          </div>
        </div>
      ) : (
        <button type="button" className="pri-btn su-add" onClick={() => setF({ id: 0, who: '', quote: '', pain: 3 })}>{_t("＋ Записать разговор")}</button>
      )}
      <div className="bw-card">
        <span className="bw-k">{_tj("Дневник разговоров · {0}", d.talks.length)}</span>
        {d.talks.length ? d.talks.map((t) => (
          <button key={t.id} type="button" className="su-talk" onClick={() => setF({ id: t.id, who: t.who, quote: t.quote, pain: t.pain })}>
            <span><b>{t.who}</b>{t.quote && <small>«{t.quote.replace(/^«|»$/g, '')}»</small>}<small className="su-by">{first(names, me, t.by)} · {dm(keyOf(new Date(t.created)))}</small></span>
            <span className="su-pain" aria-label={_tj("боль {0} из 5", t.pain)}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= t.pain ? 'on' : ''} />)}</span>
          </button>
        )) : <p className="bw-none">{_t("После каждого разговора запишите, с кем говорили, главные слова и насколько болит. Не продавайте, а спрашивайте о прошлом.")}</p>}
      </div>
      <div className="bw-card">
        <button type="button" className="bw-dech su-qh" onClick={() => setQs(!qs)}><span className="bw-k">{_t("Вопросы для разговора")}</span><span>{qs ? '−' : '+'}</span></button>
        {qs && <ol className="su-qs">{QUESTIONS().map((q) => <li key={q}>{q}</li>)}</ol>}
      </div>
    </>
  );
}

const PULSE_KINDS = (): string[] => [_t("Список ожидания"), _t("Клиенты"), _t("Предзаказы"), _t("Регистрации")];

function PulseView({ su, today }: Props) {
  const d = su.data!;
  const st = d.state;
  const week = mondayOf(today);
  const cur = d.pulse.find((x) => x.week === week)?.value;
  const prev = [...d.pulse].reverse().find((x) => x.week < week)?.value;
  const [v, setV] = useState(cur != null ? String(cur) : '');
  const [setup, setSetup] = useState(!st.pulse_label);
  const [label, setLabel] = useState(st.pulse_label || PULSE_KINDS()[0]);
  const [goal, setGoal] = useState(st.pulse_goal != null ? String(st.pulse_goal) : '');
  const max = Math.max(1, ...d.pulse.map((x) => x.value), st.pulse_goal ?? 0);
  const fc = forecast(d.pulse, st.pulse_goal);
  const last = d.pulse.length ? d.pulse[d.pulse.length - 1].value : 0;
  if (setup) {
    return (
      <div className="bw-card bw-form">
        <span className="bw-k">{_t("Пульс недели · главная цифра")}</span>
        <p className="bw-sm">{_t("Одна цифра, по которой видно, растёт ли стартап. Раз в неделю, в понедельник после Фаджра. Суммы денег не нужны.")}</p>
        <div className="su-pick">{PULSE_KINDS().map((k) => <button key={k} type="button" className="chip" aria-pressed={label === k} onClick={() => setLabel(k)}>{k}</button>)}</div>
        <label><span className="su-fl">{_t("Или своя")}</span><input maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label><span className="su-fl">{_t("Цель этой ступени")}</span><input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder={_t("Например: 50")} /></label>
        <div className="bw-row">
          {st.pulse_label && <button type="button" className="link-btn" onClick={() => setSetup(false)}>{_t("Отмена")}</button>}
          <button type="button" className="pri-btn" disabled={!label.trim()} onClick={async () => { await su.set({ pulse_label: label.trim(), pulse_goal: goal ? Number(goal) : null }); setSetup(false); }}>{_t("Сохранить")}</button>
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="bw-card">
        <span className="bw-k">{_t("Пульс недели · главная цифра")}</span>
        <div className="su-ph"><b className="su-big">{cur ?? last}</b>{cur != null && prev != null && cur !== prev && <em className={cur > prev ? 'up' : 'down'}>{cur > prev ? '▲ +' : '▼ '}{cur - prev}{_t(" за неделю")}</em>}</div>
        <small className="bw-sm">{st.pulse_label}</small>
        {d.pulse.length > 0 && (
          <div className="su-chart" role="img" aria-label={_tj("{0} по неделям", st.pulse_label)}>
            {d.pulse.slice(-8).map((x) => (
              <span key={x.week} className={x.week === week ? 'now' : ''}><i style={{ height: `${Math.max(4, Math.round((x.value / max) * 100))}%` }} /><small>{dm(x.week)}</small></span>
            ))}
          </div>
        )}
      </div>
      {st.pulse_goal != null && st.pulse_goal > 0 && (
        <div className="bw-card">
          <span className="bw-k">{_t("Цель ступени")}</span>
          <p>{_tj("{0}: {1}", st.pulse_label, st.pulse_goal)}</p>
          <div className="bw-bar"><i style={{ width: `${Math.min(100, Math.round((last / st.pulse_goal) * 100))}%` }} /></div>
          <small className="bw-sm">{last >= st.pulse_goal ? _t("Цель достигнута, МашаАллах!") : fc ? _tj("При таком темпе дойдёте к {0}", dm(fc)) : _t("Отметьте цифру хотя бы 2 недели, и появится прогноз")}</small>
        </div>
      )}
      <div className="bw-card">
        <span className="bw-k">{_tj("Цифра этой недели (с {0})", dm(week))}</span>
        <div className="su-pin">
          <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="0" aria-label={st.pulse_label} />
          <button type="button" className="pri-btn" disabled={!v} onClick={() => su.setPulse(week, Number(v))}>{cur != null ? _t("Обновить") : _t("Отметить")}</button>
        </div>
        <button type="button" className="link-btn bw-edit" onClick={() => setSetup(true)}>{_t("✏️ Другая цифра или цель")}</button>
      </div>
    </>
  );
}

/** «Итог демо-дня»: transcribes that Thursday's voice minutes (once, for the whole circle), then a short summary. */
function DemoSum(p: Props & { thu: string }) {
  const { msgs, names, me, thu, code } = p;
  const [on, setOn] = useState(false);
  const key = `lm.demo.${code}.${thu}`;
  const [sum, setSum] = useState<string>(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (p.transcribe) trReady().then(setOn); }, [p.transcribe]);
  if (!on || !p.transcribe || !code) return null;
  const voices = msgs.filter((m) => m.kind === 'voice' && !m.deleted && keyOf(new Date(m.at)) === thu);
  const run = async () => {
    setErr('');
    const texts = new Map<number, string>(voices.filter((m) => m.body).map((m) => [m.id, m.body]));
    const todo = voices.filter((m) => !m.body && m.voice);
    for (let i = 0; i < todo.length; i++) {
      setBusy(_tj("Расшифровываю {0} из {1}…", i + 1, todo.length));
      const r = await p.transcribe!(todo[i].id);
      if (r.err === 'limit' || r.err === 'nosql' || r.err === 'net') { setBusy(''); setErr(r.err === 'limit' ? _t("На сегодня расшифровки закончились") : _t("Не получилось, нажми ещё раз")); return; }
      if (r.text) texts.set(todo[i].id, r.text);
    }
    const by = new Map<string, string[]>();
    for (const m of voices) { const t = texts.get(m.id); if (t && t !== '…') by.set(m.uid, [...(by.get(m.uid) ?? []), t]); }
    if (!by.size) { setBusy(''); setErr(_t("В голосовых не разобрать слов")); return; }
    setBusy(_t("Помощник собирает итог…"));
    const id = cloudMe();
    try {
      const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        mode: 'sum', uid: id?.uid, token: id?.token, code,
        items: [...by].map(([u, t]) => ({ name: u === me ? (names[u]?.name || _t("Я")) : (names[u]?.name || _t("Участник")), text: t.join(' ') })),
      }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.text) throw new Error(j.error || 'busy');
      setSum(j.text);
      try { localStorage.setItem(key, j.text); } catch { /* */ }
    } catch { setErr(_t("Не получилось, нажми ещё раз")); }
    setBusy('');
  };
  return (
    <>
      {sum && <p className="su-sum">{sum}</p>}
      {busy ? <p className="bw-sm">{busy}</p>
        : <button type="button" className="link-btn" onClick={run}>{sum ? _t("Обновить итог") : _t("Аа Итог демо-дня: расшифровать и собрать")}</button>}
      {err && <p className="bw-sm">{err}</p>}
    </>
  );
}
