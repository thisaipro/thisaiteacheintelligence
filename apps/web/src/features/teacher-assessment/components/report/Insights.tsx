import type { Insight } from '../../model/types';

export function Insights({ items }: { items: Insight[] }) {
  return (
    <div className="insights">
      {items.map((i, n) => <div className="insight" key={n}><span className="ic" aria-hidden="true">{i.ic}</span><p>{i.text}</p></div>)}
    </div>
  );
}
