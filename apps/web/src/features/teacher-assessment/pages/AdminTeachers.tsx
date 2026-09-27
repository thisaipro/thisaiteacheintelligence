import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminCohort, useAdminTeachers } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { CohortChart } from '../components/admin/CohortChart';
import { RosterTable } from '../components/admin/RosterTable';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { DIMENSIONS, GRADE_BANDS, gradeBandLabel } from '../model/bands';
import { COPY } from '../model/copy';
import type { RosterRow } from '../model/types';

function toCsv(rows: RosterRow[]) {
  const head = ['teacher_id', 'teacher_name', 'department', 'grade_band', 'status', 'index', 'index_band', 'equity_gate', 'validity_flag', ...DIMENSIONS.map((d) => d.id), 'submitted_at'];
  const esc = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [head.join(','), ...rows.map((r) => [r.teacher_id, r.teacher_name, r.department, r.grade_band, r.status, r.index, r.index_band, r.equity_gate, r.validity_flag, ...DIMENSIONS.map((d) => r.dim_bands[d.id] ?? ''), r.submitted_at].map(esc).join(','))].join('\n');
}

export default function AdminTeachers() {
  const { me, access } = useModuleSession();
  const nav = useNavigate();
  const roster = useAdminTeachers();
  const cohort = useAdminCohort();
  const [band, setBand] = useState('All');
  const [priority, setPriority] = useState(true);
  const all = roster.data ?? [];
  const rows = useMemo(() => {
    let r = all.filter((x) => band === 'All' || x.grade_band === band);
    if (priority) r = [...r].sort((a, b) => Number(!!b.equity_gate) - Number(!!a.equity_gate) || Number(!!b.validity_flag) - Number(!!a.validity_flag));
    return r;
  }, [all, band, priority]);
  const submitted = all.filter((r) => r.status === 'submitted').length;

  function exportCsv() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv' }));
    a.download = 'teacher-assessment-roster.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="ta">
      <ModuleHeader mode={COPY.modeAdmin} tabs="admin" me={me} />
      <main className="wrap">
        <div className="pagehead">
          <div><h1>Teaching practice — school view</h1>
            <div className="sub">{submitted} teacher{submitted === 1 ? '' : 's'} assessed · {all.length - submitted} in progress · {me.institution_name}{access.cycle_name ? ' · ' + access.cycle_name : ''}</div></div>
          <div className="acts"><button className="btn ghost sm" onClick={exportCsv} disabled={!rows.length}>Export CSV</button></div>
        </div>

        <div className="sechead"><h2>Cohort averages</h2><span className="desc">Mean of each dimension across submitted profiles · shown from five teachers</span></div>
        {cohort.data ? <CohortChart cohort={cohort.data} roster={all} /> : <p className="loading">Loading…</p>}

        <div className="sechead"><h2>Teachers</h2><span className="desc">Open any submitted row for the full profile</span></div>
        <div className="filters" role="toolbar" aria-label="Filters">
          <span className="fl">Grade band</span>
          {['All', ...GRADE_BANDS.map((g) => g.id)].map((g) => (
            <button key={g} className={band === g ? 'on' : ''} aria-pressed={band === g} onClick={() => setBand(g)}>{g === 'All' ? 'All' : gradeBandLabel(g)}</button>
          ))}
          <span className="sep" aria-hidden="true"></span>
          <button className={priority ? 'on' : ''} aria-pressed={priority} onClick={() => setPriority(!priority)}>Equity &amp; caution flags first</button>
        </div>
        {roster.isPending ? <p className="loading">Loading teachers…</p> : <RosterTable rows={rows} onOpen={(r) => nav(`${BASE_PATH}/admin/teachers/${encodeURIComponent(r.teacher_id)}`)} />}
        <div className="legendrow">
          <span style={{ fontWeight: 700, color: 'var(--ink-2)' }}>Dimension order:</span>
          {DIMENSIONS.map((d) => <span key={d.id}>{d.short}</span>)}
        </div>
      </main>
    </div>
  );
}
