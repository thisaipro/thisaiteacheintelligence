/* Admin-only report blocks: read-out, validity banner, cohort comparison, item-level data. */
import { useState } from 'react';
import { BANDS, BAND_TEXT, dimByName } from '../../model/bands';
import type { ReportView } from '../../model/reportView';
import type { ItemLevelRow } from '../../model/types';

export function Readout() {
  return (
    <div className="readout">
      <span className="orb" aria-hidden="true">◆</span>
      <div>
        <h4>How to read this in two minutes</h4>
        <ul>
          <li><b>The index is a summary, not a rating.</b> Two teachers on the same index can need opposite support — the shape of the radar is what decides the coaching.</li>
          <li><b>Look for the dents.</b> Anything inside the dashed school-average outline is where this teacher trails the cohort; anything outside it is where they could mentor a colleague.</li>
          <li><b>Equity is a gate, not a score.</b> A raised gate is a conversation to schedule regardless of how strong the other six dimensions look.</li>
        </ul>
      </div>
    </div>
  );
}

export function ValidityBanner({ reasons }: { reasons: string[] }) {
  return (
    <div className="validbanner" role="note">
      <span className="ic" aria-hidden="true">!</span>
      <div>
        <h4>Read with caution — the response pattern tripped a validity check</h4>
        <p>This profile is shown in full, but one or more checks suggest the rankings may not reflect considered responses. Worth a conversation before the profile is used for coaching decisions. Not shown on the teacher-facing view.</p>
        {reasons.length > 0 && <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      </div>
    </div>
  );
}

export function CohortTable({ cohort }: { cohort: NonNullable<ReportView['cohort']> }) {
  if (!cohort.available)
    return <p className="cohortnote">School averages appear once at least five teachers have submitted a profile ({cohort.n} so far), so no individual can be identified.</p>;
  return (
    <div className="tablewrap">
      <table className="cmp">
        <thead><tr><th>Dimension</th><th className="c" style={{ width: 96 }}>This teacher</th><th className="c" style={{ width: 110 }}>School average</th><th className="c" style={{ width: 96 }}>Difference</th><th className="c" style={{ width: 118 }}>Band</th></tr></thead>
        <tbody>
          {cohort.rows.map((r) => {
            const cls = r.diff === null ? 'flat' : r.diff >= 0.2 ? 'up' : r.diff <= -0.2 ? 'dn' : 'flat';
            return (
              <tr key={r.id}>
                <td><span className="dn">{r.name}</span></td>
                <td className="c num" style={{ color: r.band ? BAND_TEXT[r.band] : 'var(--ink-3t)' }}>{r.mine === null ? '—' : r.mine.toFixed(2)}</td>
                <td className="c num" style={{ color: 'var(--ink-3t)' }}>{r.avg === null ? '—' : r.avg.toFixed(2)}</td>
                <td className={'c num delta ' + cls}>{r.diff === null ? '—' : (r.diff > 0 ? '+' : '') + r.diff.toFixed(2)}</td>
                <td className="c">{r.band ? <span className={'bandpill ' + r.band}>{BANDS[r.band].label}</span> : <span className="bandpill unassessed">Not assessed</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ItemLevelTable({ rows }: { rows: ItemLevelRow[] }) {
  const [open, setOpen] = useState(false);
  const scoreColor = (s: number) => (s >= 2.3 ? 'var(--strong-t)' : s >= 1.3 ? 'var(--consistent-t)' : 'var(--developing-t)');
  return (
    <div className="expert">
      <button onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={'chev' + (open ? ' open' : '')} aria-hidden="true">▶</span> Item-level ranking data
        <span className="tag">Admin only · {rows.length} items</span>
      </button>
      {open && (
        <div style={{ overflowX: 'auto' }}>
          <table className="itemtable">
            <thead><tr><th style={{ width: 120 }}>Item</th><th style={{ width: 150 }}>Dimension</th><th style={{ width: 120 }}>Their ranking</th><th style={{ width: 120 }}>Keyed order</th><th style={{ width: 70 }}>Score</th><th>Note · source</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <td>{r.item_id}</td>
                  <td>{dimByName(r.dimension)?.short}</td>
                  <td className="rank">{r.ranked.join(' › ')}</td>
                  <td className="rank" style={{ color: 'var(--ink-3t)' }}>{r.key.join(' › ')}</td>
                  <td>{r.score === null ? '—' : <b style={{ color: scoreColor(r.score) }}>{r.score.toFixed(2)}</b>}</td>
                  <td style={{ fontSize: 11.5, color: 'var(--ink-3t)', lineHeight: 1.45 }}>
                    {r.note && <div className="notecell">“{r.note}”</div>}{r.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
