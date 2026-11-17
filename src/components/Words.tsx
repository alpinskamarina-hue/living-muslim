import { useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { cardOfDay, g, pick, type Card, type Mode, type SayDetail, type Sex, type Trigger } from '../words';

export const modeOf = (s: AppState): Mode => s.settings.words ?? 'calm';
export const sexOf = (s: AppState): Sex => s.settings.me ?? '';

const KIND: Record<Card['kind'], string> = { phrase: '', ayah: 'Аят', hadith: 'Хадис', athar: 'Слова сподвижника', dua: 'Дуа' };

/** One short phrase or one ayah/hadith at a time, at the bottom of the screen, gone by itself. */
export function WordsLayer({ state, today }: { state: AppState; today: string }) {
  const [card, setCard] = useState<{ c: Card; extra?: string; k: number } | null>(null);
  const timer = useRef<number>();
  const busy = useRef(0);
  const mode = modeOf(state);
  const sex = sexOf(state);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<SayDetail>).detail;
      // One card per action: a burst of events (all five + on time) shows only the first, strongest one.
      if (Date.now() - busy.current < 1200) return;
      const c = pick(d.t, today, mode);
      if (!c) return;
      busy.current = Date.now();
      setCard({ c, extra: d.extra, k: Date.now() });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCard(null), c.kind === 'phrase' ? 3200 : 9000);
    };
    window.addEventListener('lm:say', on);
    return () => window.removeEventListener('lm:say', on);
  }, [today, mode]);
  if (!card) return null;
  const { c } = card;
  return (
    <div className={`wd wd-${c.kind}`} key={card.k} role="status" aria-live="polite" onClick={() => setCard(null)}>
      {c.kind === 'phrase' ? (
        <>
          {c.ar && <span className="wd-ar" lang="ar">{c.ar}</span>}
          <b>{g(c.head ?? '', sex)}</b>
          <small>{card.extra ? `${card.extra} ` : ''}{g(c.ru, sex)}</small>
        </>
      ) : (
        <>
          <em>{KIND[c.kind]}</em>
          {c.head && <b>{g(c.head, sex)}</b>}
          {c.ar && <span className="wd-ar" lang="ar">{c.ar}</span>}
          <p>{g(c.ru, sex)}</p>
          {c.src && <small className="wd-src">{c.src}</small>}
        </>
      )}
    </div>
  );
}

/** A quiet card inside a section: the same one all day, can be hidden for the day. */
export function WordCard({ t, state, today, className }: { t: Trigger; state: AppState; today: string; className?: string }) {
  const key = `lm.wc.${t}.${today}`;
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(key) === '1'; } catch { return false; } });
  const c = cardOfDay(t, today, modeOf(state));
  if (!c || hidden) return null;
  const sex = sexOf(state);
  const hide = () => { setHidden(true); try { localStorage.setItem(key, '1'); } catch { /* */ } };
  return (
    <div className={`wc ${className ?? ''}`}>
      <div className="wc-top"><em>{KIND[c.kind] || 'Напоминание'}</em><button type="button" onClick={hide} aria-label="Скрыть на сегодня">×</button></div>
      {c.head && c.kind !== 'phrase' && <b>{g(c.head, sex)}</b>}
      {c.ar && <span className="wd-ar" lang="ar">{c.ar}</span>}
      <p>{c.kind === 'phrase' ? `${g(c.head ?? '', sex)}. ` : ''}{g(c.ru, sex)}</p>
      {c.src && <small className="wd-src">{c.src}</small>}
    </div>
  );
}
