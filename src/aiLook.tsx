// How the assistant looks: a round Moroccan-style badge (gold ornament on a colour the person picks) or their own photo.
// The photo stays on this device only (localStorage), it is never synced or sent anywhere.
import { useEffect, useState } from 'react';
import type { Settings } from './types';

export const AI_STYLES = ['fes', 'zellige', 'arch', 'rose'] as const;
/** Faces without eyes or mouth: brothers with a beard, sisters in hijab. */
export const AI_PEOPLE = ['m1', 'm2', 'm3', 'm4', 'f1', 'f2', 'f3', 'f4'] as const;
export type AiStyle = (typeof AI_STYLES)[number] | (typeof AI_PEOPLE)[number] | 'photo';
export const AI_COLORS: Record<string, [string, string]> = {
  green: ['#0b3f27', '#1f7a4d'],
  teal: ['#0b3c3a', '#1c7a72'],
  blue: ['#173f73', '#2f6db3'],
  terra: ['#7a3019', '#b8592f'],
  purple: ['#3d1f55', '#74489a'],
  black: ['#121614', '#3a423d'],
};
const GOLD = '#d9b25f', GOLD2 = '#f1d896';

const star = (cx: number, cy: number, r: number, rot = 0) => {
  const p: string[] = [];
  for (let i = 0; i < 16; i++) { const a = rot + i * Math.PI / 8; const rr = i % 2 ? r * 0.7654 : r; p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`); }
  return p.join(' ');
};
const poly = (cx: number, cy: number, r: number, n: number, rot = 0) =>
  Array.from({ length: n }, (_, i) => { const a = rot + i * 2 * Math.PI / n; return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`; }).join(' ');

