// Picture cards to send to WhatsApp, Telegram or stories: drawn on a canvas, shared as a PNG with a short text.
// Only what the person chose to share goes on a card: no private habits, no amounts, no names of other people.

export const SITE = 'living-muslim.vercel.app';
const W = 1080, H = 1350;

export interface CardSpec {
  theme?: 'green' | 'night' | 'sand';
  kicker: string;               // small caps line at the top
  title?: string;               // big serif title
  ar?: string;                  // Arabic line
  body?: string;                // main text, wrapped
  src?: string;                 // source under the text
  stats?: [string, string][];   // big numbers with labels (up to 4)
  note?: string;                // line under the numbers
  foot?: string;                // line above the site address
}

function wrap(x: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/ +/)) {
      const t = line ? `${line} ${w}` : w;
      if (x.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Eight-pointed star pattern, very faint, so the card feels like the app. */
function pattern(x: CanvasRenderingContext2D, color: string) {
  x.save(); x.strokeStyle = color; x.lineWidth = 2; x.globalAlpha = .07;
  for (let gy = 0; gy < H + 120; gy += 120) for (let gx = (gy / 120) % 2 ? 60 : 0; gx < W + 120; gx += 120) {
    x.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, r = i % 2 ? 22 : 46; x.lineTo(gx + Math.cos(a) * r, gy + Math.sin(a) * r); }
    x.closePath(); x.stroke();
  }
  x.restore();
}

function logo(x: CanvasRenderingContext2D, cx: number, cy: number, color: string) {
  x.save(); x.translate(cx - 80, cy - 50); x.strokeStyle = color; x.lineWidth = 9; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(6, 72); x.lineTo(44, 72); x.arc(62, 72, 18, Math.PI, 0); x.lineTo(90, 72); x.lineTo(97, 16); x.lineTo(104, 72); x.lineTo(120, 72); x.lineTo(126, 62); x.lineTo(132, 72); x.lineTo(144, 72); x.stroke();
  x.fillStyle = '#d9ad55'; x.beginPath(); x.arc(152, 72, 8, 0, Math.PI * 2); x.fill();
  x.restore();
}

export async function drawCard(s: CardSpec): Promise<Blob | null> {
  try { await document.fonts?.ready; } catch { /* */ }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); if (!x) return null;
  const th = s.theme ?? 'green';
  const bg = th === 'night' ? ['#06120d', '#0c2a1e', '#123d2b'] : th === 'sand' ? ['#fbf4e3', '#f6ecd4', '#ecdcb4'] : ['#0b3a25', '#0f5132', '#1f7a4d'];
  const ink = th === 'sand' ? '#14261c' : '#f6ecd4', soft = th === 'sand' ? '#4f6357' : 'rgba(246,236,212,.78)', gold = th === 'sand' ? '#b88a2c' : '#e2b964';
  const g = x.createLinearGradient(0, 0, W * .4, H); g.addColorStop(0, bg[0]); g.addColorStop(.55, bg[1]); g.addColorStop(1, bg[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W * .85, H * .08, 10, W * .85, H * .08, 620); glow.addColorStop(0, th === 'sand' ? 'rgba(217,173,85,.35)' : 'rgba(217,173,85,.28)'); glow.addColorStop(1, 'rgba(217,173,85,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  pattern(x, ink);
  if (th === 'night') { for (let i = 0; i < 70; i++) { x.globalAlpha = .25 + (i % 5) / 9; x.fillStyle = '#fff'; x.beginPath(); x.arc((i * 397) % W, (i * 211) % 520, 1 + (i % 3), 0, 7); x.fill(); } x.globalAlpha = 1; }

  // Content is laid out on its own layer first, then centred between the top and the brand line.
  const page = x;
  const lc = document.createElement('canvas'); lc.width = W; lc.height = H;
  const cx2 = lc.getContext('2d'); if (!cx2) return null;
  {
  const x = cx2;
  x.textAlign = 'center';
  x.fillStyle = gold; x.font = '800 30px Manrope, system-ui, sans-serif';
  x.fillText(s.kicker.toUpperCase().split('').join(String.fromCharCode(8202)), W / 2, 40);
  let y = 70;
  if (s.title) {
    x.fillStyle = ink; x.font = '700 92px "Cormorant Garamond", Georgia, serif';
    for (const l of wrap(x, s.title, W - 160)) { y += 92; x.fillText(l, W / 2, y); }
    y += 30;
  }
  if (s.ar) {
    x.fillStyle = gold; x.font = '60px Amiri, "Noto Naskh Arabic", serif'; x.direction = 'rtl';
    for (const l of wrap(x, s.ar, W - 180)) { y += 86; x.fillText(l, W / 2, y); }
    x.direction = 'ltr'; y += 26;
  }
  if (s.body) {
    const size = s.body.length > 260 ? 40 : s.body.length > 160 ? 46 : 54;
    x.fillStyle = ink; x.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
    if (size < 50) x.font = `500 ${size}px Manrope, system-ui, sans-serif`;
    for (const l of wrap(x, s.body, W - 180)) { y += size * 1.35; x.fillText(l, W / 2, y); }
    y += 18;
  }
  if (s.src) { x.fillStyle = soft; x.font = '500 30px Manrope, system-ui, sans-serif'; for (const l of wrap(x, s.src, W - 220)) { y += 42; x.fillText(l, W / 2, y); } }
  if (s.stats?.length) {
    const n = s.stats.length, cols = n > 2 ? 2 : n, rows = Math.ceil(n / cols), top = y + 30;
    s.stats.forEach(([v, l], i) => {
      const cx = cols === 1 ? W / 2 : 300 + (i % cols) * 480, cy = top + Math.floor(i / cols) * 230 + 110;
      x.fillStyle = th === 'sand' ? 'rgba(255,255,255,.6)' : 'rgba(246,236,212,.08)';
      round(x, cx - 210, cy - 120, 420, 200, 30); x.fill();
      x.fillStyle = gold; x.font = '700 104px "Cormorant Garamond", Georgia, serif'; x.fillText(v, cx, cy);
      x.fillStyle = soft; x.font = '600 32px Manrope, system-ui, sans-serif'; x.fillText(l, cx, cy + 50);
    });
    y = top + rows * 230 - 10;
  }
  if (s.note) { x.fillStyle = ink; x.font = '600 38px Manrope, system-ui, sans-serif'; for (const l of wrap(x, s.note, W - 200)) { y += 54; x.fillText(l, W / 2, y); } }
  const ch = Math.min(y + 30, H), room = H - (s.foot ? 270 : 190) - 90;
  const top = Math.max(90, 90 + (room - ch) / 2.4);
  page.drawImage(lc, 0, 0, W, ch, 0, top, W, ch);
  }

  x.textAlign = 'center';
  if (s.foot) { x.fillStyle = soft; x.font = '500 32px Manrope, system-ui, sans-serif'; for (const [i, l] of wrap(x, s.foot, W - 200).entries()) x.fillText(l, W / 2, H - 230 + i * 44); }
  logo(x, W / 2 - 150, H - 105, ink);
  x.textAlign = 'left'; x.fillStyle = ink; x.font = '700 44px "Cormorant Garamond", Georgia, serif'; x.fillText('Living Muslim', W / 2 - 50, H - 72);
  x.textAlign = 'center'; x.fillStyle = soft; x.font = '600 28px Manrope, system-ui, sans-serif'; x.fillText(SITE, W / 2, H - 28);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}

function round(x: CanvasRenderingContext2D, l: number, t: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}

/** Opens the share sheet with the picture and the text. Without file sharing: saves the picture and copies the text. */
export async function shareCard(spec: CardSpec, name: string, text: string): Promise<'shared' | 'saved' | 'cancel'> {
  const b = await drawCard(spec);
  if (!b) return 'cancel';
  const file = new File([b], `${name}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return 'shared'; }
  } catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancel'; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  try { await navigator.clipboard?.writeText(text); } catch { /* */ }
  return 'saved';
}
