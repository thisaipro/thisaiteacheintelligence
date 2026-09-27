import { BANDS, DIMENSIONS, INDEX_BANDS, gradeBandLabel } from '../../model/bands';
import { formatDate } from '../../model/reportView';
import type { RosterRow } from '../../model/types';

export function RosterTable({ rows, onOpen }: { rows: RosterRow[]; onOpen: (r: RosterRow) => void }) {
  return (
    <div className="tablewrap">
      <table className="roster">
        <thead><tr>
          <th>Teacher</th><th>Grade band</th><th className="c">Index</th><th className="c">Equity gate</th>
          <th className="c">Validity</th><th className="c">Dimension bands</th><th>Assessed</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const submitted = r.status === 'submitted';
            const open = () => submitted && onOpen(r);
            return (
              <tr key={r.teacher_id} onClick={open} tabIndex={submitted ? 0 : -1} style={submitted ? undefined : { cursor: 'default' }}
                onKeyDown={(e) => { if (e.key === 'Enter') open(); }} aria-label={submitted ? `Open ${r.teacher_name}'s profile` : undefined}>
                <td><div className="tname">{r.teacher_name}</div><div className="tid">{r.teacher_id}{r.department ? ' · ' + r.department : ''}</div></td>
                <td>{gradeBandLabel(r.grade_band)}</td>
                <td className="c">
                  {r.index === null ? <span style={{ color: 'var(--ink-3t)' }}>—</span> : (
                    <span className="tname">{r.index}<span className="tid" style={{ display: 'block' }}>{INDEX_BANDS.find((b) => b.id === r.index_band)?.label}</span></span>
                  )}
                </td>
                <td>{r.equity_gate === null ? <span className="tid" style={{ display: 'block', textAlign: 'center' }}>—</span> : (
                  <div className={'flagcell ' + (r.equity_gate ? 'on' : 'off')} style={{ justifyContent: 'center' }}>
                    <span className="ic" aria-hidden="true">{r.equity_gate ? '!' : '✓'}</span>{r.equity_gate ? 'Raised' : 'Clear'}
                  </div>)}
                </td>
                <td>{r.validity_flag === null ? <span className="tid" style={{ display: 'block', textAlign: 'center' }}>—</span> : (
                  <div className={'flagcell ' + (r.validity_flag ? 'on' : 'off')} style={{ justifyContent: 'center' }}>
                    <span className="ic" aria-hidden="true">{r.validity_flag ? '!' : '✓'}</span>{r.validity_flag ? 'Caution' : 'OK'}
                  </div>)}
                </td>
                <td>{submitted ? (
                  <div className="dots">
                    {DIMENSIONS.map((d) => {
                      const b = r.dim_bands[d.id] ?? null;
                      return <i key={d.id} className={b ?? 'unassessed'} title={`${d.name}: ${b ? BANDS[b].label : 'Not yet assessed'}`}></i>;
                    })}
                  </div>
                ) : <span className="tid" style={{ display: 'block', textAlign: 'center' }}>In progress · {r.items_answered} of 35 ranked</span>}</td>
                <td>{submitted ? formatDate(r.submitted_at) : '—'}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={7} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--ink-3t)' }}>No teacher has started the assessment in this institution yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
