import { BANDS, BAND_FILL, BAND_ORDER, type Band } from '../../model/bands';
import type { DimRowView } from '../../model/reportView';

export function BandTrack({ band }: { band: Band | null }) {
  if (!band) return <div className="bandtrack unassessed" aria-hidden="true">{BAND_ORDER.map((b) => <i key={b}></i>)}</div>;
  const idx = BAND_ORDER.indexOf(band);
  return (
    <div className="bandtrack" aria-hidden="true">
      {BAND_ORDER.map((b, i) => <i key={b} style={i <= idx ? { background: BAND_FILL[band], opacity: i === idx ? 1 : 0.42 } : undefined}></i>)}
    </div>
  );
}

export function BandChip({ band, label }: { band: Band | null; label?: string }) {
  return <span className={'bandpill ' + (band ?? 'unassessed')}>{label ?? (band ? BANDS[band].label : 'Not yet assessed')}</span>;
}

export function BandLegend() {
  return (
    <div className="bandlegend">
      {BAND_ORDER.map((b) => (
        <div className="lg" key={b}>
          <span className="sw" style={{ background: BAND_FILL[b] }}></span>
          <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{BANDS[b].label}</b> — {BANDS[b].note}
        </div>
      ))}
    </div>
  );
}

export function DimensionRow({ row, open, onToggle, previewNote }: { row: DimRowView; open: boolean; onToggle: () => void; previewNote?: boolean }) {
  const bodyId = 'dim-' + row.id;
  return (
    <div className={'dimrow' + (row.gate ? ' gated' : '')}>
      <button className="dimtop" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
        <span className="nm">{row.name}{row.gate && <span className="gatebadge">Gate dimension</span>}<small>{row.blurb}</small></span>
        <BandTrack band={row.band} />
        <BandChip band={row.band} label={row.bandLabel} />
        <span className={'chev' + (open ? ' open' : '')} aria-hidden="true">▶</span>
      </button>
      {open && (
        <div className="dimbody" id={bodyId}>
          <p className="note">{row.note ?? (previewNote ? 'The coaching note for this dimension appears after you submit.' : '')}</p>
          <div className="act"><b>Where to go next</b>{row.action}</div>
          {row.adminNums && (
            <div className="admnums">
              <span>{row.adminNums.score ? <><b>{row.adminNums.score}</b> {row.adminNums.detail}</> : row.adminNums.detail}</span>
              <span>{row.adminNums.items}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
