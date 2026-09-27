import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { ClientOption } from '../../model/types';

function PlacedCard({ option, picked, locked, onPick, onClear, rank }: {
  option: ClientOption; picked: boolean; locked?: boolean; onPick: () => void; onClear: () => void; rank: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'opt:' + option.label, data: { label: option.label }, disabled: locked });
  return (
    <div className={'placed' + (isDragging ? ' dragging' : '') + (locked ? ' locked' : '')}>
      <button ref={setNodeRef} {...attributes} {...listeners} type="button" role="button" className={'pcard' + (picked ? ' picked' : '')}
        data-card={option.label} aria-pressed={picked} aria-describedby="ta-rank-help"
        aria-label={`Rank ${rank}: ${option.text}`} onClick={onPick} disabled={locked}>
        <span className="grip" aria-hidden="true">⣿</span><span>{option.text}</span>
      </button>
      {!locked && (
        <button type="button" className="x" aria-label={`Remove from rank ${rank}`} title="Remove" onClick={(e) => { e.stopPropagation(); onClear(); }}>×</button>
      )}
    </div>
  );
}

export function RankSlot({ index, label, option, picked, locked, onPlacePicked, onPickPlaced, onClear }: {
  index: number;
  label: { n: string; l: string };
  option: ClientOption | null;
  picked: string | null;
  locked?: boolean;
  onPlacePicked: () => void;
  onPickPlaced: (label: string) => void;
  onClear: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'slot:' + index, disabled: locked });
  const armed = !!picked && (!option || option.label !== picked);
  return (
    <div className={'slot' + (option ? ' filled' : '')} role="listitem">
      <div className="rank" aria-hidden="true"><b>{label.n}</b><span>{label.l}</span></div>
      <div ref={setNodeRef} className={'dropzone' + (option ? ' has' : '') + (armed ? ' armed' : '') + (isOver ? ' over' : '')}
        onClick={option && armed ? onPlacePicked : undefined}>
        {option ? (
          <PlacedCard option={option} rank={index + 1} picked={picked === option.label} locked={locked}
            onPick={() => (armed ? onPlacePicked() : onPickPlaced(option.label))} onClear={onClear} />
        ) : (
          <button type="button" className="ph" onClick={onPlacePicked} disabled={!picked || locked}
            aria-label={`Rank ${label.n}, ${label.l}: empty${picked ? '. Place the selected card here' : ''}`}>
            {picked ? 'Tap to place here' : 'Empty'}
          </button>
        )}
      </div>
    </div>
  );
}