const SKIN = ['#f1d3b8', '#d9a97e', '#a8754c', '#7a5134'];
const MEN: Record<string, { skin: string; beard: 'full' | 'short' | 'long'; hat: 'kufi' | 'none' | 'shemagh'; hair: string; cloth: string }> = {
  m1: { skin: SKIN[0], beard: 'full', hat: 'kufi', hair: '#3b2a1e', cloth: '#f4f1e8' },
  m2: { skin: SKIN[1], beard: 'short', hat: 'none', hair: '#1f1a17', cloth: '#e9edf2' },
  m3: { skin: SKIN[2], beard: 'long', hat: 'shemagh', hair: '#14110f', cloth: '#f6f2ea' },
  m4: { skin: SKIN[3], beard: 'full', hat: 'kufi', hair: '#0f0d0c', cloth: '#1c3b2f' },
};
const WOMEN: Record<string, { skin: string; hijab: string; trim: string; pin?: boolean }> = {
  f1: { skin: SKIN[0], hijab: '#f3ece0', trim: '#d9b25f', pin: true },
  f2: { skin: SKIN[1], hijab: '#2b2338', trim: '#9b7fc0' },
  f3: { skin: SKIN[2], hijab: '#1f5a45', trim: '#f1d896', pin: true },
  f4: { skin: SKIN[3], hijab: '#e8d3c4', trim: '#b8592f' },
};
function person(style: string): string {
  let s = `<polygon points="${star(50, 46, 40, Math.PI / 8)}" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".35"/>`;
  const m = MEN[style];
  if (m) {
    s += `<path d="M18 100 C20 80 34 72 50 72 C66 72 80 80 82 100Z" fill="${m.cloth}"/><rect x="43" y="58" width="14" height="14" fill="${m.skin}"/>`
      + `<ellipse cx="50" cy="44" rx="17" ry="21" fill="${m.skin}"/><ellipse cx="33.5" cy="45" rx="2.6" ry="4.5" fill="${m.skin}"/><ellipse cx="66.5" cy="45" rx="2.6" ry="4.5" fill="${m.skin}"/>`;
    if (m.beard === 'full') s += `<path d="M33 44 C33 60 40 72 50 74 C60 72 67 60 67 44 C64 54 58 58 50 58 C42 58 36 54 33 44Z" fill="${m.hair}"/>`;
    if (m.beard === 'short') s += `<path d="M34 47 C35 58 42 66 50 67 C58 66 65 58 66 47 C62 55 57 57 50 57 C43 57 38 55 34 47Z" fill="${m.hair}"/>`;
    if (m.beard === 'long') s += `<path d="M33 44 C32 66 40 82 50 86 C60 82 68 66 67 44 C64 56 58 59 50 59 C42 59 36 56 33 44Z" fill="${m.hair}"/>`;
    if (m.hat === 'kufi') s += `<path d="M33 34 C33 20 67 20 67 34 Z" fill="#fff"/><path d="M34 31 H66" stroke="${GOLD}" stroke-width="1.4" stroke-dasharray="2 2"/>`;
    else if (m.hat === 'shemagh') s += `<path d="M30 46 C28 22 40 16 50 16 C60 16 72 22 70 46 L74 70 C66 64 64 52 66 40 C60 30 40 30 34 40 C36 52 34 64 26 70Z" fill="#fff"/><path d="M33 26 C44 20 56 20 67 26" stroke="#c0392b" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/><path d="M33 30 C44 25 56 25 67 30" stroke="#222" stroke-width="2.5" fill="none"/>`;
    else s += `<path d="M33 40 C32 24 42 19 50 19 C60 19 68 24 67 40 C64 30 58 27 50 27 C42 27 36 30 33 40Z" fill="${m.hair}"/>`;
    return s;
  }
  const w = WOMEN[style] ?? WOMEN.f1;
  return s + `<path d="M14 100 C16 76 30 66 50 66 C70 66 84 76 86 100Z" fill="${w.hijab}"/>`
    + `<path d="M28 50 C26 24 38 14 50 14 C62 14 74 24 72 50 C72 64 64 74 50 76 C36 74 28 64 28 50Z" fill="${w.hijab}"/>`
    + `<ellipse cx="50" cy="46" rx="14" ry="18" fill="${w.skin}"/>`
    + `<path d="M36 34 C40 27 60 27 64 34" stroke="${w.trim}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
    + (w.pin ? `<circle cx="66" cy="68" r="2.6" fill="${GOLD2}"/>` : '');
}

function body(style: string, c: [string, string]): string {
  const bg = `<defs><radialGradient id="g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[0]}"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`;
  if (/^[mf][1-4]$/.test(style)) return bg + person(style);
  switch (style) {
    case 'zellige': {
      const corner = (x: number, y: number) => `<polygon points="${poly(x, y, 4, 4, Math.PI / 4)}" fill="${GOLD}" opacity=".55"/>`;
      return bg + `<defs><pattern id="p" width="25" height="25" patternUnits="userSpaceOnUse"><polygon points="${star(12.5, 12.5, 9, Math.PI / 8)}" fill="none" stroke="${GOLD}" stroke-width="1"/>${corner(0, 0)}${corner(25, 0)}${corner(0, 25)}${corner(25, 25)}<circle cx="12.5" cy="12.5" r="2" fill="${GOLD2}"/></pattern></defs>`
        + `<rect width="100" height="100" fill="url(#p)" opacity=".9"/><circle cx="50" cy="50" r="22" fill="${c[0]}" stroke="${GOLD2}" stroke-width="2"/>`
        + `<polygon points="${star(50, 50, 15, Math.PI / 8)}" fill="${GOLD2}"/><circle cx="50" cy="50" r="4.5" fill="${c[0]}"/>`;
    }
    case 'arch':
      return bg + `<circle cx="50" cy="50" r="46" fill="none" stroke="${GOLD}" stroke-width="1" stroke-dasharray="2 3" opacity=".8"/>`
        + `<path d="M30 82 V52 A20 22 0 0 1 36 34 A20 20 0 0 1 64 34 A20 22 0 0 1 70 52 V82 Z" fill="${c[0]}" stroke="${GOLD2}" stroke-width="2"/>`
        + `<path d="M36 82 V54 A14 16 0 0 1 64 54 V82" fill="none" stroke="${GOLD}" stroke-width="1.2"/>`
        + `<path d="M55 47 a9 9 0 1 1 -9 -11 a7 7 0 1 0 9 11 z" fill="${GOLD2}"/>`
        + `<polygon points="${poly(57, 37, 2.6, 5, -Math.PI / 2)}" fill="${GOLD2}"/><rect x="26" y="82" width="48" height="3" rx="1.5" fill="${GOLD}"/>`;
    case 'rose': {
      let rays = '';
      for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; rays += `<line x1="50" y1="50" x2="${(50 + 30 * Math.cos(a)).toFixed(1)}" y2="${(50 + 30 * Math.sin(a)).toFixed(1)}" stroke="${GOLD}" stroke-width=".8" opacity=".6"/>`; }
      return bg + rays + `<polygon points="${star(50, 50, 38, 0)}" fill="none" stroke="${GOLD}" stroke-width="1.3"/>`
        + `<polygon points="${star(50, 50, 38, Math.PI / 8)}" fill="none" stroke="${GOLD}" stroke-width="1.3"/>`
        + `<circle cx="50" cy="50" r="19" fill="${c[0]}" stroke="${GOLD2}" stroke-width="2"/>`
        + `<polygon points="${poly(50, 50, 12, 8, Math.PI / 8)}" fill="none" stroke="${GOLD2}" stroke-width="1.4"/><circle cx="50" cy="50" r="4" fill="${GOLD2}"/>`;
    }
    default: // fes: the eight-point khatam star
      return bg + `<circle cx="50" cy="50" r="46" fill="none" stroke="${GOLD}" stroke-width="1.2" opacity=".7"/>`
        + `<polygon points="${poly(50, 50, 40, 4, Math.PI / 4)}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`
        + `<polygon points="${poly(50, 50, 40, 4, 0)}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`
        + `<polygon points="${star(50, 50, 27, Math.PI / 8)}" fill="${c[0]}" stroke="${GOLD2}" stroke-width="1.8"/>`
        + `<polygon points="${star(50, 50, 15, 0)}" fill="none" stroke="${GOLD}" stroke-width="1.2"/><circle cx="50" cy="50" r="5" fill="${GOLD2}"/>`;
  }
}

