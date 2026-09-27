import type { PathStep } from '../../model/types';

export function PathTimeline({ steps }: { steps: PathStep[] }) {
  return (
    <ol className="path" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steps.map((s) => <li className="pstep" key={s.wk}><span className="wk">{s.wk}</span><div><b>{s.t}</b><p>{s.d}</p></div></li>)}
    </ol>
  );
}
