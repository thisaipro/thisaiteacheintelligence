import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentAttempt, useMyProfile, usePreview } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { ReportScreen } from '../components/report/ReportScreen';
import { COPY } from '../model/copy';
import { buildReportView } from '../model/reportView';

export default function Profile() {
  const { me, access } = useModuleSession();
  const nav = useNavigate();
  const attemptQ = useCurrentAttempt(access.can_take);
  const attempt = access.can_take ? attemptQ.data : null;
  const inProgress = attempt?.status === 'in_progress' && Object.values(attempt.answers).some((a) => a.ranked.some(Boolean));
  const profileQ = useMyProfile(!inProgress && (access.has_profile || attempt?.status === 'submitted'));
  const previewQ = usePreview(!!inProgress);
  const data = inProgress ? previewQ.data : profileQ.data;
  const view = useMemo(() => (data ? buildReportView(data, 'teacher') : null), [data]);
  const loading = (inProgress ? previewQ.isPending : profileQ.isPending && profileQ.fetchStatus !== 'idle') || (access.can_take && attemptQ.isPending);

  return (
    <div className="ta">
      <ModuleHeader mode={COPY.modeProfile} tabs="teacher" me={me} />
      {loading ? <p className="loading">Building your profile…</p> : view ? (
        <ReportScreen view={view} actions={<>
          {view.preview
            ? <button className="btn pri sm" onClick={() => nav(BASE_PATH)}>Continue the assessment</button>
            : <button className="btn pri sm" onClick={() => nav(BASE_PATH)}>Go to my assessment</button>}
          <button className="btn ghost sm" onClick={() => window.print()}>Download report</button>
        </>} />
      ) : (
        <main className="errbox">
          <h1>Your profile appears here</h1>
          <p>Rank the thirty-five scenarios and your teaching practice profile is built from your own responses.</p>
          <p><Link className="btn pri" to={BASE_PATH}>Go to the assessment</Link></p>
        </main>
      )}
    </div>
  );
}
