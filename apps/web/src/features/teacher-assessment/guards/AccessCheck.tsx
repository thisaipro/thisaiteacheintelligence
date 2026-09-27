import { ACCESS_STEPS, DENIAL, ROLE_LABEL } from '../model/copy';
import type { AccessResponse, Me } from '../model/types';

type St = 'ok' | 'no' | 'wait' | '';

export function accessSteps(me: Me | null | undefined, access: AccessResponse | null | undefined) {
  const role = me ? ROLE_LABEL[me.role] ?? me.role : '';
  const staff = !!me && (me.role === 'teacher' || me.role === 'institution_admin');
  const values: { v: string; st: St }[] = [
    me ? { v: me.email ?? me.name, st: 'ok' } : { v: 'Checking…', st: 'wait' },
    !me ? { v: 'Waiting', st: '' } : me.institution_id ? { v: me.institution_name ?? 'Linked', st: 'ok' } : { v: 'Not linked to any institution', st: 'no' },
    !me ? { v: 'Waiting', st: '' } : { v: role, st: staff ? 'ok' : 'no' },
    !access
      ? { v: me ? 'Checking…' : 'Waiting', st: me ? 'wait' : '' }
      : access.can_take
        ? { v: `Enabled for teaching staff${access.cycle_name ? ' · ' + access.cycle_name : ''}`, st: 'ok' }
        : access.can_manage
          ? { v: 'Manage only · admins do not take the assessment', st: 'ok' }
          : { v: access.reason ? DENIAL[access.reason].title : 'Not available for this account', st: 'no' },
  ];
  return ACCESS_STEPS.map((k, i) => ({ k, ...values[i] }));
}

export function AccessChecks({ me, access, settled }: { me: Me | null | undefined; access: AccessResponse | null | undefined; settled?: boolean }) {
  const steps = accessSteps(me, access);
  return (
    <ol className="checks" aria-label="Access checks" style={{ listStyle: 'none', padding: 0 }}>
      {steps.map((c) => {
        const st = settled && c.st === 'wait' ? '' : c.st;
        return (
          <li key={c.k} className={'chk ' + st} data-state={st || 'pending'}>
            <span className="ic" aria-hidden="true">{st === 'ok' ? '✓' : st === 'no' ? '✕' : ''}</span>
            <div><b>{c.k}</b><span>{c.v}</span></div>
            <span className="sr-only">{st === 'ok' ? 'passed' : st === 'no' ? 'not met' : 'checking'}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function AccessCheckScreen({ me, access }: { me: Me | null | undefined; access: AccessResponse | null | undefined }) {
  return (
    <main className="accesspage" aria-busy="true">
      <h1>Checking your access</h1>
      <p className="sub">{me ? `Signed in as ${me.email ?? me.name}. ` : ''}Thisai is reading your role from your institution record.</p>
      <AccessChecks me={me} access={access} />
    </main>
  );
}
