import { dimByName, gradeBandLabel } from '../../model/bands';
import type { BankItem } from '../../model/types';

export function BankTable({ rows, selected, onSelect }: { rows: BankItem[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="tablewrap" style={{ overflowX: 'auto' }}>
      <table className="bank">
        <thead><tr><th style={{ width: 104 }}>Item</th><th>Scenario</th><th style={{ width: 132 }}>Dimension</th><th style={{ width: 118 }}>Band</th><th style={{ width: 90 }}>Key</th></tr></thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.item_id} className={(selected === i.item_id ? 'on ' : '') + (i.active ? '' : 'arch')} onClick={() => onSelect(i.item_id)}
              tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i.item_id); } }}
              aria-selected={selected === i.item_id}>
              <td>
                <div className="iid">{i.item_id}</div>
                {i.gate_dimension && <span className="pill gate" style={{ marginTop: 6 }}>Gate</span>}
                {!i.active && <span className="pill arch" style={{ marginTop: 6 }}>Archived</span>}
              </td>
              <td className="sc">{i.scenario}</td>
              <td><span className="pill">{dimByName(i.dimension)?.short}</span></td>
              <td style={{ fontSize: 12.5, color: 'var(--ink-3t)' }}>{gradeBandLabel(i.grade_band)}</td>
              <td className="iid" style={{ letterSpacing: '.08em' }}>{i.options.slice().sort((a, b) => a.key_rank - b.key_rank).map((o) => o.label).join('›')}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={5} style={{ padding: '34px 14px', textAlign: 'center', color: 'var(--ink-3t)' }}>No items match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/** Read-only detail of one item with its full key (admin only). */
export function ItemKeyPanel({ item, onClose }: { item: BankItem | null; onClose: () => void }) {
  if (!item)
    return (
      <div className="editor"><div className="emptyed"><div className="big" aria-hidden="true">◫</div>
        Select a question to see its keyed ranking, scoring weight and rationale.</div></div>
    );
  const opts = item.options.slice().sort((a, b) => a.key_rank - b.key_rank);
  return (
    <aside className="editor" aria-label={`Item ${item.item_id}`}>
      <div className="eh">
        <h3>{item.item_id}</h3>
        {item.gate_dimension && <span className="pill gate">Gate</span>}
        <span className="pill">v{item.version}</span>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="eb">
        <div className="field"><label>{gradeBandLabel(item.grade_band)} · {item.dimension}</label></div>
        <p className="scn">{item.scenario}</p>
        <div className="field"><label>Keyed ranking · points 3 / 2 / 1 / 0</label></div>
        <div className="keylist">
          {opts.map((o) => (
            <div className="keyopt" key={o.label}>
              <span className="kr">{o.key_rank}</span>
              <div><p><b>{o.label}.</b> {o.text}</p><small>{o.points} pt{o.points === 1 ? '' : 's'} · {o.rationale}</small></div>
            </div>
          ))}
        </div>
        <p className="src">{item.source_tag}</p>
      </div>
    </aside>
  );
}
