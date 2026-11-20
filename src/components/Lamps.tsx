// Night lamps for the Today header: three Ottoman mosaic-glass globes on brass chains.
// Each globe lights up as the day's prayers are marked (1, 3 and 5), so the evening header shows the day at a glance.
// Purely decorative: aria-hidden, no pointer events. Motion (sway, flicker) is CSS and stops under reduced motion.

const COL = ['#C7283E', '#1FA3A0', '#F0A63A', '#2D56B8', '#2E9A5E', '#E86A2A', '#8E3FB0', '#F4D06A'];

interface Tile { a: string; b: string; c1: string; c2: string; op: number; bx: number; by: number; bo: number }

/** The mosaic of one globe of radius r centred at 0,0: latitude bands split into slices, each slice two glass triangles. */
function mosaic(r: number, rings = 4): Tile[] {
  const out: Tile[] = [];
  const bands = rings * 2;
  for (let b = 0; b < bands; b++) {
    const la0 = -Math.PI / 2 + (Math.PI * b) / bands, la1 = -Math.PI / 2 + (Math.PI * (b + 1)) / bands;
    const n = Math.max(4, Math.floor(10 * Math.cos((la0 + la1) / 2) + 4));
    const off = (b % 2) * 0.5;
    for (let k = 0; k < n; k++) {
      const lo0 = -Math.PI / 2 + (Math.PI * (k + off)) / n, lo1 = -Math.PI / 2 + (Math.PI * (k + 1 + off)) / n;
      const pts = ([[la0, lo0], [la0, lo1], [la1, lo1], [la1, lo0]] as const).map(([la, lo0_]) => {
        const lo = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, lo0_));
        return [r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
      });
      const shade = Math.cos((lo0 + lo1) / 2) * Math.cos((la0 + la1) / 2);
      const p = (i: number) => `${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`;
      const odd = (b + k) % 2 === 1;
      out.push({
        a: odd ? `${p(0)} ${p(1)} ${p(2)}` : `${p(0)} ${p(1)} ${p(3)}`,
        b: odd ? `${p(0)} ${p(2)} ${p(3)}` : `${p(1)} ${p(2)} ${p(3)}`,
        c1: COL[(b * 3 + k * 2) % COL.length], c2: COL[(b * 5 + k * 3 + 4) % COL.length],
        op: 0.5 + 0.4 * shade, bx: pts[0][0], by: pts[0][1], bo: 0.4 + 0.5 * shade,
      });
    }
  }
  return out;
}

const R = 30; // all globes are drawn at this radius and scaled, so the mosaic is computed once
const TILES = mosaic(R);

function Globe({ id, lit }: { id: string; lit: boolean }) {
  const cw = R * 0.62, sw = Math.max(0.6, R / 42);
  return (
    <g className={`lm-globe${lit ? ' on' : ''}`}>
      <defs>
        <radialGradient id={`lg${id}`} cx="45%" cy="42%" r="60%"><stop offset="0" stopColor="#FFF4C8" /><stop offset=".45" stopColor="#FFC765" /><stop offset="1" stopColor="#B85A16" /></radialGradient>
        <radialGradient id={`lh${id}`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FFC765" stopOpacity=".55" /><stop offset=".55" stopColor="#E9963A" stopOpacity=".18" /><stop offset="1" stopColor="#E9963A" stopOpacity="0" /></radialGradient>
        <clipPath id={`lc${id}`}><circle r={R} /></clipPath>
      </defs>
      <circle className="lm-halo" r={R * 2.6} fill={`url(#lh${id})`} />
      <g className="lm-glass">
        <circle r={R} fill={lit ? `url(#lg${id})` : '#2a1c10'} />
        <g clipPath={`url(#lc${id})`}>
          {TILES.map((t, i) => (
            <g key={i}>
              <polygon points={t.a} fill={t.c1} fillOpacity={t.op} stroke="#3A230E" strokeWidth={sw} strokeOpacity=".7" />
              <polygon points={t.b} fill={t.c2} fillOpacity={t.op} stroke="#3A230E" strokeWidth={sw} strokeOpacity=".7" />
              <circle cx={t.bx} cy={t.by} r={Math.max(0.7, R / 30)} fill="#F4D06A" opacity={t.bo} />
            </g>
          ))}
        </g>
        <circle className="lm-bloom" cx={-R * 0.15} cy={-R * 0.1} r={R * 0.55} fill="#FFE9A8" />
        {!lit && <circle r={R} fill="#140d06" opacity=".62" />}
        <ellipse cx={-R * 0.38} cy={-R * 0.45} rx={R * 0.22} ry={R * 0.12} fill="#fff" opacity=".4" transform={`rotate(-30 ${-R * 0.38} ${-R * 0.45})`} />
      </g>
      <circle r={R} fill="none" stroke="#8A5A1C" strokeWidth={R / 18} />
      <path d={`M${-cw} ${-R * 0.86} Q0 ${-R * 1.32} ${cw} ${-R * 0.86} Z`} fill="#C9963E" stroke="#7A4E14" strokeWidth="1" />
      <rect x={-R * 0.1} y={-R * 1.36} width={R * 0.2} height={R * 0.16} rx="2" fill="#E0B45C" />
      <path d={`M${-cw * 0.7} ${R * 0.9} Q0 ${R * 1.18} ${cw * 0.7} ${R * 0.9} L0 ${R * 1.55} Z`} fill="#C9963E" stroke="#7A4E14" strokeWidth="1" />
      <circle cy={R * 1.6} r={R * 0.08} fill="#E0B45C" />
    </g>
  );
}

function Chain({ len }: { len: number }) {
  const links = [];
  for (let y = 0; y < len; y += 5.2) links.push(<ellipse key={y} cx="0" cy={y + 3} rx="1.6" ry="3" fill="none" stroke="#C9963E" strokeWidth="1" />);
  return <g opacity=".9">{links}</g>;
}

// x, globe centre y, radius, and how many prayers light it
const LAMPS: [number, number, number, number][] = [
  [36, 58, 15, 3],
  [74, 92, 21, 1],
  [24, 118, 11, 5],
];

/** The lamps cluster: 100 × 155 user units, hung from the top edge of the header. */
export function Lamps({ prayed }: { prayed: number }) {
  return (
    <svg className="lamps" viewBox="0 0 100 155" aria-hidden="true" focusable="false">
      {LAMPS.map(([x, y, r, need], i) => {
        const s = r / R;
        return (
          <g key={i} className={`lm-hang lm-${i}`} style={{ transformOrigin: `${x}px 0px` }}>
            <g transform={`translate(${x} 0)`}><Chain len={y - r * 1.36} /></g>
            <g transform={`translate(${x} ${y}) scale(${s})`}><Globe id={`n${i}`} lit={prayed >= need} /></g>
          </g>
        );
      })}
    </svg>
  );
}
