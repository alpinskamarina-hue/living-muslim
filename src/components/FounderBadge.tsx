// The founder's badge by level (Nasim, 23.11): the cornerstone, the two crescents, the eight-point star, the medal.
// Inline SVG, animated with CSS (.fb in styles.css); `open` plays the one-time entrance gesture.
import { useEffect, useId, useState } from 'react';
import { useFounderTier, type Tier } from '../founders';

const G = '#e0b45c', G2 = '#b5832a', D = '#13402d', D2 = '#0b2219', L = '#f6e2b5';

export function FounderBadge({ tier, size = 16, open = false, title }: { tier: Tier; size?: number; open?: boolean; title?: string }) {
  const u = useId().replace(/:/g, '');
  let body: JSX.Element;
  if (tier === 'f100') body = (
    <>
      <defs><linearGradient id={u} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={L} /><stop offset="1" stopColor={G2} /></linearGradient></defs>
      <g className="stone"><polygon points="8,17 24,25 24,41 8,33" fill={D} /><polygon points="24,25 40,17 40,33 24,41" fill={D2} />
        <polygon points="24,9 40,17 24,25 8,17" fill={`url(#${u})`} /><polygon points="24,9 40,17 24,25 8,17" fill="none" stroke={G} strokeWidth="1.2" strokeLinejoin="round" />
        <polygon className="shine" points="12,17 24,11 30,14 18,20" fill="#fff8e6" /></g>
    </>
  );
  else if (tier === 'f250') body = (
    <>
      <defs><radialGradient id={u}><stop offset="0" stopColor="#fff2c8" /><stop offset="1" stopColor={G} /></radialGradient></defs>
      <g className="cl"><path d="M19 9 A15 15 0 1 0 19 39 A21 21 0 0 1 19 9 Z" fill={G} /></g>
      <g className="cr"><path d="M29 9 A15 15 0 1 1 29 39 A21 21 0 0 0 29 9 Z" fill={G2} /></g>
      <circle className="heart" cx="24" cy="24" r="3.2" fill={`url(#${u})`} />
    </>
  );
  else if (tier === 'f500') body = (
    <>
      <defs><radialGradient id={u}><stop offset="0" stopColor="#fff2c8" /><stop offset="1" stopColor={G} /></radialGradient></defs>
      <g className="star"><rect x="10" y="10" width="28" height="28" rx="3" fill={D} stroke={G} strokeWidth="1.6" />
        <rect x="10" y="10" width="28" height="28" rx="3" fill={D} stroke={G} strokeWidth="1.6" transform="rotate(45 24 24)" />
        <circle cx="24" cy="24" r="9" fill={D2} stroke={G2} strokeWidth="1" /></g>
      <circle className="core" cx="24" cy="24" r="4" fill={`url(#${u})`} />
    </>
  );
  else body = (
    <>
      <defs><linearGradient id={u} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={L} /><stop offset="1" stopColor={G2} /></linearGradient></defs>
      <circle cx="24" cy="24" r="23" fill={D} />
      <circle className="rim" cx="24" cy="24" r="20.5" fill="none" stroke={G} strokeWidth="2.2" />
      <g className="moon"><path d="M22 8.5 A15.5 15.5 0 1 0 22 39.5 A19.5 19.5 0 0 1 22 8.5 Z" fill={`url(#${u})`} />
        <path d="M31 17 L32.6 21.4 L37 23 L32.6 24.6 L31 29 L29.4 24.6 L25 23 L29.4 21.4 Z" fill={G} /></g>
    </>
  );
  return (
    <span className={`fb fb-${tier}${open ? ' open' : ''}`} style={{ width: size, height: size }} title={title} aria-hidden={title ? undefined : true}>
      <svg viewBox="0 0 48 48" width={size} height={size}>{body}</svg>
    </span>
  );
}

/** The small badge next to someone's name in chats and lists; nothing while the level is unknown or the person is not a founder. */
export function FounderMark({ uid, size = 14 }: { uid: string; size?: number }) {
  const tier = useFounderTier(uid);
  return tier ? <FounderBadge tier={tier} size={size} /> : null;
}

/** Plays the entrance gesture once after mount (the big badge on a person's page). */
export function useOpenOnce() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOpen(true), 30); return () => clearTimeout(t); }, []);
  return open;
}
