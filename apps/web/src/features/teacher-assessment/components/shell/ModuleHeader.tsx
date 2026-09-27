import { NavLink } from 'react-router-dom';
import logo from '../../assets/THISAI FINAL BLUE-8.png';
import { signOut } from '../../../../platform/session';
import { isMvp } from '../../model/config';
import { roleBadge } from '../../model/copy';
import type { Me, ModuleMode } from '../../model/types';

export const BASE_PATH = '/teacher-assessment';

const TABS: Record<ModuleMode, { to: string; label: string; end?: boolean }[]> = {
  teacher: [
    { to: BASE_PATH, label: 'Assessment', end: true },
    { to: `${BASE_PATH}/profile`, label: 'My profile' },
  ],
  admin: [
    { to: `${BASE_PATH}/admin/bank`, label: 'Question bank' },
    { to: `${BASE_PATH}/admin/teachers`, label: 'Teachers' },
  ],
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

export function ModuleHeader({ mode, tabs, me }: { mode: string; tabs?: ModuleMode; me?: Me | null }) {
  return (
    <header className="hud">
      <div className="in">
        <div className="brand">
          <a href="https://thisai.pro" aria-label="Thisai home"><img src={logo} alt="Thisai" /></a>
          <span className="sep" aria-hidden="true"></span>
          <span className="md">{mode}</span>
        </div>
        {tabs ? (
          <nav className="ptabs" aria-label="Teacher Assessment">
            {/* MVP has no roles yet, so the admin pages sit next to the teacher ones. */}
            {(isMvp() ? [...TABS.teacher, ...TABS.admin] : TABS[tabs]).map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'on' : '')}>
                <span className="dt" aria-hidden="true"></span>{t.label}
              </NavLink>
            ))}
          </nav>
        ) : <span className="hud-gap"></span>}
        <div className="me">
          {me && <div className="who"><b>{me.name}</b><span>{me.institution_name || 'No institution'}</span></div>}
          {me && (
            <span className="av" aria-label={`${me.name}, ${me.role}`}>
              {initials(me.name)}<i>{roleBadge(me.role, !!me.institution_id)}</i>
            </span>
          )}
          {me && !isMvp() && <button className="out" onClick={signOut}>Sign out</button>}
        </div>
      </div>
    </header>
  );
}
