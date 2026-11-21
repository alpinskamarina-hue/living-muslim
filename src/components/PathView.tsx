// «Путь» in a person's profile and «Что видят другие» (src/path.ts, supabase/profile-path.sql).
import { useEffect, useState } from 'react';
import type { AppState, Anchor } from '../types';
import { ANCHORS } from '../types';
import { BLOCKS, getPath, getPathSettings, hiddenHabits, setPathSettings, syncPath, type Block, type Path, type PathSettings, type Vis } from '../path';
import { plural } from '../dates';
import { _t, _tj, LOC } from '../i18n';

const PR: Record<Anchor, string> = { fajr: _t("Фаджр"), dhuhr: _t("Зухр"), asr: _t("Аср"), maghrib: _t("Магриб"), isha: _t("Иша") };
const AFTER: Record<Anchor, string> = { fajr: _t("после Фаджра"), dhuhr: _t("после Зухра"), asr: _t("после Асра"), maghrib: _t("после Магриба"), isha: _t("после Иши") };
const days = (n: number) => `${n} ${plural(n, _t("день"), _t("дня"), _t("дней"))}`;
const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString(LOC, { month: 'long' });

/** The person's «Путь», as the server lets me see it. */
export function PathView({ uid, self, onSettings }: { uid: string; self: boolean; onSettings?: () => void }) {
  const [p, setP] = useState<Path | null | undefined>(undefined);
  useEffect(() => { getPath(uid).then((r) => setP(r ? r.path : null)); }, [uid]);
  if (!p) return null;
  const empty = !Object.keys(p).length;
  if (empty && !self) return null;
  return (
    <div className="pa">
      <div className="pa-h"><h4>{_t("Путь")}</h4>{self && onSettings && <button type="button" className="link-btn" onClick={onSettings}>{_t("👁 Что видят другие")}</button>}</div>
      {empty && <p className="pp-empty">{_t("Пока нечего показать. Отмечай намазы и привычки, начни курс: здесь появится твой путь.")}</p>}
      {p.prayer && (
        <div className="pa-sec">
          <div className="pa-t"><b>🕌 {_t("Намаз")}</b><small>{_t("30 дней")}</small></div>
          <div className="pa-pr">
            <div className="pa-ring" style={{ background: `conic-gradient(var(--green-2) ${p.prayer.pct * 3.6}deg, var(--line) 0)` }}><span><b>{p.prayer.pct}%</b><small>{_t("вовремя")}</small></span></div>
            <div className="pa-bars">
              {ANCHORS.map((a) => <span key={a}><i style={{ height: `${Math.max(6, (p.prayer!.by[a] ?? 0) * 0.56)}px` }} title={`${p.prayer!.by[a] ?? 0}%`} />{PR[a]}</span>)}
            </div>
          </div>
          {p.prayer.fajr >= 2 && <small className="pa-run">🔥 {_t("Фаджр вовремя")} <b>{_tj("{0} подряд", days(p.prayer.fajr))}</b></small>}
        </div>
      )}
      {p.habits?.length ? (
        <div className="pa-sec">
          <div className="pa-t"><b>🌱 {_t("Привычки")}</b><small>{p.habits.length}</small></div>
          {p.habits.map((h, i) => (
            <div key={i} className="pa-row"><span className="pa-txt">{h.t}<small>{AFTER[h.a] ?? ''}</small></span><span className="pa-n">{days(h.run)}<small>{_t("подряд")}</small></span></div>
          ))}
        </div>
      ) : null}
      {p.study?.length ? (
        <div className="pa-sec">
          <div className="pa-t"><b>🎓 {_t("Изучает")}</b></div>
          {p.study.map((x) => (
            <div key={x.k} className="pa-row"><span className="pa-txt">{x.t}<small>{x.sub}</small>{x.pct !== undefined && <i className="pa-pb"><i style={{ width: `${x.pct}%` }} /></i>}</span></div>
          ))}
        </div>
      ) : null}
      {p.deeds && (
        <div className="pa-sec">
          <div className="pa-t"><b>✨ {_t("Благие дела")}</b><small>{monthName(p.deeds.m)}</small></div>
          <div className="pa-tiles">
            {p.deeds.quran !== undefined && <span><b>{p.deeds.quran}%</b>{_t("хатма Корана")}</span>}
            {p.deeds.sadaqa !== undefined && <span><b>{p.deeds.sadaqa}</b>{_t("дней садаки")}</span>}
            {p.deeds.azkar !== undefined && <span><b>{p.deeds.azkar}</b>{_t("дней азкаров")}</span>}
            {p.deeds.fasts !== undefined && <span><b>{p.deeds.fasts}</b>{_t("дней поста")}</span>}
          </div>
        </div>
      )}
      {p.goals?.length ? (
        <div className="pa-sec">
          <div className="pa-t"><b>🎯 {_t("Цели")}</b></div>
          {p.goals.map((g, i) => <div key={i} className="pa-row"><span className="pa-txt">{g.t}<i className="pa-pb"><i style={{ width: `${g.pct}%` }} /></i></span><span className="pa-n">{g.pct}%</span></div>)}
        </div>
      ) : null}
      {self && <p className="pa-note">{_t("Пропуски и ошибки не видны никому, только хорошее.")}</p>}
    </div>
  );
}

