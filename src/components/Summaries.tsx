import { Fragment, useState, type ReactNode } from 'react';
import type { AppState, Mark } from '../types';
import { SUMMARY_BOOKS, type Summary } from '../summaries';
import { dayKey } from '../dates';
import { _t, _tj } from '../i18n';
import { track } from '../usage';

const key = (s: Summary) => `${s.book}:${s.n}`;

function inline(t: string): ReactNode[] {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
}

/** Tiny renderer for the subset used by the retellings: ## headings, paragraphs, - and 1. lists, **bold**. */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((x, i) => <li key={i}>{inline(x)}</li>);
    out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const ol = line.match(/^\d+\.\s+(.*)$/);
    const ul = line.match(/^[-•]\s+(.*)$/);
    if (ol || ul) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ol ?? ul)![1]);
      continue;
    }
    flush();
    if (!line || line === '---') continue;
    if (line.startsWith('## ')) out.push(<h3 key={out.length}>{line.slice(3)}</h3>);
    else if (line.startsWith('> ')) out.push(<blockquote key={out.length}>{inline(line.slice(2))}</blockquote>);
    else out.push(<p key={out.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="md">{out}</div>;
}

interface Props {
  book: string;
  chapters: Summary[];
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onClose: () => void;
  onFinish: (m: Mark) => void;
}

export function SummaryBook({ book, chapters, state, update, habitName, onClose, onFinish }: Props) {
  const meta = SUMMARY_BOOKS[book] ?? { title: book, author: '' };
  const read = new Set(state.summaryRead ?? []);
  const [open, setOpen] = useState<Summary | null>(null);
  const [finish, setFinish] = useState(false);
  const [note, setNote] = useState('');

  const markRead = (s: Summary) => { track('books', 'chapter'); update((st) => (st.summaryRead?.includes(key(s)) ? st : { ...st, summaryRead: [...(st.summaryRead ?? []), key(s)] })); };
  const saveNote = (s: Summary) => {
    if (!note.trim()) return;
    update((st) => ({ ...st, summaryNotes: [...(st.summaryNotes ?? []), { key: key(s), date: dayKey(new Date()), text: note.trim() }] }));
  };

  if (open) {
    const idx = chapters.findIndex((c) => key(c) === key(open));
    const next = chapters[idx + 1];
    return (
      <div className="sess light-sess">
        <div className="sess-top">
          <button type="button" className="icon-btn" onClick={() => { setOpen(null); setFinish(false); }} aria-label={_t("К главам")}>‹</button>
          <div><b>{_tj("Глава {0}", open.n)}</b><small>{meta.title}</small></div>
          <button type="button" className="done-btn" onClick={() => setFinish(true)}>{_t("Закончить")}</button>
        </div>
        <div className="b-read sum-read">
          <h2>{open.title}</h2>
          <Md text={open.md} />
          {(state.summaryNotes ?? []).filter((x) => x.key === key(open)).map((x, i) => (
            <p key={i} className="sum-note">{_tj("Твоя мысль ({0}): {1}", x.date.split('-').reverse().join('.'), x.text)}</p>
          ))}
          {next && <button type="button" className="link-btn" onClick={() => { markRead(open); setOpen(next); }}>{_tj("Следующая глава: {0} ›", next.title)}</button>}
        </div>
        {finish && (
          <div className="finish-sheet">
            <b>{_tj("Глава {0} прочитана", open.n)}</b>
            <p>{_t("Одна мысль, которую стоит запомнить:")}</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={_t("Например: каждое действие это голос за того, кем я хочу стать")} />
            <div className="row2 light">
              {habitName ? (
                <>
                  <button type="button" onClick={() => { markRead(open); saveNote(open); onFinish('min'); }}>{_t("Минимум")}</button>
                  <button type="button" className="pri-btn" onClick={() => { markRead(open); saveNote(open); onFinish('done'); }}>{_t("Сделано")}</button>
                </>
              ) : (
                <button type="button" className="pri-btn" onClick={() => { markRead(open); saveNote(open); setNote(''); setFinish(false); setOpen(null); }}>{_t("Сохранить")}</button>
              )}
            </div>
            <button type="button" className="link-btn" onClick={() => setFinish(false)}>{_t("Читать дальше")}</button>
          </div>
        )}
      </div>
    );
  }

  const done = chapters.filter((c) => read.has(key(c))).length;
  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={_t("К полке")}>‹</button>
        <div><b>{meta.title}</b><small>{_tj("Прочитано {0} из {1} · новая глава каждое утро", done, chapters.length)}</small></div>
      </div>
      <div className="q-list">
        {chapters.map((c) => (
          <button type="button" key={key(c)} className={`q-row ch-item${read.has(key(c)) ? ' read' : ''}`} onClick={() => setOpen(c)}>
            <span className="q-n">{read.has(key(c)) ? '✓' : c.n}</span>
            <span className="q-t"><b>{/^Заключение/.test(c.title) ? c.title : _tj("Глава {0}. {1}", c.n, c.title)}</b><small>{c.date.split('-').reverse().join('.')}</small></span>
          </button>
        ))}
        <p className="q-msg">{_t("Это пересказ своими словами, а не текст книги.")}</p>
      </div>
    </div>
  );
}
