import { useId } from 'react';

export function NoteField({ open, onToggle, value, onChange, disabled }: {
  open: boolean; onToggle: () => void; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="notewrap">
      <button type="button" className={'notetoggle' + (open ? ' open' : '')} aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="cv" aria-hidden="true">▶</span> In one line, what would you actually say in this moment?
        <span style={{ color: 'var(--ink-3t)', fontWeight: 400 }}>(optional)</span>
      </button>
      {open && (
        <div id={id}>
          <textarea value={value} maxLength={500} disabled={disabled} aria-label="What you would actually say (optional)"
            onChange={(e) => onChange(e.target.value)} placeholder="Type the words you'd use — or skip this." />
          <div className="sub">Not part of your profile. It helps us check the profile reflects how you'd really respond.</div>
        </div>
      )}
    </div>
  );
}
