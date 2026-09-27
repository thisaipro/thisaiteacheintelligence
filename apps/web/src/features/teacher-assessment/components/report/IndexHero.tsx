import type { ReactNode } from 'react';
import type { ReportView } from '../../model/reportView';

export function IndexDial({ value, color, size = 168 }: { value: number; color: string; size?: number }) {
  const S = size, R = S / 2 - 13, C = 2 * Math.PI * R;
  return (
    <div className="dial" style={{ width: S, height: S }} role="img" aria-label={`Teaching practice index ${value} of 100`}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="var(--bg-4)" strokeWidth="15" />
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke={color} strokeWidth="15" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - value / 100)} />
      </svg>
      <div className="ctr" aria-hidden="true"><b style={{ color }}>{value}</b><span>of 100</span></div>
    </div>
  );
}

export function IndexHero({ view, actions }: { view: ReportView; actions?: ReactNode }) {
  return (
    <section className="rtop" aria-label="Summary">
      <div className="idn">
        <div>
          <h1>{view.name}</h1>
          <div className="meta">
            {view.pills.map((p) => <span className="pill" key={p}>{p}</span>)}
            {view.equityPill && <span className="pill arch">Equity gate raised</span>}
          </div>
        </div>
        {actions && <div className="acts">{actions}</div>}
      </div>
      <div className="body">
        {view.index ? <IndexDial value={view.index.value} color={view.index.color} /> : null}
        <div>
          <div className="mono" style={{ color: 'var(--ink-3t)', marginBottom: 8 }}>{view.indexLine}</div>
          <p className="frame">{view.frame}</p>
          <div className="kpis">
            {view.kpis.map((k) => (
              <div className={'kpi' + (k.cls ? ' ' + k.cls : '')} key={k.k}>
                <div className="k">{k.k}</div>
                <div className="v" style={k.color ? { color: k.color } : undefined}>{k.v}</div>
                <div className="s">{k.s}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
