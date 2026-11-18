import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, Mark } from '../types';
import { _t, _tj, LANG } from '../i18n';
import { surahTr } from '../quranTr';

// [arabic name, transliteration, russian name, meccan|medinan, [[arabic, russian], ...]]
type Surah = [string, string, string, string, [string, string][]];

export type QLang = 'ru' | 'en' | 'tr';
export const Q_LANGS: { id: QLang; label: string; src: string }[] = [
  { id: 'ru', label: _t("Русский"), src: _t("перевод смыслов Э. Кулиева") },
  { id: 'en', label: 'English', src: 'Saheeh International' },
  { id: 'tr', label: 'Türkçe', src: _t("перевод на турецкий") },
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
  /** Opens this surah right away (from a goal). */
  startSurah?: number;
  onExit: () => void;
  onFinish: (m: Mark) => void;
}

const DEF = { surah: 1, ayah: 1, translation: true, size: 26, lang: 'ru' as QLang, tr: true };

export function Quran({ state, update, habitName, startSurah, onExit, onFinish }: Props) {
  const q = { ...DEF, ...(state.quran ?? {}) };
  const setQ = (patch: Partial<typeof DEF>) => update((s) => ({ ...s, quran: { ...DEF, ...(s.quran ?? {}), ...patch } }));
  const [data, setData] = useState<Surah[] | null>(null);
  const [err, setErr] = useState(false);
  const okStart = startSurah && startSurah >= 1 && startSurah <= 114 ? startSurah : 0;
  const [view, setView] = useState<'list' | 'read'>(okStart ? 'read' : 'list');
  const [surah, setSurah] = useState(okStart || q.surah);
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
        <button type="button" className="icon-btn" onClick={view === 'read' ? () => setView('list') : onExit} aria-label={view === 'read' ? _t("К списку сур") : _t("Выйти")}>
          {view === 'read' ? '‹' : '✕'}
        </button>
        <div>
          <b>{view === 'read' && data ? `${surah}. ${data[surah - 1][1]}` : _t("Коран")}</b>
          <small>{view === 'read' && data ? _t("{0} · {1} аятов", data[surah - 1][2], data[surah - 1][4].length) : habitName ?? _t("Чтение с переводом смыслов")}</small>
        </div>
        {view === 'read' && (
          <button type="button" className="done-btn" onClick={() => setFinish(true)}>{_t("Закончить")}</button>
        )}
      </div>

      {err && <p className="q-msg">{_t("Не удалось загрузить текст Корана. Проверь интернет и открой ещё раз.")}</p>}
      {!data && !err && <p className="q-msg">{_t("Загружаю текст…")}</p>}

      {data && view === 'list' && (
        <div className="q-list">
          <button type="button" className="q-continue" onClick={() => open(q.surah)}>
            <small>{_t("Продолжить")}</small>
            <b>{_tj("{0}. {1}, аят {2}", q.surah, data[q.surah - 1][1], q.ayah)}</b>
            <span className="ar">{data[q.surah - 1][0]}</span>
          </button>
          <div className="langs" role="group" aria-label={_t("Язык перевода")}>
            {Q_LANGS.map((l) => (
              <button key={l.id} type="button" aria-pressed={q.lang === l.id} onClick={() => setQ({ lang: l.id })}>{l.label}</button>
            ))}
          </div>
          <input className="q-find" value={find} onChange={(e) => setFind(e.target.value)} placeholder={_t("Найти суру: номер или название")} />
          {list.map(({ s, n }) => (
            <button key={n} type="button" className="q-row" onClick={() => open(n)}>
              <span className="q-n">{n}</span>
              <span className="q-t"><b>{s[1]}</b><small>{_tj("{0} · {1} аятов · {2}", s[2], s[4].length, s[3] === 'meccan' ? _t("мекканская") : _t("мединская"))}</small></span>
              <span className="ar">{s[0]}</span>
            </button>
          ))}
          <p className="q-src">{_tj("Арабский текст и перевод ({0}): «Энциклопедия Корана» (quranenc.com), через проект quran-json.", Q_LANGS.find((l) => l.id === q.lang)?.src)}</p>
        </div>
      )}

      {data && view === 'read' && (
        <Reader
          key={surah}
          n={surah}
          s={data[surah - 1]}
          startAyah={surah === 2 && okStart === 2 ? 285 : surah === q.surah ? q.ayah : 1}
          translation={q.translation}
          tr={q.tr}
          size={q.size}
          lang={q.lang}
          setQ={setQ}
          onSeen={(id) => { if (!seen.current.has(id)) { seen.current.add(id); setSeenCount(seen.current.size); } }}
          onNext={surah < 114 ? () => setSurah(surah + 1) : undefined}
        />
      )}

      {finish && (
        <div className="finish-sheet">
          <b>{_tj("Прочитано аятов: {0}", seenCount)}</b>
          <p>{habitName ? _t("Отметить «{0}»?", habitName) : _t("Закладка сохранена.")}</p>
          <div className="row2 light">
            {habitName ? (
              <>
                <button type="button" onClick={() => { onFinish('min'); onExit(); }}>{_t("Минимум")}</button>
                <button type="button" className="pri-btn" onClick={() => { onFinish('done'); onExit(); }}>{_t("Сделано")}</button>
              </>
            ) : (
              <button type="button" className="pri-btn" onClick={onExit}>{_t("Закрыть")}</button>
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => setFinish(false)}>{_t("Читать дальше")}</button>
        </div>
      )}
    </div>
  );
}