const cache = new Map<string, string>();
/** Data URL of a badge. */
export function badgeUrl(style: string, color: string): string {
  const k = style + color;
  let u = cache.get(k);
  if (!u) {
    u = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body(style, AI_COLORS[color] ?? AI_COLORS.green)}</svg>`)}`;
    cache.set(k, u);
  }
  return u;
}

// ───── Own photo, on this device only ─────
const PHOTO = 'lm.ai.photo';
export const getAiPhoto = () => { try { return localStorage.getItem(PHOTO) || ''; } catch { return ''; } };
export function setAiPhoto(url: string) {
  try { if (url) localStorage.setItem(PHOTO, url); else localStorage.removeItem(PHOTO); } catch { /* private mode / full */ }
  window.dispatchEvent(new Event('lm-ai-photo'));
}
export function useAiPhoto() {
  const [p, setP] = useState(getAiPhoto);
  useEffect(() => { const f = () => setP(getAiPhoto()); window.addEventListener('lm-ai-photo', f); return () => window.removeEventListener('lm-ai-photo', f); }, []);
  return p;
}
/** Square-crops and shrinks a picked image to 256 px JPEG, small enough for localStorage. */
export function photoToUrl(file: File): Promise<string> {
  return new Promise((ok, bad) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), N = 256;
      const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
      cv.getContext('2d')!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, N, N);
      URL.revokeObjectURL(src);
      ok(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(src); bad(new Error('image')); };
    img.src = src;
  });
}

export const AI_FINISHES = ['medal', 'pearl', 'halo', 'glass', 'night'] as const;
export type AiFinish = (typeof AI_FINISHES)[number];

/** A round picture with the chosen 3D finish (shine, rim, glow). `live` adds the moving glint and the sparkle. */
export function Ai3D({ url, size, finish = 'medal', live = false, className = '' }: { url: string; size: number; finish?: string; live?: boolean; className?: string }) {
  return (
    <span className={`ai3d f-${finish}${live ? ' live' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <img className="ai-face" src={url} alt="" draggable={false} />
      {live && <i className="ai-spark" />}
    </span>
  );
}

/** The assistant's round face: own photo if chosen and present, else the badge or a person, in the chosen 3D finish. */
/** Without a chosen avatar: a sister in hijab for sisters, a brother for brothers, the medallion otherwise. */
export const aiDefaultStyle = (s: Settings) => (s.me === 'f' ? 'f3' : s.me === 'm' ? 'm1' : 'fes');
export function AiFace({ s, size = 40, className = '', live = false }: { s: Settings; size?: number; className?: string; live?: boolean }) {
  const photo = useAiPhoto();
  const url = s.aiStyle === 'photo' && photo ? photo : badgeUrl(s.aiStyle && s.aiStyle !== 'photo' ? s.aiStyle : aiDefaultStyle(s), s.aiColor || 'green');
  return <Ai3D url={url} size={size} finish={s.aiFinish || 'medal'} live={live} className={className} />;
}
