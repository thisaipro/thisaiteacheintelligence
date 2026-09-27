import { useEffect, useState } from 'react';

export function Clock({ start }: { start: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <div className="clock" role="timer" aria-label="Elapsed time, no limit">
      <b>{h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`}</b><span>elapsed · no limit</span>
    </div>
  );
}
