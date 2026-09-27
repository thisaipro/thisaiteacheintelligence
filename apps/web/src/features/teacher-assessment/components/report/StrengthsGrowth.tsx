import type { AreaView } from '../../model/reportView';

export function StrengthsGrowth({ strengths, growth }: { strengths: AreaView[]; growth: AreaView[] }) {
  const list = (items: AreaView[]) => items.map((d) => (
    <div className="it" key={d.id}><b>{d.name}<i>{d.score}/3</i></b><p>{d.blurb}</p></div>
  ));
  return (
    <div className="sgrid">
      <div className="spanel up"><div className="hd">Strength areas</div>{list(strengths)}</div>
      <div className="spanel grow"><div className="hd">Development areas</div>{list(growth)}</div>
    </div>
  );
}
