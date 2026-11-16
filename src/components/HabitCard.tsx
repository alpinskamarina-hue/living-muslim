import { useRef, useState } from 'react';
import type { Habit, Mark } from '../types';
import { sphereName } from '../types';
import { plural } from '../dates';

const Ticks = () => (
  <svg viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
    <path d="M1 6.5l3 3 6-7M7 9.5l1 .5 7-8" />
  </svg>
);

interface Props {
  habit: Habit;
  mark?: Mark;
  streak: number;
  risk: boolean;
  onMark: (m: Mark | null) => void;
  onOpen: () => void;
  ramadanMin?: boolean;
}

const OPEN = -168;

export function HabitCard({ habit, mark, streak, risk, onMark, onOpen, ramadanMin }: Props) {
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; moved: boolean } | null>(null);
  const state = mark ?? 'todo';

  const close = () => setX(0);

  return (
    <div className="sw">
      <div className="acts">
        <button type="button" className="mn" onClick={() => { onMark('min'); close(); }}>
          ½<span>Минимум</span>
        </button>
        <button type="button" className="lt" onClick={() => { onMark(mark === 'later' ? null : 'later'); close(); }}>
          ⏱<span>{mark === 'later' ? 'Вернуть' : 'Позже'}</span>
        </button>
      </div>
      <div
        className="card"
        data-s={state}
        data-sphere={habit.sphere}
        style={{ transform: x ? `translateX(${x}px)` : undefined, transition: drag ? 'none' : undefined }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.chk')) return;
          start.current = { x: e.clientX, y: e.clientY, base: x, moved: false };
          setDrag(true);
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dx = e.clientX - s.x;
          if (!s.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - s.y)) {
            s.moved = true;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (s.moved) setX(Math.min(0, Math.max(OPEN, s.base + dx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDrag(false);
          if (!s) return;
          if (!s.moved) {
            if (x !== 0) close();
            else onOpen();
            return;
          }
          setX(x < -60 ? OPEN : 0);
        }}
        onPointerCancel={() => { start.current = null; setDrag(false); setX(0); }}
      >
        <button
          type="button"
          className="chk"
          aria-label={state === 'done' ? 'Снять отметку' : 'Отметить выполненной'}
          onClick={() => onMark(state === 'done' ? null : 'done')}
        >
          <Ticks />
        </button>
        <div className="x">
          <div className="nm">{habit.action}</div>
          <div className="mt">
            <span className="sp">{sphereName(habit.sphere)}</span>
            {habit.min && <span className="minl">{ramadanMin ? '🌙 в Рамадан хватит: ' : 'минимум: '}{habit.min}</span>}
            {state === 'later' && <span className="later-tag">отложено</span>}
          </div>
          {risk && <div className="risk">Вчера пропуск. Сегодня хватит и минимума</div>}
        </div>
        <div className="st">
          {habit.formed ? (
            <span className="formed" title="Закреплена">✓</span>
          ) : (
            <>
              {streak}
              <small>{plural(streak, 'день', 'дня', 'дней')}</small>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { Ticks };