const LABEL: Record<Block, [string, string]> = {
  prayer: [_t("🕌 Намаз"), _t("процент вовремя и серия")],
  habits: [_t("🌱 Привычки"), _t("название и дни подряд")],
  study: [_t("🎓 Изучаю"), _t("курсы, арабский, книги")],
  deeds: [_t("✨ Благие дела"), _t("Коран, садака, азкары, пост")],
  goals: [_t("🎯 Цели"), _t("названия и прогресс")],
};
const VIS: [Vis, string][] = [['all', _t("Все")], ['circles', _t("Круги")], ['none', _t("Никто")]];

/** My profile → «Что видят другие». */
export function PathSettingsPage({ state, update, today, onBack }: { state: AppState; update: (fn: (s: AppState) => AppState) => void; today: string; onBack: () => void }) {
  const [st, setSt] = useState<PathSettings | null | undefined>(undefined);
  const [saved, setSaved] = useState('');
  useEffect(() => { getPathSettings().then(setSt); }, []);
  const pick = async (b: Block | 'ask', v: Vis) => {
    if (!st) return;
    const next = b === 'ask' ? { ...st, ask_from: v } : { ...st, vis: { ...st.vis, [b]: v } };
    setSt(next);
    const ok = await setPathSettings(b === 'ask' ? null : { [b]: v }, b === 'ask' ? v : undefined);
    setSaved(ok ? _t("✓ Сохранено") : _t("Не сохранилось. Проверь интернет."));
  };
  const hide = hiddenHabits(state);
  const toggleHabit = (id: string) => {
    update((s) => { const h = s.settings.pathHide ?? []; return { ...s, settings: { ...s.settings, pathHide: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] } }; });
    setTimeout(() => setSaved(_t("✓ Сохранено")), 50);
  };
  // the summary follows the habit choices right away
  useEffect(() => { syncPath(state, today, true); }, [hide.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const habits = state.habits.filter((h) => h.status === 'active');
  return (
    <div className="pp pa-set">
      <div className="pp-top"><button type="button" aria-label={_t("Назад")} onClick={onBack}>←</button><b>{_t("Что видят другие")}</b></div>
      <div className="pa-body">
        <p className="pa-hint">{_t("🤲 Показывай, чтобы вдохновлять братьев, а не ради похвалы. Пропуски и ошибки не видны никому, только хорошее.")}</p>
        {st === undefined ? <p className="pp-load">{_t("Загружаю…")}</p> : !st ? <p className="pp-load">{_t("Не удалось загрузить. Проверь интернет.")}</p> : (
          <>
            <div className="pa-card">
              {BLOCKS.map((b) => (
                <div key={b} className="pa-vis">
                  <span>{LABEL[b][0]}<small>{LABEL[b][1]}</small></span>
                  <div className="pa-three" role="radiogroup" aria-label={LABEL[b][0]}>{VIS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={st.vis[b] === v} onClick={() => pick(b, v)}>{l}</button>)}</div>
                </div>
              ))}
            </div>
            {habits.length > 0 && st.vis.habits !== 'none' && (
              <div className="pa-card">
                <b className="pa-ct">{_t("Какие привычки показывать")}</b>
                {habits.map((h) => (
                  <label key={h.id} className="pa-chk"><input type="checkbox" checked={!hide.includes(h.id)} onChange={() => toggleHabit(h.id)} /><span>{h.action}</span></label>
                ))}
              </div>
            )}
            <div className="pa-card">
              <b className="pa-ct">{_t("💬 Кто может попросить написать")}</b>
              <div className="pa-vis">
                <span>{_t("Просьбы о сообщении")}<small>{_t("ты сначала видишь, зачем пишут, и сам решаешь")}</small></span>
                <div className="pa-three" role="radiogroup" aria-label={_t("Просьбы о сообщении")}>{VIS.map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={st.ask_from === v} onClick={() => pick('ask', v)}>{l}</button>)}</div>
              </div>
              {st.gender === 'f' && <small className="pa-small">{_t("Братья не могут писать сёстрам: это правило для всех сестёр.")}</small>}
            </div>
            {saved && <p className="pa-saved" role="status">{saved}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export const TOPICS: { k: string; l: string }[] = [
  { k: 'meet', l: _t("🤝 Познакомиться") }, { k: 'question', l: _t("❓ Вопрос") },
  { k: 'umrah', l: _t("🕋 Умра вместе") }, { k: 'learn', l: _t("📖 Учиться вместе") },
  { k: 'job', l: _t("💼 Работа") }, { k: 'biz', l: _t("🚀 Бизнес") },
  { k: 'dua', l: _t("🤲 Просьба о дуа") }, { k: 'other', l: _t("✏️ Другое") },
];
export const topicLabel = (k: string) => TOPICS.find((t) => t.k === k)?.l;
