import { _t } from '../i18n';
// The lap counter drawn as the place itself: the Kaaba seen from above with seven lanes of tawaf around it,
// or the corridor between Safa and Marwa with seven passes. Finished laps turn gold, the newest one draws
// itself counterclockwise from the Black Stone, as the pilgrim walked it.

const C = 160;
const lane = (i: number) => 70 + i * 12;
// A full circle starting at the Black Stone line (east) and going counterclockwise on screen.
const ring = (r: number) => `M ${C + r} ${C} A ${r} ${r} 0 1 0 ${C - r} ${C} A ${r} ${r} 0 1 0 ${C + r} ${C}`;

// Fixed scatter of people on the mataf, so it looks alive but does not jump on every render.
const CROWD = Array.from({ length: 140 }, (_, i) => {
  const a = (i * 137.508 * Math.PI) / 180;
  const r = 64 + ((i * 53) % 92);
  return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
});

export function TawafScene({ n }: { n: number }) {
  return (
    <svg viewBox="0 0 320 320" className="scene" aria-hidden="true">
      <circle cx={C} cy={C} r={156} className="sc-floor" />
      {CROWD.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.6} className="sc-crowd" />)}
      {Array.from({ length: 7 }, (_, i) => (
        <path key={i} d={ring(lane(i))} pathLength={1}
          className={i < n ? `sc-lap done${i === n - 1 ? ' fresh' : ''}` : i === n ? 'sc-lap now' : 'sc-lap'} />
      ))}
      {/* Start line from the Black Stone corner outwards. */}
      <line x1={C + 44} y1={C} x2={C + 152} y2={C} className="sc-start" />
      {/* Hijr Ismail: the low semicircular wall by the north-west face. */}
      <path d={`M ${C - 4} ${C - 40} A 25 25 0 0 0 ${C - 40} ${C - 4}`} className="sc-hijr" />
      {/* Maqam Ibrahim in front of the door. */}
      <circle cx={C + 34} cy={C - 34} r={4} className="sc-maqam" />
      {/* The Kaaba: black, a gold band, the door on the north-east face. */}
      <g transform={`rotate(45 ${C} ${C})`}>
        <rect x={C - 30} y={C - 26} width={60} height={52} rx={2} className="sc-kaaba" />
        <rect x={C - 30} y={C - 26} width={60} height={52} rx={2} className="sc-band" />
        <rect x={C + 6} y={C - 27.5} width={12} height={4} className="sc-door" />
      </g>
      <circle cx={C + 40} cy={C} r={3.2} className="sc-stone" />
      {n < 7 && <circle cx={C + lane(n)} cy={C} r={6} className="sc-me" />}
      <text x={C + 154} y={C + 18} className="sc-lbl" textAnchor="end">{_t("Чёрный камень")}</text>
      <text x={C} y={C + 62} className="sc-lbl" textAnchor="middle">{_t("Йеменский угол")}</text>
      <text x={C - 64} y={C - 52} className="sc-lbl" textAnchor="middle">{_t("Хиджр")}</text>
      <text x={C + 50} y={C - 44} className="sc-lbl" textAnchor="start">{_t("Макам")}</text>
      <text x={C + 58} y={C + 24} className="sc-dir">↺</text>
    </svg>
  );
}

export function SaeeScene({ n }: { n: number }) {
  const x = (i: number) => 52 + i * 36;
  return (
    <svg viewBox="0 0 320 320" className="scene" aria-hidden="true">
      <rect x={20} y={8} width={280} height={304} rx={22} className="sc-floor" />
      <rect x={20} y={128} width={280} height={44} className="sc-green" />
      <text x={160} y={122} className="sc-lbl" textAnchor="middle">{_t("зелёные огни: братья ускоряют шаг")}</text>
      <path d="M 40 30 Q 160 -6 280 30 L 280 44 L 40 44 Z" className="sc-hill" />
      <path d="M 40 290 Q 160 326 280 290 L 280 276 L 40 276 Z" className="sc-hill" />
      <text x={160} y={30} className="sc-name" textAnchor="middle">{_t("Марва")}</text>
      <text x={160} y={302} className="sc-name" textAnchor="middle">{_t("Сафа")}</text>
      {Array.from({ length: 7 }, (_, i) => {
        const up = i % 2 === 0; // odd passes (1, 3, 5, 7) go from Safa to Marwa
        const d = up ? `M ${x(i)} 268 L ${x(i)} 52` : `M ${x(i)} 52 L ${x(i)} 268`;
        return (
          <g key={i}>
            <path d={d} pathLength={1} className={i < n ? `sc-lap done${i === n - 1 ? ' fresh' : ''}` : i === n ? 'sc-lap now' : 'sc-lap'} />
            <text x={x(i)} y={up ? 64 : 262} className="sc-arrow" textAnchor="middle">{up ? '▲' : '▼'}</text>
            <text x={x(i)} y={154} className="sc-num" textAnchor="middle">{i + 1}</text>
          </g>
        );
      })}
      {n < 7 && <circle cx={x(n)} cy={n % 2 === 0 ? 268 : 52} r={7} className="sc-me" />}
    </svg>
  );
}
