import { useNavigate } from 'react-router-dom';
import { useCurrentAttempt, useMyProfile } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { COPY } from '../model/copy';
import { formatDate } from '../model/reportView';

export default function Submitted() {
  const { me } = useModuleSession();
  const nav = useNavigate();
  const attempt = useCurrentAttempt().data;
  const profile = useMyProfile().data;
  const total = profile?.items_total ?? attempt?.items.length ?? 35;
  const date = formatDate(profile?.assessed_at ?? attempt?.submitted_at ?? null);
  return (
    <div className="ta">
      <ModuleHeader mode={COPY.modeTeacher} me={me} />
      <main className="wrap narrow confirm">
        <div className="seal" aria-hidden="true">✓</div>
        <h1>Submitted. Your profile is ready.</h1>
        <p>All {total} items recorded{date ? ` on ${date}` : ''}. Thank you for ranking as you'd actually respond — that is what makes the profile worth reading.</p>
        <ol className="nextsteps" style={{ listStyle: 'none', padding: 0 }}>
          <li className="nextstep"><b>01</b><div>Your <b>teaching practice profile</b> is available now, and stays in your Thisai account.</div></li>
          <li className="nextstep"><b>02</b><div>Your academic head receives the same profile, to plan coaching and peer pairings for the term.</div></li>
          <li className="nextstep"><b>03</b><div>No ranking against colleagues, and no item-by-item breakdown is shared with any colleague.</div></li>
        </ol>
        <div style={{ marginTop: 30 }}><button className="btn pri" onClick={() => nav(`${BASE_PATH}/profile`)}>Open my profile →</button></div>
      </main>
    </div>
  );
}
