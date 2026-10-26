/* Client guard — UX only. Every API route re-checks access on the server. */
import { createContext, useContext, type ReactNode } from 'react';
import { useAccess, useMe } from '../api/queries';
import { ModuleHeader } from '../components/shell/ModuleHeader';
import { COPY } from '../model/copy';
import type { AccessResponse, Me, ModuleMode } from '../model/types';
import { AccessCheckScreen } from './AccessCheck';
import { AccessDenied, AdminsManage, SignInNeeded } from './AccessDenied';
import { Navigate } from 'react-router-dom';
import { isSupabase } from '../model/config';
import { SupabaseSignIn } from '../../../platform/SupabaseSignIn';
import { SessionUnavailableError, signOut } from '../../../platform/session';
import { ApiError } from '../api/client';

interface ModuleSession { me: Me; access: AccessResponse }
const Ctx = createContext<ModuleSession | null>(null);

function PageSkeleton() {
  return <main className="wrap page-skeleton" aria-label="Loading assessment" aria-busy="true">
    <div className="skeleton-heading" /><div className="skeleton-card" /><div className="skeleton-card" />
  </main>;
}
export const useModuleSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useModuleSession outside RequireModuleAccess');
  return s;
};

export function RequireModuleAccess({ mode, allowClosedCycle, children }: { mode: ModuleMode; allowClosedCycle?: boolean; children: ReactNode }) {
  const me = useMe();
  const access = useAccess(!!me.data);
  const frame = (body: ReactNode, tabs?: ModuleMode) => (
    <div className="ta"><ModuleHeader mode={mode === 'admin' ? COPY.modeAdmin : 'Teacher Intelligence'} me={me.data} tabs={tabs} />{body}</div>
  );

  if (me.isPending) return frame(isSupabase() ? <PageSkeleton /> : <AccessCheckScreen me={null} access={null} />);
  if (me.isError && !me.data) return frame(<main className="errbox"><h1>{isSupabase() ? "We couldn't load your assessment" : "We couldn't reach thisai.pro"}</h1><p>{me.error instanceof SessionUnavailableError || me.error instanceof ApiError ? me.error.message : 'Check your connection and reload the page.'}</p><div className="acts"><button className="btn pri" onClick={() => void me.refetch()}>Try again</button><button className="btn ghost" onClick={signOut}>Sign in with another account</button></div></main>);
  if (!me.data) return frame(isSupabase() ? <SupabaseSignIn /> : <SignInNeeded />);
  if (isSupabase() && me.data.role === 'unassigned') return frame(
    <main className="denied" data-reason="UNASSIGNED">
      <h1>Your account needs assessment access</h1>
      <p>You're signed in. Ask your assessment coordinator to assign your teacher role and institution before you begin.</p>
    </main>,
  );
  if (access.isPending) return frame(isSupabase() ? <PageSkeleton /> : <AccessCheckScreen me={me.data} access={null} />);
  if (!access.data) return frame(<main className="errbox"><h1>We couldn't check your access</h1><p>Reload the page to try again.</p></main>);

  const a = access.data;
  let allowed = false;
  if (mode === 'teacher') {
    if (a.can_manage && !a.can_take) return isSupabase() ? <Navigate to="/teacher-assessment/admin/teachers" replace /> : frame(<AdminsManage />, 'admin');
    allowed = a.can_take || (!!allowClosedCycle && a.reason === 'CYCLE_CLOSED' && a.has_profile);
    if (!allowed) return frame(<AccessDenied reason={a.reason ?? 'NOT_TEACHER'} me={me.data} access={a} />);
  } else {
    allowed = a.can_manage;
    if (!allowed) return frame(<AccessDenied reason={a.can_take ? 'NOT_ADMIN' : a.reason ?? 'NOT_TEACHER'} me={me.data} access={a} />, a.can_take ? 'teacher' : undefined);
  }
  return <Ctx.Provider value={{ me: me.data, access: a }}>
    {me.isError && <div className="ta-cache-notice" role="status">Couldn't refresh right now. Showing your saved view. <button onClick={() => void me.refetch()}>Retry</button></div>}
    {children}
  </Ctx.Provider>;
}
