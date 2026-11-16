import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.js?worker&inline';
import type { AppState, BookMeta, Mark } from '../types';
import { uid } from '../store';
import { dayKey } from '../dates';
import { deleteFile, getFile, putFile } from '../idb';
import { SUMMARY_BOOKS, useSummaries } from '../summaries';
import { SummaryBook } from './Summaries';

let workerReady = false;
function ensureWorker() {
  if (workerReady) return;
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  workerReady = true;
}

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
}

export function Books({ state, update, habitName, onExit, onFinish }: Props) {
  const books = state.books ?? [];
  const [open, setOpen] = useState<BookMeta | null>(null);
  const [sumBook, setSumBook] = useState<string | null>(null);
  const summaries = useSummaries();
  const sumBooks = Object.keys(SUMMARY_BOOKS).filter((k) => summaries.some((s) => s.book === k));
  const [busy, setBusy] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const patchBook = (id: string, patch: Partial<BookMeta>) =>
    update((s) => ({ ...s, books: (s.books ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b)) }));

  const add = async (f: File) => {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isTxt = f.type.startsWith('text/') || /\.txt$/i.test(f.name);
    if (!isPdf && !isTxt) { setBusy('Пока поддерживаются PDF и TXT. EPUB добавлю следующим шагом.'); return; }
    setBusy('Добавляю книгу…');
    try {
      const id = uid();
      let pages = 1;
      if (isPdf) {
        ensureWorker();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        pages = doc.numPages;
        await doc.destroy();
      } else {
        pages = Math.max(1, Math.ceil((await f.text()).length / 1800));
      }
      await putFile(id, f);
      const meta: BookMeta = { id, title: f.name.replace(/\.(pdf|txt)$/i, ''), kind: isPdf ? 'pdf' : 'txt', pages, page: 1, addedAt: dayKey(new Date()) };
      update((s) => ({ ...s, books: [...(s.books ?? []), meta] }));
      setBusy('');
    } catch {
      setBusy('Не получилось открыть файл. Возможно, он защищён паролем или повреждён.');
    }
  };

  const remove = async (b: BookMeta) => {
    await deleteFile(b.id);
    update((s) => ({ ...s, books: (s.books ?? []).filter((x) => x.id !== b.id) }));
  };

  if (sumBook)
    return (
      <SummaryBook book={sumBook} chapters={summaries.filter((s) => s.book === sumBook)} state={state} update={update}
        habitName={habitName} onClose={() => setSumBook(null)} onFinish={(m) => { onFinish(m); setSumBook(null); onExit(); }} />
    );

  if (open)
    return (
      <Reader
        book={books.find((b) => b.id === open.id) ?? open}
        habitName={habitName}
        onPage={(p) => patchBook(open.id, { page: p })}
        onNote={(text, page) => {
          const b = books.find((x) => x.id === open.id);
          patchBook(open.id, { notes: [...(b?.notes ?? []), { date: dayKey(new Date()), page, text }] });
        }}
        onClose={() => setOpen(null)}
        onFinish={(m) => { onFinish(m); setOpen(null); onExit(); }}
      />
    );

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onExit} aria-label="Выйти">✕</button>
        <div><b>Мои книги</b><small>{habitName ?? 'Пересказы глав и свои PDF или TXT'}</small></div>
      </div>
      <div className="q-list">
        {sumBooks.map((k) => {
          const ch = summaries.filter((s) => s.book === k);
          const done = ch.filter((s) => state.summaryRead?.includes(`${s.book}:${s.n}`)).length;
          return (
            <div className="book" key={k}>
              <button type="button" className="book-main" onClick={() => setSumBook(k)}>
                <span className="cover sum-cover">А</span>
                <span className="q-t">
                  <b>{SUMMARY_BOOKS[k].title}</b>
                  <small>{SUMMARY_BOOKS[k].author} · глав: {ch.length}</small>
                  <span className="bar"><i style={{ width: `${(done / Math.max(1, ch.length)) * 100}%` }} /></span>
                </span>
              </button>
            </div>
          );
        })}
        <button type="button" className="upload" onClick={() => input.current?.click()}>
          <b>+ Добавить книгу</b>
          <small>PDF или TXT с телефона</small>
        </button>
        <input ref={input} type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = ''; }} />
        {busy && <p className="q-msg">{busy}</p>}
        {books.length === 0 && !busy && <p className="q-msg">Свои книги в PDF или TXT хранятся только на этом устройстве.</p>}
        {books.map((b) => {
          const pct = Math.round(((b.page - 1) / Math.max(1, b.pages - 1)) * 100);
          return (
            <div className="book" key={b.id}>
              <button type="button" className="book-main" onClick={() => setOpen(b)}>
                <span className="cover">{b.title.slice(0, 1).toUpperCase()}</span>
                <span className="q-t">
                  <b>{b.title}</b>
                  <small>стр. {b.page} из {b.pages} · {b.kind.toUpperCase()}</small>
                  <span className="bar"><i style={{ width: `${pct}%` }} /></span>
                </span>
              </button>
              <button type="button" className="hg-act" onClick={() => remove(b)}>Убрать</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Reader({ book, habitName, onPage, onNote, onClose, onFinish }: {
  book: BookMeta; habitName?: string; onPage: (p: number) => void; onNote: (t: string, p: number) => void;
  onClose: () => void; onFinish: (m: Mark) => void;
}) {
  const [page, setPage] = useState(book.page);
  const [startPage] = useState(book.page);
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [finish, setFinish] = useState(false);
  const [note, setNote] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    let d: pdfjs.PDFDocumentProxy | null = null;
    (async () => {
      try {
        const blob = await getFile(book.id);
        if (!blob) throw new Error('missing');
        if (book.kind === 'pdf') {
          ensureWorker();
          d = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
          if (alive) setDoc(d);
        } else if (alive) setText(await blob.text());
      } catch {
        if (alive) setErr('Файл не найден на этом устройстве. Добавь книгу заново.');
      }
    })();
    return () => { alive = false; d?.destroy(); };
  }, [book.id, book.kind]);

  useEffect(() => {
    if (!doc || !canvas.current || !wrap.current) return;
    let cancelled = false;
    let task: ReturnType<pdfjs.PDFPageProxy['render']> | null = null;
    (async () => {
      const p = await doc.getPage(page);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const scale = (wrap.current!.clientWidth - 8) / base.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.getViewport({ scale: scale * dpr });
      const c = canvas.current!;
      c.width = vp.width;
      c.height = vp.height;
      c.style.width = `${vp.width / dpr}px`;
      c.style.height = `${vp.height / dpr}px`;
      task = p.render({ canvasContext: c.getContext('2d')!, viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, page]);

  const go = (p: number) => {
    const n = Math.min(book.pages, Math.max(1, p));
    setPage(n);
    onPage(n);
    wrap.current?.scrollTo({ top: 0 });
  };

  const chunk = text ? text.slice((page - 1) * 1800, page * 1800) : '';
  const read = Math.max(0, page - startPage);

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="К полке">‹</button>
        <div><b>{book.title}</b><small>стр. {page} из {book.pages}</small></div>
        <button type="button" className="done-btn" onClick={() => setFinish(true)}>Закончить</button>
      </div>
      <div className="b-read" ref={wrap}>
        {err && <p className="q-msg">{err}</p>}
        {book.kind === 'pdf' ? <canvas ref={canvas} /> : <div className="txt-page">{chunk}</div>}
      </div>
      <div className="b-nav">
        <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Назад">‹</button>
        <input type="range" min={1} max={book.pages} value={page} onChange={(e) => go(Number(e.target.value))} aria-label="Страница" />
        <button type="button" onClick={() => go(page + 1)} disabled={page >= book.pages} aria-label="Вперёд">›</button>
      </div>

      {finish && (
        <div className="finish-sheet">
          <b>Прочитано страниц: {read}</b>
          <p>Одна мысль, которую стоит запомнить:</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Например: начинать с того, каким человеком я хочу стать" />
          <div className="row2 light">
            {habitName ? (
              <>
                <button type="button" onClick={() => { if (note.trim()) onNote(note.trim(), page); onFinish('min'); }}>Минимум</button>
                <button type="button" className="pri-btn" onClick={() => { if (note.trim()) onNote(note.trim(), page); onFinish('done'); }}>Сделано</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={() => { if (note.trim()) onNote(note.trim(), page); onClose(); }}>Сохранить</button>
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => setFinish(false)}>Читать дальше</button>
        </div>
      )}
    </div>
  );
}
