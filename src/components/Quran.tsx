import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';

// [arabic name, transliteration, russian name, meccan|medinan, [[arabic, russian], ...]]
type Surah = [string, string, string, string, [string, string][]];

export type QLang = 'ru' | 'en' | 'tr';
export const Q_LANGS: { id: QLang; label: string; src: string }[] = [
  { id: 'ru', label: 'Русский', src: 'перевод смыслов Э. Кулиева' },
  { id: 'en', label: 'English', src: 'Saheeh International' },
  { id: 'tr', label: 'Türkçe', src: 'перевод на турецкий' },
];

const cache: Partial<Record<QLang, Promise<Surah[]>>> = {};
export function loadQuran(lang: QLang) {
  if (!cache[lang]) {
    const p = fetch(`./quran-${lang}.json`).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Surah[]>;
    });
    p.catch(() => { delete cache[lang]; });
    cache[lang] = p;
  }
  return cache[lang]!;
}

interface Props {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  habitName?: string;
  onExit: () => void;
  onFinish: (m: Mark) => void;
}

const DEF = { surah: 1, ayah: 1, translation: true, size: 26, lang: 'ru' as QLang };

export function Quran({ state, update, habitName, onExit, onFinish }: Props) {
  const q = { ...DEF, ...(state.quran ?? {}) };
  const setQ = (patch: Partial<typeof DEF>) => update((s) => ({ ...s, quran: { ...DEF, ...(s.quran ?? {}), ...patch } }));
  const [data, setData] = useState<Surah[] | null>(null);
  const [err, setErr] = useState(false);
  const [view, setView] = useState<'list' | 'read'>('list');
  const [surah, setSurah] = useState(q.surah);
  const [find, setFind] = useState('');
  const [finish, setFinish] = useState(false);
  const seen = useRef(new Set<string>());
  const [seenCount, setSeenCount] = useState(0);

  useEffect(() => { setErr(false); loadQuran(q.lang).then(setData, () => setErr(true)); }, [q.lang]);

  const list = useMemo(() => {
    if (!data) return [];
    const f = find.trim().toLowerCase();
    return data.map((s, i) => ({ s, n: i + 1 })).filter(({ s, n }) => !f || String(n) === f || s[1].toLowerCase().includes(f) || s[2].toLowerCase().includes(f) || s[0].includes(f));
  }, [data, find]);

  const open = (n: number) => { setSurah(n); setView('read'); };

  return (
    <div className="sess light-sess">
      <div className="sess-top">
        <button type="button" className="icon-btn" onClick={view === 'read' ? () => setView('list') : onExit} aria-label={view === 'read' ? 'К списку сур' : 'Выйти'}>
          {view === 'read' ? '‹' : '✕'}
        </button>
        <div>
          <b>{view === 'read' && data ? `${surah}. ${data[surah - 1][1]}` : 'Коран'}</b>
          <small>{view === 'read' && data ? `${data[surah - 1][2]} · ${data[surah - 1][4].length} аятов` : habitName ?? 'Чтение с переводом смыслов'}</small>
        </div>
        {view === 'read' && (
          <button type="button" className="done-btn" onClick={() => setFinish(true)}>Закончить</button>
        )}
      </div>

      {err && <p className="q-msg">Не удалось загрузить текст Корана. Проверь интернет и открой ещё раз.</p>}
      {!data && !err && <p className="q-msg">Загружаю текст…</p>}

      {data && view === 'list' && (
        <div className="q-list">
          <button type="button" className="q-continue" onClick={() => open(q.surah)}>
            <small>Продолжить</small>
            <b>{q.surah}. {data[q.surah - 1][1]}, аят {q.ayah}</b>
            <span className="ar">{data[q.surah - 1][0]}</span>
          </button>
          <div className="langs" role="group" aria-label="Язык перевода">
            {Q_LANGS.map((l) => (
              <button key={l.id} type="button" aria-pressed={q.lang === l.id} onClick={() => setQ({ lang: l.id })}>{l.label}</button>
            ))}
          </div>
          <input className="q-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Найти суру: номер или название" />
          {list.map(({ s, n }) => (
            <button key={n} type="button" className="q-row" onClick={() => open(n)}>
              <span className="q-n">{n}</span>
              <span className="q-t"><b>{s[1]}</b><small>{s[2]} · {s[4].length} аятов · {s[3] === 'meccan' ? 'мекканская' : 'мединская'}</small></span>
              <span className="ar">{s[0]}</span>
            </button>
          ))}
          <p className="q-src">Арабский текст и перевод ({Q_LANGS.find((l) => l.id === q.lang)?.src}): «Энциклопедия Корана» (quranenc.com), через проект quran-json.</p>
        </div>
      )}

      {data && view === 'read' && (
        <Reader
          key={surah}
          n={surah}
          s={data[surah - 1]}
          startAyah={surah === q.surah ? q.ayah : 1}
          translation={q.translation}
          size={q.size}
          lang={q.lang}
          setQ={setQ}
          onSeen={(id) => { if (!seen.current.has(id)) { seen.current.add(id); setSeenCount(seen.current.size); } }}
          onNext={surah < 114 ? () => setSurah(surah + 1) : undefined}
        />
      )}

      {finish && (
        <div className="finish-sheet">
          <b>Прочитано аятов: {seenCount}</b>
          <p>{habitName ? `Отметить «${habitName}»?` : 'Закладка сохранена.'}</p>
          <div className="row2 light">
            {habitName ? (
              <>
                <button type="button" onClick={() => { onFinish('min'); onExit(); }}>Минимум</button>
                <button type="button" className="pri-btn" onClick={() => { onFinish('done'); onExit(); }}>Сделано</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={onExit}>Закрыть</button>
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => setFinish(false)}>Читать дальше</button>
        </div>
      )}
    </div>
  );
}

function Reader(props: {
  n: number; s: Surah; startAyah: number; translation: boolean; size: number; lang: QLang;
  setQ: (p: Partial<typeof DEF>) => void; onSeen: (id: string) => void; onNext?: () => void;
}) {
  const { n, s, startAyah, translation, size, lang, setQ, onSeen, onNext } = props;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current?.querySelector(`[data-a="${startAyah}"]`);
    if (el && startAyah > 1) el.scrollIntoView({ block: 'start' });
    else box.current?.scrollTo({ top: 0 });
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const root = box.current;
    if (!root) return;
    let last = 0;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const a = Number((e.target as HTMLElement).dataset.a);
          onSeen(`${n}:${a}`);
          if (a > last) last = a;
        }
        // Bookmark follows the reader, at most once a second.
        if (last) setQ({ surah: n, ayah: last });
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll('[data-a]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="q-tools">
        <button type="button" aria-pressed={translation} onClick={() => setQ({ translation: !translation })}>Перевод</button>
        <select value={lang} onChange={(e) => setQ({ lang: e.target.value as QLang })} aria-label="Язык перевода">
          {Q_LANGS.map((l) => <option key={l.id} value={l.id}>{l.id.toUpperCase()}</option>)}
        </select>
        <button type="button" onClick={() => setQ({ size: Math.max(20, size - 2) })} aria-label="Мельче">A−</button>
        <button type="button" onClick={() => setQ({ size: Math.min(40, size + 2) })} aria-label="Крупнее">A+</button>
      </div>
      <div className="q-read" ref={box}>
        {n !== 1 && n !== 9 && <p className="basmala">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</p>}
        {s[4].map(([ar, ru], i) => (
          <div className="ayah" key={i} data-a={i + 1}>
            <p className="ayah-ar" lang="ar" dir="rtl" style={{ fontSize: size }}>
              {ar} <span className="ayah-n">{i + 1}</span>
            </p>
            {translation && <p className="ayah-ru" lang={lang}><span>{n}:{i + 1}</span> {ru}</p>}
          </div>
        ))}
        {onNext && <button type="button" className="pri-btn next-surah" onClick={onNext}>Следующая сура</button>}
      </div>
    </>
  );
}
