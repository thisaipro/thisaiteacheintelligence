/* Radar + ranked bars + band distribution, ported from the prototype report. */
import { BANDS, BAND_FILL, BAND_HEX, BAND_TEXT } from '../../model/bands';
import type { ReportView } from '../../model/reportView';

export function CompetencyRadar({ points }: { points: ReportView['radar'] }) {
  const N = points.length, cx = 178, cy = 168, R = 108;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / N;
  const pt = (i: number, v: number) => [cx + R * (v / 3) * Math.cos(ang(i)), cy + R * (v / 3) * Math.sin(ang(i))];
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, v ?? 0).map((n) => n.toFixed(1)).join(',')).join(' ');
  const mine = points.map((p) => p.score);
  const avg = points.map((p) => p.avg);
  const label = points.map((p) => `${p.short} ${p.score === null ? 'not assessed' : p.score.toFixed(1) + ' of 3'}`).join('; ');
  return (
    <div className="radarwrap">
      <svg width="356" height="336" viewBox="0 0 356 336" role="img" aria-label={'Seven-dimension profile: ' + label}>
        {[1, 2, 3].map((r) => (
          <polygon key={r} points={poly(points.map(() => r))} fill={r === 3 ? 'var(--bg-3)' : 'none'} stroke="var(--line-2)" strokeWidth={r === 3 ? 1.2 : 1} strokeDasharray={r === 3 ? undefined : '3 3'} />
        ))}
        {points.map((p, i) => { const [x, y] = pt(i, 3); return <line key={p.id} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />; })}
        {avg.some((v) => v !== null) && <polygon points={poly(avg)} fill="none" stroke="var(--ink-3)" strokeWidth="1.6" strokeDasharray="5 4" />}
        {mine.some((v) => v !== null) && (
          <>
            <polygon points={poly(mine)} fill="rgba(73,79,156,.18)" stroke="var(--brand)" strokeWidth="2.4" />
            {mine.map((v, i) => { if (v === null) return null; const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r="4" fill="var(--brand)" stroke="#fff" strokeWidth="1.6" />; })}
          </>
        )}
        {points.map((p, i) => {
          const c = Math.cos(ang(i)), s = Math.sin(ang(i));
          const lx = cx + (R + 24) * c, ly = cy + (R + 24) * s;
          const anchor = c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle';
          return (
            <g key={p.id}>
              <text x={lx} y={ly + (s > 0.4 ? 9 : s < -0.4 ? -1 : 3)} textAnchor={anchor}>{p.short}</text>
              <text className="val" x={lx} y={ly + (s > 0.4 ? 21 : s < -0.4 ? 11 : 15)} textAnchor={anchor}>{p.score === null ? '—' : p.score.toFixed(1)} / 3</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DimensionBars({ rows, admin }: { rows: ReportView['bars']; admin: boolean }) {
  return (
    <div>
      <div className="dbars">
        {rows.map((d) => (
          <div className="dbar" key={d.id}>
            <div className="dbn">{d.label}<i>{d.sub}</i></div>
            <div className="dbtrack" aria-hidden="true">
              <span className="zone z1"></span><span className="zone z2"></span><span className="zone z3"></span>
              <span className="gl" style={{ left: '43.33%' }}></span><span className="gl" style={{ left: '76.67%' }}></span>
              {d.score !== null && d.band && <span className="fill" style={{ width: d.pct + '%', background: BAND_FILL[d.band] }}></span>}
              {admin && d.avg !== null && <span className="avg" style={{ left: (d.avg / 3) * 100 + '%' }} title={'School average ' + d.avg.toFixed(2)}></span>}
            </div>
            <div className="dbv">
              <b style={{ color: d.band ? BAND_TEXT[d.band] : 'var(--ink-3t)' }}>{d.score === null ? '—' : d.score.toFixed(2)}</b>
              <span className="bp" style={d.band ? { background: `var(--${d.band}-soft)`, color: BAND_TEXT[d.band] } : { background: 'var(--bg-3)', color: 'var(--ink-3t)' }}>
                {d.band ? BANDS[d.band].label : admin ? 'Not scored' : 'Not yet ranked'}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="dbaxis" aria-hidden="true">
        <span className="sp"></span>
        <div className="zones"><span>Developing 0–1.2</span><span>Consistent 1.3–2.2</span><span>Strong 2.3–3.0</span></div>
        <span className="sp"></span>
      </div>
    </div>
  );
}

export function BandDistribution({ counts }: { counts: ReportView['distribution'] }) {
  const total = counts.strong + counts.consistent + counts.developing + counts.unscored || 1;
  return (
    <>
      <div className="disbar" role="img" aria-label={`${counts.strong} strong, ${counts.consistent} consistent, ${counts.developing} developing, ${counts.unscored} not yet assessed`}>
        {(['strong', 'consistent', 'developing', 'unscored'] as const).map((b) => (
          <div key={b} className={counts[b] ? '' : 'z'} style={{ width: (counts[b] / total) * 100 + '%', background: b === 'unscored' ? 'var(--bg-4)' : BAND_HEX[b], color: b === 'unscored' ? 'var(--ink-2)' : '#fff' }}>{counts[b] || ''}</div>
        ))}
      </div>
      <div className="dislegend">
        <span className="lg"><span className="sw" style={{ background: BAND_HEX.strong }}></span>Strong {counts.strong}</span>
        <span className="lg"><span className="sw" style={{ background: BAND_HEX.consistent }}></span>Consistent {counts.consistent}</span>
        <span className="lg"><span className="sw" style={{ background: BAND_HEX.developing }}></span>Developing {counts.developing}</span>
        {counts.unscored > 0 && <span className="lg"><span className="sw" style={{ background: 'var(--bg-4)' }}></span>Not yet assessed {counts.unscored}</span>}
      </div>
    </>
  );
}
