// Live buttons (variant В): a ripple from the finger, a gold ring around a marked prayer.
// Pure decoration added from outside React: if a re-render drops a ripple, nothing is lost.

const RIPPLE = [
  '.pri-btn', '.gold-btn', '.fab', '.done-btn', '.actions .pri', '.pnow-go', '.g-do', '.g-go', '.g-add button', '.dp-go',
  '.nk-btn', '.nk-search button', '.fd-btn', '.pn-btn', '.onb-go', '.fp-new', '.fd-cam', '.adh-play', '.adh-big', '.az-big',
  '.sf-play', '.qt-sos', '.os-pray.go', '.udoc-h button', '.um-other button', '.kh-start', '.ch-inv',
  '.ghost-btn', '.dl-chip', '.ppills button', '.pmy-r', '.menu-row', '.pall', '.pmy-add', '.lw',
].join(',');

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// iOS Safari applies :active only when the page listens for touches.
document.addEventListener('touchstart', () => { /* enables :active on iOS */ }, { passive: true });

document.addEventListener('pointerdown', (e) => {
  if (still() || e.button > 0) return;
  const el = (e.target as Element | null)?.closest?.(RIPPLE) as HTMLElement | null;
  if (!el || (el as HTMLButtonElement).disabled) return;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  const w = document.createElement('span');
  w.className = 'b3-rw';
  w.setAttribute('aria-hidden', 'true');
  const d = document.createElement('span');
  d.className = 'b3-rp';
  d.style.left = `${e.clientX - r.left}px`;
  d.style.top = `${e.clientY - r.top}px`;
  // big enough to reach the far corner of the button
  d.style.setProperty('--b3-r', String(Math.ceil((Math.hypot(r.width, r.height) * 2) / 20)));
  w.appendChild(d);
  el.appendChild(w);
  setTimeout(() => w.remove(), 600);
}, { passive: true, capture: true });

// Prayer marked on Today: once the circle has turned green or gold, draw the ring around it.
document.addEventListener('click', (e) => {
  if (still()) return;
  const dot = (e.target as Element | null)?.closest?.('.dl-dot') as HTMLElement | null;
  if (!dot) return;
  // the circle may be drawn anew after the tap, so find it again by its place in the line
  const at = [...document.querySelectorAll('.dl-dot')].indexOf(dot);
  setTimeout(() => {
    const now = document.querySelectorAll<HTMLElement>('.dl-dot')[at];
    if (!now) return;
    const m = now.getAttribute('data-m');
    if (m !== 'ontime' && m !== 'late') return;
    now.classList.remove('ring');
    void now.offsetWidth;
    now.classList.add('ring');
    setTimeout(() => now.classList.remove('ring'), 1000);
  }, 80);
}, { capture: true }); // before React redraws the line, while the circle is still in the page

export {};
