/* Per-dimension cohort averages (admin). Withheld below N = 5. */
import { BANDS, BAND_FILL, BAND_TEXT, DIMENSIONS } from '../../model/bands';
import type { CohortDTO, RosterRow } from '../../model/types';

const bandOf = (v: number) => (v >= 2.3 ? 'strong' : v >= 1.3 ? 'consistent' : 'developing');

export function CohortChart({ cohort, roster }: { cohort: CohortDTO; roster: RosterRow[] }) {
  const submitted = roster.filter((r) => r.status === 'submitted');
  const gate = submitted.filter((r) => r.equity_gate).length;
  if (!cohort.available)
    return <p className="cohortnote">Cohort averages appear once at least {cohort.min_n} teachers have submitted ({cohort.n} so far), so no individual can be identified from them.</p>;
  const dev = (id: string) => {
    const scored = submitted.filter((r) => r.dim_bands[id as keyof typeof r.dim_bands]);
    const n = scored.filter((r) => r.dim_bands[id as keyof typeof r.dim_bands] === 'developing').length;
    return { n, total: scored.length, pc: scored.length ? Math.round((n / scored.length) * 100) : 0 };
  };
  return (
    <>
      <div className="dbars" role="list" aria-label="Cohort averages by dimension">
        {DIMENSIONS.map((d) => {
          const v = cohort.dims?.[d.id] ?? null;
          const b = v === null ? null : bandOf(v);
          const dv = dev(d.id);
          return (
            <div className="dbar" key={d.id} role="listitem">
              <div className="dbn">{d.name.replace(' / Root-Cause Diagnosis', '')}<i>{dv.n} of {dv.total} teachers Developing</i></div>
              <div className="dbtrack" aria-hidden="true">
                <span className="zone z1"></span><span className="zone z2"></span><span className="zone z3"></span>
                {v !== null && b && <span className="fill" style={{ width: (v / 3) * 100 + '%', background: BAND_FILL[b] }}></span>}
              </div>
              <div className="dbv">
                <b style={{ color: b ? BAND_TEXT[b] : 'var(--ink-3t)' }}>{v === null ? '—' : v.toFixed(2)}</b>
                {b && <span className="bp" style={{ background: `var(--${b}-soft)`, color: BAND_TEXT[b] }}>{BANDS[b].label}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="aggrid" style={{ marginTop: 16 }}>
        <div className="agg"><div className="nm">Teachers in benchmark</div><div className="pc">{cohort.n}</div><div className="cap">submitted profiles, latest per teacher</div></div>
        <div className={'agg' + (gate ? ' alarm' : '')}><div className="nm">Equity gate raised</div><div className="pc" style={{ color: gate ? 'var(--developing-t)' : 'var(--ink)' }}>{gate}</div><div className="cap">teachers need an equity conversation this cycle</div></div>
      </div>
    </>
  );
}
