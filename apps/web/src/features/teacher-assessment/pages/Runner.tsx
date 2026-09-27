import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { blankAnswer, useAnswerSaver, useCurrentAttempt } from '../api/queries';
import { useModuleSession } from '../guards/RequireModuleAccess';
import { BASE_PATH, ModuleHeader } from '../components/shell/ModuleHeader';
import { FlagButton } from '../components/runner/FlagButton';
import { NoteField } from '../components/runner/NoteField';
import { RankableOptionList } from '../components/runner/RankableOptionList';
import { Rail } from '../components/runner/Rail';
import { gradeBandLabel, isRanked } from '../model/bands';
import { useRunnerUI } from '../model/runnerStore';
import type { AttemptDTO } from '../model/types';

/** Accumulates visible time per item (sent as ms_on_item; used by the validity check). */
function useItemTimer(attempt: AttemptDTO | null | undefined, itemId: string | undefined) {
  const acc = useRef(new Map<string, number>());
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!attempt) return;
    for (const [id, a] of Object.entries(attempt.answers)) if (!acc.current.has(id)) acc.current.set(id, a.ms_on_item);
  }, [attempt?.attempt_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!itemId) return;
    const stop = () => {
      if (since.current !== null) acc.current.set(itemId, (acc.current.get(itemId) ?? 0) + Date.now() - since.current);
      since.current = null;
    };
    const startT = () => { if (since.current === null && document.visibilityState !== 'hidden') since.current = Date.now(); };
    const onVis = () => (document.visibilityState === 'hidden' ? stop() : startT());
    startT();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [itemId]);

  return useCallback((id: string) => {
    const base = acc.current.get(id) ?? 0;
    return Math.round(id === itemId && since.current !== null ? base + Date.now() - since.current : base);
  }, [itemId]);
}

export default function Runner() {
  const { me } = useModuleSession();
  const { index } = useParams();
  const nav = useNavigate();
  const q = useCurrentAttempt();
  const attempt = q.data;
  const n = Math.max(1, Number(index) || 1);
  const idx = attempt ? Math.min(n, attempt.items.length) - 1 : 0;
  const item = attempt?.items[idx];
  const getMs = useItemTimer(attempt, item?.item_id);
  const saver = useAnswerSaver(getMs);
  const { noteOpen, setNoteOpen, resetForItem } = useRunnerUI();
  const startedAt = useRef(Date.now());
  const clockStart = useMemo(() => (attempt ? Math.min(Date.parse(attempt.started_at), startedAt.current) : startedAt.current), [attempt?.started_at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (item) resetForItem(!!attempt?.answers[item.item_id]?.note); }, [item?.item_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [idx]);

  if (q.isPending) return <div className="ta"><ModuleHeader mode="Assessment" me={me} /><p className="loading">Loading your scenarios…</p></div>;
  if (!attempt) return <Navigate to={BASE_PATH} replace />;
  if (attempt.status === 'submitted') return <Navigate to={`${BASE_PATH}/profile`} replace />;
  if (String(idx + 1) !== index) return <Navigate to={`${BASE_PATH}/run/${idx + 1}`} replace />;
  if (!item) return <Navigate to={BASE_PATH} replace />;

  const items = attempt.items;
  const answer = attempt.answers[item.item_id] ?? blankAnswer(item.item_id);
  const placed = answer.ranked;
  const done = placed.filter(Boolean).length;
  const ready = done === 4;
  const rankedCount = items.filter((i) => isRanked(attempt.answers[i.item_id]?.ranked)).length;
  const allDone = rankedCount === items.length;
  const bandLabel = gradeBandLabel(attempt.grade_band);
  const jump = (i: number) => {
    void saver.flushNow();
    nav(`${BASE_PATH}/run/${Math.max(0, Math.min(items.length - 1, i)) + 1}`);
  };
  const toReview = () => { void saver.flushNow(); nav(`${BASE_PATH}/review`); };
  const left = items.length - idx - 1;

  return (
    <div className="ta">
      <ModuleHeader mode={`Assessment · ${bandLabel} band`} me={me} />
      <div className="runshell">
        <Rail items={items} answers={attempt.answers} idx={idx} onJump={jump} start={clockStart} />
        <main>
          <div className="progline" style={{ maxWidth: 'none' }}>
            <div className="meta">
              <span className="n">Item {idx + 1} of {items.length}</span>
              <span className="cat">{item.dimension}</span>
              <span className="rest">{left} left · about {Math.max(1, left)} min</span>
            </div>
            <div className="ptrack" role="progressbar" aria-label="Items ranked" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={rankedCount}>
              <i style={{ width: (rankedCount / items.length) * 100 + '%' }}></i>
            </div>
          </div>
          <section className="scenario" aria-labelledby="ta-scn">
            <div className="ctx">{bandLabel} · Scenario {idx + 1}</div>
            <p id="ta-scn">{item.scenario}</p>
          </section>

          <RankableOptionList itemId={item.item_id} options={item.options} placed={placed}
            onChange={(next) => saver.update(item.item_id, { ranked: next })} />

          <div className={'validate' + (ready ? ' ok' : '')} role="status">
            {ready
              ? <><b aria-hidden="true">✓</b> All four ranked and saved — you can change this until you submit.</>
              : <><b aria-hidden="true">○</b> {4 - done} of 4 still to place. All four need a rank before this item counts.</>}
          </div>

          <NoteField open={noteOpen} onToggle={() => setNoteOpen(!noteOpen)} value={answer.note}
            onChange={(v) => saver.update(item.item_id, { note: v })} />

          <div className="navrow">
            <button className="btn ghost" onClick={() => jump(idx - 1)} disabled={idx === 0}>← Back</button>
            <FlagButton on={answer.flagged} onToggle={() => saver.update(item.item_id, { flagged: !answer.flagged })} />
            <span className="spacer"></span>
            {saver.pending > 0 && saver.lastError === 'offline'
              ? <span className="syncnote" role="status">Saved on this device · will sync when you're back online</span>
              : saver.savedAt && <span className="saved" role="status" style={{ marginRight: 6 }}><span className="tick" aria-hidden="true">✓</span>Saved</span>}
            {idx === items.length - 1
              ? <button className="btn pri" onClick={toReview}>Review &amp; submit →</button>
              : <button className="btn pri" onClick={() => jump(idx + 1)}>{ready ? 'Next item' : 'Skip for now'} →</button>}
          </div>
          {allDone && idx !== items.length - 1 && (
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button className="btn quiet sm" onClick={toReview}>All {items.length} ranked — go to review &amp; submit</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
