/* Local development only: switch between the API's fixture accounts, the way the
   prototype's screen switcher did. Never rendered in a production build. */
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const ACCOUNTS: [string, string][] = [
  ['t', 'Teacher'], ['a', 'Institution admin'], ['s', 'Student'], ['i', 'Teacher · no institution'],
  ['d', 'Teacher · module off'], ['c', 'Teacher · cycle closed'], ['none', 'Signed out'],
];

export function DevAccountBar() {
  const qc = useQueryClient();
  const [cur, setCur] = useState<string>(() => document.cookie.match(/ta_dev_user=([^;]+)/)?.[1] ?? 't');
  useEffect(() => { document.body.style.margin = '0'; }, []);
  async function pick(user: string) {
    await fetch('/api/dev/switch-user', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user }) });
    setCur(user);
    qc.clear();
    window.history.pushState({}, '', '/teacher-assessment');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', padding: '8px 16px', background: '#11163a', color: '#c9cdea', font: '600 11.5px Outfit, system-ui, sans-serif' }}>
      <span style={{ letterSpacing: '.16em', textTransform: 'uppercase', fontSize: 9.5, color: '#8e94c4', marginRight: 4 }}>Dev · account</span>
      {ACCOUNTS.map(([k, l]) => (
        <button key={k} onClick={() => pick(k)} style={{ background: cur === k ? '#fff' : 'transparent', color: cur === k ? '#11163a' : '#c9cdea', border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', font: 'inherit' }}>{l}</button>
      ))}
    </div>
  );
}
