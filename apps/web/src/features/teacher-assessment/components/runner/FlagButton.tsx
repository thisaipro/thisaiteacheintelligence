export function FlagButton({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={'flagbtn' + (on ? ' on' : '')} aria-pressed={on} onClick={onToggle} disabled={disabled}>
      {on ? '● Flagged for review' : '○ Mark for review'}
    </button>
  );
}
