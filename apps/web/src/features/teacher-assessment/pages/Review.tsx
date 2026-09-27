import { Navigate, useNavigate } from 'react-router-dom';
import { useCurrentAttempt, useSubmit } from '../api/queries';
import { ApiError } from '../api/client';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { dimByName, gradeBandLabel, isRanked } from '../model/bands';

export default function Review() {
  const { me } = useModuleSession();
  const nav = useNavigate();
  const q = useCurrentAttempt();
  const submit = useSubmit();
  const attempt = q.data;
  if (q.isPending) return <div className="ta"><ModuleHeader mode="Assessment · review" me={me} /><p className="loading">Loading…</p></div>;
  if (!attempt) return <Navigate to={BASE_PATH} replace />;
  if (attempt.status === 'submitted') return <Navigate to={`${BASE_PATH}/submitted`} replace />;

  const items = attempt.items;
  const missing = items.filter((i) => !isRanked(attempt.answers[i.item_id]?.ranked));
  const flagged = items.filter((i) => attempt.answers[i.item_id]?.flagged);
  const bandLabel = gradeBandLabel(attempt.grade_band);
  const firstMissing = missing[0] ? items.indexOf(missing[0]) : items.length - 1;
  const onSubmit = () => submit.mutate(attempt.attempt_id, { onSuccess: () => nav(`${BASE_PATH}/submitted`) });
  const err = submit.error instanceof ApiError ? submit.error : null;

  return (
    <div className="ta">
      <ModuleHeader mode="Assessment · review" me={me} />
      <main className="wrap mid">
        <button className="btn quiet sm" onClick={() => nav(`${BASE_PATH}/run/${firstMissing + 1}`)} style={{ marginBottom: 8 }}>← Back to items</button>
        <div className="pagehead"><div><h1>Review &amp; submit</h1>
          <div className="sub">{bandLabel} band · {items.length - missing.length} of {items.length} ranked{flagged.length ? ` · ${flagged.length} flagged for review` : ''}</div></div></div>
        <div className={'validate' + (missing.length ? '' : ' ok')} style={{ marginTop: 0 }} role="status">
          {missing.length
            ? <><b aria-hidden="true">○</b> {missing.length} item{missing.length === 1 ? '' : 's'} still unranked. Every item needs all four responses ranked before the assessment can be submitted.</>
            : <><b aria-hidden="true">✓</b> All items ranked. Submitting locks your answers and builds your profile immediately.</>}
        </div>
        <div className="sechead"><h2>Your items</h2><span className="desc">Open any item to change its ranking</span></div>
        <div className="revlist">
          {items.map((i, n) => {
            const ok = isRanked(attempt.answers[i.item_id]?.ranked);
            const fl = attempt.answers[i.item_id]?.flagged;
            return (
              <button className="revrow" key={i.item_id} onClick={() => nav(`${BASE_PATH}/run/${n + 1}`)}>
                <span className="no">{String(n + 1).padStart(2, '0')}</span>
                <span className="sc">{i.scenario}</span>
                <span className="dm">{dimByName(i.dimension)?.short}</span>
                <span className={'stt ' + (!ok ? 'no' : fl ? 'fl' : 'ok')}>{!ok ? 'Unranked' : fl ? 'Flagged' : 'Ranked'}</span>
              </button>
            );
          })}
        </div>
        {err && (
          <p className="syncnote" role="alert" style={{ marginTop: 14 }}>
            {err.body.error === 'incomplete' ? `${err.body.missing?.length ?? 'Some'} items are not ranked on the server yet. Open them and rank again.` : err.message}
          </p>
        )}
        <div className="startbar">
          <div className="txt"><b>Submission is final.</b><br />After submitting you can read and download your profile, but not change your answers.</div>
          <div className="acts">
            <button className="btn ghost" onClick={() => nav(`${BASE_PATH}/run/${firstMissing + 1}`)}>Keep editing</button>
            <button className="btn pri" disabled={missing.length > 0 || submit.isPending} onClick={onSubmit}>{submit.isPending ? 'Submitting…' : 'Submit assessment'}</button>
          </div>
        </div>
      </main>
    </div>
  );
}