function Reader(props: {
  n: number; s: Surah; startAyah: number; translation: boolean; tr: boolean; size: number; lang: QLang;
  setQ: (p: Partial<typeof DEF>) => void; onSeen: (id: string) => void; onNext?: () => void;
}) {
  const { n, s, startAyah, translation, tr, size, lang, setQ, onSeen, onNext } = props;
  const box = useRef<HTMLDivElement>(null);
  // Russian letters for Russian speakers, Latin for everyone else.
  const reading = useMemo(() => (tr ? surahTr(n, s[4], LANG === 'ru' ? 'ru' : 'lat') : null), [n, s, tr]);

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
        <button type="button" aria-pressed={tr} onClick={() => setQ({ tr: !tr })}>{_t("Чтение")}</button>
        <button type="button" aria-pressed={translation} onClick={() => setQ({ translation: !translation })}>{_t("Перевод")}</button>
        <select value={lang} onChange={(e) => setQ({ lang: e.target.value as QLang })} aria-label={_t("Язык перевода")}>
          {Q_LANGS.map((l) => <option key={l.id} value={l.id}>{l.id.toUpperCase()}</option>)}
        </select>
        <button type="button" onClick={() => setQ({ size: Math.max(20, size - 2) })} aria-label={_t("Мельче")}>A−</button>
        <button type="button" onClick={() => setQ({ size: Math.min(40, size + 2) })} aria-label={_t("Крупнее")}>A+</button>
      </div>
      <div className="q-read" ref={box}>
        {n !== 1 && n !== 9 && <p className="basmala">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</p>}
        {s[4].map(([ar, ru], i) => (
          <div className="ayah" key={i} data-a={i + 1}>
            <p className="ayah-ar" lang="ar" dir="rtl" style={{ fontSize: size }}>
              {ar} <span className="ayah-n">{i + 1}</span>
            </p>
            {reading && <p className="ayah-tr">{reading[i]}</p>}
            {translation && <p className="ayah-ru" lang={lang}><span>{n}:{i + 1}</span> {ru}</p>}
          </div>
        ))}
        {onNext && <button type="button" className="pri-btn next-surah" onClick={onNext}>{_t("Следующая сура")}</button>}
        {reading && <p className="q-src">{_t("Чтение русскими буквами составлено по правилам из арабского текста. Оно помогает читать вместе с арабским, но не передаёт все правила таджвида. Сверяйся с арабским текстом и чтецом.")}</p>}
      </div>
    </>
  );
}
