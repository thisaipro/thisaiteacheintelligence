import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentAttempt, useStartAttempt } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { JourneyStrip } from '../components/shell/JourneyStrip';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { MvpResetButton } from '../components/shell/MvpResetButton';
import { ProgressRing } from '../components/shell/ProgressRing';
import { DIMENSIONS, GRADE_BANDS, ITEMS_PER_ATTEMPT, gradeBandLabel, isRanked } from '../model/bands';
import { COPY } from '../model/copy';

export function firstUnranked(items: { item_id: string }[], answers: Record<string, { ranked: (string | null)[] }>) {
  const i = items.findIndex((it) => !isRanked(answers[it.item_id]?.ranked));
  return i === -1 ? Math.max(0, items.length - 1) : i;
}

export default function Landing() {
  const { me, access } = useModuleSession();
  const nav = useNavigate();
  const attemptQ = useCurrentAttempt();
  const start = useStartAttempt();
  const attempt = attemptQ.data ?? null;
  const [band, setBand] = useState<string>('Middle (6-8)');
  useEffect(() => { if (attempt) setBand(attempt.grade_band); }, [attempt?.attempt_id, attempt?.grade_band]);

  const submitted = attempt?.status === 'submitted';
  const sameBand = attempt?.grade_band === band;
  const total = sameBand && attempt ? attempt.items.length : ITEMS_PER_ATTEMPT;
  const completed = useMemo(
    () => (attempt && sameBand ? attempt.items.filter((i) => isRanked(attempt.answers[i.item_id]?.ranked)).length : 0),
    [attempt, sameBand],
  );
  const touched = !!attempt && sameBand && Object.keys(attempt.answers).length > 0;
  const resumeAt = attempt && sameBand && touched ? firstUnranked(attempt.items, attempt.answers) : 0;
  const hasOtherProgress = !!attempt && !sameBand && Object.keys(attempt.answers).length > 0 && !submitted;
  const stage = submitted ? 3 : !touched ? 0 : completed < total ? 1 : 2;
  const bandMeta = GRADE_BANDS.find((g) => g.id === band)!;

  async function begin(resume: boolean) {
    if (submitted) return nav(`${BASE_PATH}/profile`);
    const restart = !resume && touched;
    if ((restart || hasOtherProgress) &&
      !window.confirm(hasOtherProgress
        ? `Switching to the ${bandMeta.label} band clears the rankings you have made in the ${gradeBandLabel(attempt!.grade_band)} band. Continue?`
        : 'Starting over clears every ranking you have made so far. Continue?')) return;
    if (resume && attempt && sameBand && completed === total) return nav(`${BASE_PATH}/review`);
    const a = resume && attempt && sameBand ? attempt : await start.mutateAsync({ band, restart });
    nav(`${BASE_PATH}/run/${resume ? firstUnranked(a.items, a.answers) + 1 : 1}`);
  }

  const primaryLabel = submitted ? 'Open my profile →' : touched ? 'Start over' : hasOtherProgress ? `Start over on ${bandMeta.label}` : 'Start assessment →';

  return (
    <div className="ta">
      <ModuleHeader mode={COPY.modeTeacher} tabs="teacher" me={me} />
      <main className="tl">
        <div className="tl-head">
          <span className="tl-kick">Teacher Intelligence · Assessment</span>
          <h1>Teaching Practice Assessment</h1>
          <p>{me.institution_name}{access.cycle_name ? ' · ' + access.cycle_name : ''} · open to teaching staff only</p>
        </div>

        <div className="tl-top">
          <section className="tl-card tl-hero" aria-labelledby="ta-hero-h">
            <h2 id="ta-hero-h">What kind of teacher am I, and where can I grow?</h2>
            <p>Real classroom moments written for the age group you teach. For each one, rank four things a teacher might do, from
              closest to what you'd actually do to furthest. No subject knowledge is tested and there is no single right answer to memorise.</p>
            <div className="tl-facts">
              <div><b>{ITEMS_PER_ATTEMPT}</b><span>Scenarios</span></div>
              <div><b>~30</b><span>Minutes</span></div>
              <div><b>{DIMENSIONS.length}</b><span>Dimensions</span></div>
            </div>
          </section>
          <section className="tl-card tl-status" aria-label="Your progress">
            <div className="row">
              <ProgressRing value={submitted ? total : completed} total={total} />
              <div>
                <div className="lbl">Your progress</div>
                <div className="st">{submitted ? 'Submitted' : completed === 0 ? (touched ? 'Started' : 'Not started') : completed < total ? `${completed} of ${total} ranked` : 'All ranked'}</div>
                <div className="sub">{bandMeta.label} band · answers save as you go</div>
              </div>
            </div>
            <div className="acts">
              {!submitted && touched && <button className="btn pri" onClick={() => begin(true)} disabled={start.isPending}>
                {completed === total ? 'Review & submit →' : `Resume at item ${resumeAt + 1} →`}</button>}
              <button className={'btn ' + (!submitted && touched ? 'ghost' : 'pri')} onClick={() => begin(false)} disabled={start.isPending}>{primaryLabel}</button>
              {submitted && <MvpResetButton label="Reset and take it again" className="btn ghost" />}
            </div>
            {start.isError && <p className="syncnote" role="alert">{(start.error as Error).message}</p>}
            <div className="tl-lock">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></svg>
              <span>{COPY.privacyLock}</span>
            </div>
          </section>
        </div>

        <JourneyStrip stage={stage} />

        <section className="tl-sec" aria-labelledby="ta-band-h">
          <div className="tl-sh"><h3 id="ta-band-h">Which age group do you teach?</h3><span>The scenarios change with your answer</span></div>
          <div className="tl-bands" role="radiogroup" aria-labelledby="ta-band-h">
            {GRADE_BANDS.map((g) => (
              <button key={g.id} role="radio" aria-checked={band === g.id} className={band === g.id ? 'on' : ''} disabled={submitted}
                onClick={() => setBand(g.id)}>
                <span className="rd" aria-hidden="true"></span>
                <div><b>{g.label}</b><span>{g.sub}</span></div>
              </button>
            ))}
          </div>
        </section>

        <section className="tl-sec" aria-labelledby="ta-dims-h">
          <div className="tl-sh"><h3 id="ta-dims-h">What is assessed</h3><span>{DIMENSIONS.length} dimensions · five scenarios each</span></div>
          <div className="tl-dims">
            {DIMENSIONS.map((d, i) => (
              <div className="tl-dim" key={d.id}>
                <span className="n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <div><b>{d.name}{d.gate && <em>Gate</em>}</b><p>{d.blurb}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="tl-sec" aria-labelledby="ta-know-h">
          <div className="tl-sh"><h3 id="ta-know-h">Good to know</h3></div>
          <div className="tl-know">
            <div><b>A reflection, not an appraisal</b><p>No pass mark and no ranking against colleagues. You get a development profile.</p></div>
            <div style={{ ['--ac' as string]: 'var(--lime)' }}><b>Change anything</b><p>Flag items, jump back from the side rail and re-rank freely until you submit.</p></div>
            <div style={{ ['--ac' as string]: 'var(--amber)' }}><b>Be honest</b><p>Rank how you'd actually respond, not how you think you should. That makes the profile useful.</p></div>
          </div>
          <details className="tl-rules">
            <summary>All rules <span className="cv" aria-hidden="true">▶</span></summary>
            <div className="rl">
              <div><b>Length</b>{ITEMS_PER_ATTEMPT} scenarios in one section, in any order.</div>
              <div><b>Time</b>About 30 minutes. An elapsed clock runs; nothing is cut off.</div>
              <div><b>Skipping</b>Move past an item and flag it, but rank it before submitting.</div>
              <div><b>Changing answers</b>Freely until you submit. Then answers lock.</div>
              <div><b>Saving</b>Every ranking saves as you place it — even on a weak connection. Close the tab and return anytime.</div>
              <div><b>Who sees it</b>You and your academic head, as a coaching input.</div>
            </div>
          </details>
        </section>
      </main>
      <div className="tl-bar">
        <div className="in">
          <div className="t"><b>{bandMeta.label} band</b> · {ITEMS_PER_ATTEMPT} scenarios · ~30 min{completed > 0 ? ` · ${completed} ranked` : ''}</div>
          <div className="a">
            {!submitted && touched && <button className="btn ghost" onClick={() => begin(true)} disabled={start.isPending}>Resume at item {resumeAt + 1}</button>}
            <button className="btn pri" onClick={() => begin(false)} disabled={start.isPending}>{primaryLabel.replace(' →', '')} →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
