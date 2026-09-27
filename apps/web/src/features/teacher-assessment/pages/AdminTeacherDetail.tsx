import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminCohort, useAdminTeacherProfile } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { ReportScreen } from '../components/report/ReportScreen';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { COPY } from '../model/copy';
import { buildReportView } from '../model/reportView';

export default function AdminTeacherDetail() {
  const { me } = useModuleSession();
  const { teacherId = '' } = useParams();
  const nav = useNavigate();
  const profile = useAdminTeacherProfile(teacherId);
  const cohort = useAdminCohort();
  const view = useMemo(() => (profile.data ? buildReportView(profile.data, 'admin', cohort.data ?? null) : null), [profile.data, cohort.data]);
  const back = () => nav(`${BASE_PATH}/admin/teachers`);
  return (
    <div className="ta">
      <ModuleHeader mode={COPY.modeAdminDetail} tabs="admin" me={me} />
      {profile.isPending ? <p className="loading">Loading profile…</p> : view ? (
        <ReportScreen view={view} onBack={back} actions={<button className="btn ghost sm" onClick={() => window.print()}>Export PDF</button>} />
      ) : (
        <main className="errbox"><h1>No submitted profile</h1><p>This teacher has not submitted an assessment yet.</p>
          <p><button className="btn ghost" onClick={back}>← All teachers</button></p></main>
      )}
    </div>
  );
}
