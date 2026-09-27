import { dimByName, isRanked } from '../../model/bands';
import type { AnswerDTO, ClientItem } from '../../model/types';
import { Clock } from './Clock';

export function Rail({ items, answers, idx, onJump, start }: {
  items: ClientItem[]; answers: Record<string, AnswerDTO>; idx: number; onJump: (i: number) => void; start: number;
}) {
  const done = items.filter((i) => isRanked(answers[i.item_id]?.ranked)).length;
  const flagged = items.filter((i) => answers[i.item_id]?.flagged).length;
  return (
    <aside className="rail" aria-label="Items">
      <Clock start={start} />
      <div className="hd" id="ta-items-hd">Items</div>
      <div className="qgrid" role="list" aria-labelledby="ta-items-hd">
        {items.map((it, i) => {
          const ok = isRanked(answers[it.item_id]?.ranked);
          const fl = !!answers[it.item_id]?.flagged;
          return (
            <button key={it.item_id} role="listitem" onClick={() => onJump(i)} aria-current={i === idx ? 'step' : undefined}
              className={(i === idx ? 'cur ' : '') + (ok ? 'done ' : '') + (fl ? 'flag' : '')}
              title={dimByName(it.dimension)?.short}
              aria-label={`Item ${i + 1}, ${ok ? 'ranked' : 'not yet ranked'}${fl ? ', flagged for review' : ''}`}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="raillegend" aria-hidden="true">
        <div><i style={{ background: 'var(--brand)' }}></i>Current item</div>
        <div><i style={{ background: 'var(--consistent-soft)', border: '1px solid rgba(63,95,174,.3)' }}></i>Ranked</div>
        <div><i style={{ background: 'var(--bg-2)', border: '1px solid var(--line-2)' }}></i>Not yet ranked</div>
        <div><i style={{ background: 'var(--developing)', borderRadius: '50%', width: 9, height: 9, marginLeft: 2 }}></i>Flagged for review</div>
      </div>
      <div className="railstat">
        <b>{done}</b> of {items.length} ranked{flagged ? <> · <b>{flagged}</b> flagged</> : null}
        <div style={{ marginTop: 8 }}>One section · answers auto-saved</div>
      </div>
    </aside>
  );
}
