import { useMemo } from 'react';
import type { AppState } from '../types';
import { garden, journey, milestones } from '../gamify';
import { plural } from '../dates';

const BRANCHES = [
  'M177 205 C155 192 135 178 116 158',
  'M178 188 C202 175 222 160 238 138',
  'M177 160 C166 140 160 122 156 100',
  'M178 150 C192 132 200 115 206 92',
  'M177 225 C150 218 124 210 98 196',
  'M178 215 C206 208 232 198 256 182',
  'M177 135 C174 115 175 95 178 72',
  'M178 172 C150 160 128 140 108 122',
];
const FRUITS: [number, number][] = [[128, 170], [226, 150], [160, 112], [200, 104], [110, 200], [246, 190], [178, 84], [120, 134]];

// Fixed pseudo-random leaf spots in the crown, the same on every render.
const LEAVES: [number, number, number][] = (() => {
  const out: [number, number, number][] = [];
  let x = 7;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  while (out.length < 90) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
    const px = 177 + Math.cos(a) * r * 98, py = 140 + Math.sin(a) * r * 72;
    if (py > 215) continue;
    out.push([Math.round(px), Math.round(py), Math.round(rnd() * 180)]);
  }
  return out;
})();

export function Garden({ state, today }: { state: AppState; today: string }) {
  const j = useMemo(() => journey(state, today), [state, today]);
  const g = garden(j.lit);
  const ms = milestones(state, j);
  const leaves = LEAVES.slice(0, Math.min(g.leaves, LEAVES.length));
  const trunkTop = g.leaves === 0 ? 236 : g.leaves < 7 ? 190 : 120;

  return (
    <>
      <div className="garden-box">
        <svg viewBox="0 0 354 290" role="img" aria-label={`Сад: ${g.leaves} ${plural(g.leaves, 'лист', 'листа', 'листьев')}, ${g.branches} ${plural(g.branches, 'ветка', 'ветки', 'веток')}, ${g.fruits} ${plural(g.fruits, 'плод', 'плода', 'плодов')}`}>
          <rect x="0" y="250" width="354" height="40" fill="var(--green-soft)" />
          <path d={`M177 252 C175 225 179 ${trunkTop + 40} 177 ${trunkTop}`} stroke="#7a5a3a" strokeWidth={g.leaves < 7 ? 5 : 10} fill="none" strokeLinecap="round" />
          {BRANCHES.slice(0, g.branches).map((d, i) => <path key={i} d={d} stroke="#7a5a3a" strokeWidth={i < 4 ? 6 : 5} fill="none" strokeLinecap="round" />)}
          {g.leaves < 7
            ? leaves.map((_, i) => <ellipse key={i} cx={177 + (i % 2 ? 9 : -9)} cy={trunkTop + 8 + Math.floor(i / 2) * 12} rx="9" ry="5" fill="#2f9e5f" transform={`rotate(${i % 2 ? -25 : 25} ${177 + (i % 2 ? 9 : -9)} ${trunkTop + 8 + Math.floor(i / 2) * 12})`} />)
            : leaves.map(([x, y, r], i) => <ellipse key={i} cx={x} cy={y} rx="10" ry="6" fill={i % 5 === 0 ? '#7fc79c' : '#2f9e5f'} transform={`rotate(${r} ${x} ${y})`} />)}
          {FRUITS.slice(0, g.fruits).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8" fill="#d9822b" stroke="#fff" strokeWidth="2" />)}
        </svg>
        <div className="garden-tag">
          <b>{g.leaves} {plural(g.leaves, 'лист', 'листа', 'листьев')}{g.branches ? ` · ${g.branches} ${plural(g.branches, 'ветка', 'ветки', 'веток')}` : ''}{g.fruits ? ` · ${g.fruits} ${plural(g.fruits, 'плод', 'плода', 'плодов')}` : ''}</b>
          <small>До {g.fruits ? 'следующего' : 'первого'} плода {g.toFruit} {plural(g.toFruit, 'день', 'дня', 'дней')}</small>
        </div>
      </div>
      <p className="garden-note">
        Каждый засчитанный день даёт лист, неделя даёт ветку, 40 дней дают плод. Пропуск не отнимает листья, сад просто не растёт в этот день. Сад видишь только ты.
      </p>
      <p className="garden-note">
        День засчитан, когда свет дня наполнен хотя бы наполовину (намазы и привычки) или все привычки отмечены. Минимальная версия считается полностью. Серия: сейчас {j.streak}, лучшая {j.best}.
      </p>

      <h2 className="sub-h">Вехи</h2>
      {ms.map((m) => (
        <div key={m.id} className={`ms${m.got ? '' : ' off'}`}>
          <span className="ms-n" aria-hidden="true">{m.of > 1 ? m.of : '✓'}</span>
          <div className="ms-x">
            <b>{m.title}</b>
            {!m.got && m.of > 1 && <span className="bar2"><i style={{ width: `${(m.now / m.of) * 100}%` }} /></span>}
            <small>{m.got ? `«${m.quote}» (${m.src})` : m.of > 1 ? `${m.now} из ${m.of}` : 'впереди'}</small>
          </div>
        </div>
      ))}
    </>
  );
}
