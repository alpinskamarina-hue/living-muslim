// Profile picture without a photo: initials, an emoji or a geometric pattern, drawn as a small SVG.

export type AvatarKind = 'initials' | 'emoji' | 'pattern' | 'photo';
export interface AvatarPick { k?: AvatarKind; v?: string; c?: string }

export const EMOJIS = ['🌙', '🕌', '🌿', '🌸', '🦁', '🦅', '🐎', '🌴', '⭐', '📖', '🤲', '☀️'];
export const PATTERNS = ['star', 'arch', 'dots', 'waves'];
export const COLORS = ['#1f7a4d', '#0f5132', '#b88a2c', '#3d6fb0', '#8a5ab0', '#b04f5a', '#2f8f8a', '#5a6d61'];

const enc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function patternBody(id: string): string {
  const s = 'rgba(255,255,255,.55)';
  switch (id) {
    case 'arch':
      return `<g fill="none" stroke="${s}" stroke-width="3"><path d="M30 92V52a20 20 0 0 1 40 0v40"/><path d="M40 92V56a10 10 0 0 1 20 0v36"/><path d="M14 92V44a36 36 0 0 1 72 0v48"/></g>`;
    case 'dots':
      return `<g fill="${s}">${[20, 40, 60, 80].flatMap((x) => [20, 40, 60, 80].map((y) => `<circle cx="${x}" cy="${y}" r="${(x + y) % 40 ? 3 : 5}"/>`)).join('')}</g>`;
    case 'waves':
      return `<g fill="none" stroke="${s}" stroke-width="3">${[28, 44, 60, 76].map((y) => `<path d="M0 ${y}q12.5-10 25 0t25 0t25 0t25 0"/>`).join('')}</g>`;
    default: {
      // eight-point star (khatam)
      const sq = (r: number) => `<rect x="${50 - r}" y="${50 - r}" width="${2 * r}" height="${2 * r}"/>`;
      return `<g fill="none" stroke="${s}" stroke-width="3">${sq(22)}<g transform="rotate(45 50 50)">${sq(22)}</g>${sq(11)}<g transform="rotate(45 50 50)">${sq(11)}</g></g>`;
    }
  }
}

/** A data URL for an emoji or pattern avatar; '' for initials (drawn by the caller) or a photo (use the photo). */
export function avatarUrl(a: AvatarPick | undefined, color: string, photo = ''): string {
  if (a?.k === 'photo') return photo || '';
  if (a?.k === 'emoji' && a.v) {
    return enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${color}"/><text x="50" y="52" font-size="54" text-anchor="middle" dominant-baseline="central">${a.v}</text></svg>`);
  }
  if (a?.k === 'pattern') {
    return enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath><g clip-path="url(#c)"><rect width="100" height="100" fill="${color}"/>${patternBody(a.v || 'star')}</g></svg>`);
  }
  return '';
}

/** Shrinks a picked photo to a 256px square JPEG data URL (about 20–40 KB). */
export async function squarePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    c.getContext('2d')!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    for (const q of [0.82, 0.7, 0.55]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length < 110_000) return d;
    }
    return c.toDataURL('image/jpeg', 0.4);
  } finally { URL.revokeObjectURL(url); }
}
