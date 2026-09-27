import { useNavigate } from 'react-router-dom';
import { THISAI_HOME, signOut } from '../../../platform/session';
import { COPY, DENIAL, ROLE_LABEL } from '../model/copy';
import type { AccessResponse, ClientDenialReason, Me } from '../model/types';
import { AccessChecks } from './AccessCheck';
import { BASE_PATH } from '../components/shell/ModuleHeader';

const Lock = () => (
  <div className="seal" aria-hidden="true">
    <svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></svg>
  </div>
);

export function AccessDenied({ reason, me, access }: { reason: ClientDenialReason; me: Me; access: AccessResponse | null }) {
  const nav = useNavigate();
  const d = DENIAL[reason];
  return (
    <main className="denied" data-reason={reason}>
      <Lock />
      <h1>{d.title}</h1>
      <p>{d.body}</p>
      {reason !== 'NOT_ADMIN' && <AccessChecks me={me} access={access} settled />}
      <div className="acct"><b>{me.name}</b>{me.email ? <> · {me.email}</> : null} · {ROLE_LABEL[me.role] ?? me.role}</div>
      {(reason === 'NOT_TEACHER' || reason === 'NO_INSTITUTION') && (
        <p style={{ fontSize: 13, color: 'var(--ink-3t)' }}>If you teach at a Thisai partner institution, ask your academic head to add you as teaching staff.</p>
      )}
      <div className="acts" style={{ marginTop: 22 }}>
        {reason === 'NOT_ADMIN'
          ? <button className="btn pri" onClick={() => nav(BASE_PATH)}>Go to my assessment</button>
          : <a className="btn pri" href={THISAI_HOME}>Go to thisai.pro</a>}
        {reason === 'CYCLE_CLOSED' && access?.has_profile && (
          <button className="btn ghost" onClick={() => nav(`${BASE_PATH}/profile`)}>Open my last profile</button>
        )}
        <button className="btn ghost" onClick={signOut}>Sign in with another account</button>
      </div>
    </main>
  );
}

export function AdminsManage() {
  const nav = useNavigate();
  return (
    <main className="denied" data-reason="ADMIN_ON_TEACHER_ROUTE">
      <h1>{COPY.adminsManageTitle}</h1>
      <p>{COPY.adminsManageBody}</p>
      <div className="acts" style={{ marginTop: 22 }}>
        <button className="btn pri" onClick={() => nav(`${BASE_PATH}/admin/bank`)}>Go to question bank</button>
      </div>
    </main>
  );
}

export function SignInNeeded() {
  return (
    <main className="denied" data-reason="SIGNED_OUT">
      <Lock />
      <h1>Sign in with your Thisai account</h1>
      <p>Teacher Assessment uses your existing thisai.pro login. No new account or password is needed.</p>
      <div className="acts" style={{ marginTop: 22 }}>
        <a className="btn pri" href={`${THISAI_HOME}/login?next=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.href)}`}>Continue with thisai.pro →</a>
      </div>
    </main>
  );
}
