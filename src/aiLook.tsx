// How the assistant looks: a round Moroccan-style badge (gold ornament on a colour the person picks) or their own photo.
// The photo stays on this device only (localStorage), it is never synced or sent anywhere.
import { useEffect, useState } from 'react';
import type { Settings } from './types';
import { aiName } from './assistant';

export const AI_STYLES = ['fes', 'zellige', 'arch', 'rose'] as const;
export type AiStyle = (typeof AI_STYLES)[number] | 'photo';
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

function body(style: string, c: [string, string]): string {
  const bg = `<defs><radialGradient id="g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[0]}"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/>`;
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

/** The assistant's round face: own photo if chosen and present, else the ornament badge. */
export function AiFace({ s, size = 40, className = '' }: { s: Settings; size?: number; className?: string }) {
  const photo = useAiPhoto();
  const url = s.aiStyle === 'photo' && photo ? photo : badgeUrl(s.aiStyle && s.aiStyle !== 'photo' ? s.aiStyle : 'fes', s.aiColor || 'green');
  return <img className={`ai-face ${className}`} src={url} width={size} height={size} alt="" aria-hidden="true" draggable={false} data-name={aiName(s)} />;
}
