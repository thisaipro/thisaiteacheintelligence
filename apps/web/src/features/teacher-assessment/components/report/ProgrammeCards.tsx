import type { ReportView } from '../../model/reportView';

export function ProgrammeCards({ items }: { items: ReportView['programmes'] }) {
  return (
    <div className="recgrid">
      {items.map((r) => (
        <div className="rec" key={r.id}>
          <span className="tag">{r.kind} · {r.dimShort}</span>
          <b>{r.title}</b><p>{r.what}</p>
          <div className="meta"><span>{r.weeks}</span><span>{r.mode}</span></div>
        </div>
      ))}
    </div>
  );
}
