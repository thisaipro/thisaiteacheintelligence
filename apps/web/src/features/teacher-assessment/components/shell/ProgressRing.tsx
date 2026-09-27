export function ProgressRing({ value, total }: { value: number; total: number }) {
  const r = 31, c = 2 * Math.PI * r, p = total ? value / total : 0;
  return (
    <div className="tl-ring" role="img" aria-label={`${Math.round(p * 100)}% complete`}>
      <svg width="74" height="74" aria-hidden="true">
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--bg-4)" strokeWidth="7" />
        <circle cx="37" cy="37" r={r} fill="none" stroke="var(--brand)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c * p + ' ' + c} />
      </svg>
      <b>{Math.round(p * 100)}%</b>
    </div>
  );
}
