import { hasVoice, speak } from '../speech';

// Recorded Arabic clips of the A1 course (public/app/ar/<id>.mp3). Phone Arabic voices are often missing or poor,
// so course phrases play these files; anything else falls back to the phone voice.
let cur: HTMLAudioElement | null = null;

export function stopClip() {
  try { cur?.pause(); } catch { /* */ }
  cur = null;
}

export function playClip(id: string, slow = false): Promise<boolean> {
  stopClip();
  return new Promise((res) => {
    const a = new Audio(`/app/ar/${id}.mp3`);
    a.defaultPlaybackRate = a.playbackRate = slow ? 0.75 : 1;
    cur = a;
    a.onended = () => { if (cur === a) cur = null; res(true); };
    a.onpause = () => { if (cur !== a) res(true); };
    a.onerror = () => res(false);
    a.play().catch(() => res(false));
  });
}

let map: Promise<Map<string, string>> | null = null;
const key = (s: string) => s.trim().replace(/[\s،,.!?؟]+/g, ' ').trim();

/** Clip id for an Arabic phrase from the course, if there is one. */
export function arClipFor(text: string): Promise<string | null> {
  map ??= import('./ar1').then(({ AR1, LETTERS }) => {
    const m = new Map<string, string>();
    AR1.forEach((l, i) => {
      l.p.forEach(([ar], j) => m.set(key(ar), `l${i}p${j}`));
      l.d.forEach(([, ar], j) => { if (!m.has(key(ar))) m.set(key(ar), `l${i}d${j}`); });
    });
    LETTERS.flat().forEach((x, n) => { if (!m.has(key(x[1]))) m.set(key(x[1]), `k${n}`); if (!m.has(key(x[4]))) m.set(key(x[4]), `k${n}e`); });
    return m;
  }).catch(() => new Map());
  return map.then((m) => m.get(key(text)) ?? null);
}

/** Say an Arabic phrase: the recorded clip when the course has it, else the phone voice. False when nothing could play. */
export async function sayAr(text: string, slow = false): Promise<boolean> {
  const id = await arClipFor(text);
  if (id && (await playClip(id, slow))) return true;
  if (hasVoice('ar-SA') === false) return false;
  await speak(text, slow, 'ar-SA');
  return true;
}
