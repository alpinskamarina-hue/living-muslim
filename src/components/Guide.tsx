import { useState } from 'react';
import type { AppState } from '../types';
import { FAQ, FIRST_WEEK, GUIDE, HINTS, type GoTo } from '../guide';

const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/** «Первая неделя»: seven small steps on Today, found automatically once done. */
export function FirstWeek({ state, joined, go }: { state: AppState; joined: boolean; go: (t: GoTo) => void }) {
  const [hidden, setHidden] = useState(() => ls.get('lm.fw') === 'hide');
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  const steps = FIRST_WEEK.map((s) => ({ ...s, ok: s.done(state, joined) }));
  const n = steps.filter((s) => s.ok).length;
  if (n === steps.length) return null;
  const next = steps.find((s) => !s.ok)!;
  const hide = () => { ls.set('lm.fw', 'hide'); setHidden(true); };
  return (
    <div className="fw">
      <div className="fw-top">
        <button type="button" className="fw-h" onClick={() => setOpen(!open)} aria-expanded={open}>
          <em>Первая неделя</em>
          <b>{n} из {steps.length} · {open ? 'свернуть' : 'показать все шаги'} {open ? '▴' : '▾'}</b>
        </button>
        <button type="button" className="fw-x" onClick={hide} aria-label="Скрыть">×</button>
      </div>
      <span className="fw-bar"><i style={{ width: `${(n / steps.length) * 100}%` }} /></span>
      {!open && (
        <button type="button" className="fw-step next" onClick={() => go(next.go)}>
          <i />
          <span><b>{next.t}</b><small>{next.sub}</small></span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {open && (
        <div className="fw-list">
          {steps.map((s) => (
            <button key={s.id} type="button" className={`fw-step${s.ok ? ' ok' : ''}${s.id === next.id ? ' next' : ''}`} onClick={() => go(s.go)} disabled={s.ok}>
              <i>{s.ok ? '✓' : ''}</i>
              <span><b>{s.t}</b>{!s.ok && <small>{s.sub}</small>}</span>
              {!s.ok && <span aria-hidden="true">›</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A short hint shown the first time a section is opened. */
export function Hint({ id }: { id: keyof typeof HINTS }) {
  const key = `lm.hint.${id}`;
  const [seen, setSeen] = useState(() => ls.get(key) === '1');
  if (seen) return null;
  const h = HINTS[id];
  return (
    <div className="hint" role="note">
      <b>💡 {h.t}</b>
      <p>{h.p}</p>
      <button type="button" className="link-btn" onClick={() => { ls.set(key, '1'); setSeen(true); }}>Понятно</button>
    </div>
  );
}

/** Send the web guide to someone: the system share sheet, or copy the link. */
function shareGuide() {
  const url = `${location.origin}/guide/?lang=ru`;
  if (navigator.share) { navigator.share({ title: 'Как пользоваться Living Muslim', url }).catch(() => {}); return; }
  navigator.clipboard?.writeText(url).then(() => alert('Ссылка на гид скопирована'), () => {});
}

/** Profile → «Как пользоваться»: every part of the app in three lines, with a button that opens it. */
export function GuidePage({ go }: { go: (t: GoTo) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState<number | null>(null);
  return (
    <div className="guide">
      <p className="guide-intro">Living Muslim строит день вокруг пяти намазов. Начни с намазов и одной маленькой привычки, остальное подключай, когда будешь готов.</p>
      <div className="guide-web">
        <a href="/guide/?lang=ru" target="_blank" rel="noopener">📖 Полный гид на сайте</a>
        <a href="/guide/?lang=ru#ru-umrah" target="_blank" rel="noopener">🕋 Подробно про умру</a>
        <button type="button" onClick={shareGuide}>Отправить гид другу</button>
      </div>
      {GUIDE.map((sec) => (
        <section key={sec.h}>
          <h3 className="ch-h">{sec.h}</h3>
          <div className="guide-list">
            {sec.items.map((it) => (
              <div key={it.id} className={`guide-it${open === it.id ? ' open' : ''}`}>
                <button type="button" className="guide-head" onClick={() => setOpen(open === it.id ? null : it.id)} aria-expanded={open === it.id}>
                  <span className="mi" aria-hidden="true">{it.ic}</span>
                  <span className="mt"><b>{it.title}</b><small>{it.why}</small></span>
                  <i aria-hidden="true">{open === it.id ? '▴' : '▾'}</i>
                </button>
                {open === it.id && (
                  <div className="guide-body">
                    <ol>{it.how.map((h) => <li key={h}>{h}</li>)}</ol>
                    {it.tip && <p className="guide-tip">💡 {it.tip}</p>}
                    {it.go && <button type="button" className="pri-btn" onClick={() => go(it.go!)}>{it.open ?? 'Открыть'}</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <h3 className="ch-h">Частые вопросы</h3>
      <div className="guide-list">
        {FAQ.map((f, i) => (
          <div key={f.q} className={`guide-it${q === i ? ' open' : ''}`}>
            <button type="button" className="guide-head" onClick={() => setQ(q === i ? null : i)} aria-expanded={q === i}>
              <span className="mt"><b>{f.q}</b></span>
              <i aria-hidden="true">{q === i ? '▴' : '▾'}</i>
            </button>
            {q === i && <div className="guide-body"><p>{f.a}</p></div>}
          </div>
        ))}
      </div>
      <button type="button" className="link-btn" onClick={() => { try { localStorage.removeItem('lm.fw'); Object.keys(HINTS).forEach((k) => localStorage.removeItem(`lm.hint.${k}`)); } catch { /* */ } go({ tab: 'today' }); }}>Показать подсказки и «Первую неделю» снова</button>
    </div>
  );
}
