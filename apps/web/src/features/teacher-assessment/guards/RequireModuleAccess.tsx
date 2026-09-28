/* Client guard — UX only. Every API route re-checks access on the server. */
import { createContext, useContext, type ReactNode } from 'react';
import { useAccess, useMe } from '../api/queries';
import { ModuleHeader } from '../components/shell/ModuleHeader';
import { COPY } from '../model/copy';
import type { AccessResponse, Me, ModuleMode } from '../model/types';
import { AccessCheckScreen } from './AccessCheck';
import { AccessDenied, AdminsManage, SignInNeeded } from './AccessDenied';

interface ModuleSession { me: Me; access: AccessResponse }
const Ctx = createContext<ModuleSession | null>(null);
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

  if (me.isPending) return frame(<AccessCheckScreen me={null} access={null} />);
  if (me.isError) return frame(<main className="errbox"><h1>We couldn't reach thisai.pro</h1><p>Check your connection and reload the page.</p></main>);
  if (!me.data) return frame(<SignInNeeded />);
  if (access.isPending) return frame(<AccessCheckScreen me={me.data} access={null} />);
  if (access.isError || !access.data) return frame(<main className="errbox"><h1>We couldn't check your access</h1><p>Reload the page to try again.</p></main>);

  const a = access.data;
  let allowed = false;
  if (mode === 'teacher') {
    if (a.can_manage && !a.can_take) return frame(<AdminsManage />, 'admin');
    allowed = a.can_take || (!!allowClosedCycle && a.reason === 'CYCLE_CLOSED' && a.has_profile);
    if (!allowed) return frame(<AccessDenied reason={a.reason ?? 'NOT_TEACHER'} me={me.data} access={a} />);
  } else {
    allowed = a.can_manage;
    if (!allowed) return frame(<AccessDenied reason={a.can_take ? 'NOT_ADMIN' : a.reason ?? 'NOT_TEACHER'} me={me.data} access={a} />, a.can_take ? 'teacher' : undefined);
  }
  return <Ctx.Provider value={{ me: me.data, access: a }}>{children}</Ctx.Provider>;
}
