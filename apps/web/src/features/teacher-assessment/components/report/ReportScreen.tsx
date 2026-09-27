/* Renders a ReportView. Shared by the teacher's own profile, the live preview
   and the admin teacher detail; print CSS turns the same markup into the PDF. */
import { useState, type ReactNode } from 'react';
import type { ReportView } from '../../model/reportView';
import { CohortTable, ItemLevelTable, Readout, ValidityBanner } from './AdminExtras';
import { BandLegend, DimensionRow } from './DimensionRow';
import { EquityGate } from './EquityGate';
import { IndexHero } from './IndexHero';
import { Insights } from './Insights';
import { PathTimeline } from './PathTimeline';
import { BandDistribution, CompetencyRadar, DimensionBars } from './ProfileCharts';
import { ProgrammeCards } from './ProgrammeCards';
import { StrengthsGrowth } from './StrengthsGrowth';

export function ReportScreen({ view, actions, onBack }: { view: ReportView; actions?: ReactNode; onBack?: () => void }) {
  const [open, setOpen] = useState<string | null>(view.equityGate ? 'equity' : null);
  const { admin } = view;
  return (
    <main className="wrap mid" data-role={view.role}>
      {onBack && <button className="btn quiet sm noprint" style={{ marginBottom: 8 }} onClick={onBack}>← Back</button>}
      {view.previewBanner && <div className="livebanner" role="status" style={{ margin: '0 0 16px' }}>{view.previewBanner}</div>}

      <IndexHero view={view} actions={actions} />
      {view.validity && <ValidityBanner reasons={view.validity.reasons} />}
      {view.equityGate && <EquityGate gate={view.equityGate} />}
      {view.readout && <Readout />}

      <div className="sechead"><h2>{view.copy.profileTitle}</h2><span className="desc">{view.copy.profileDesc}</span></div>
      <div className="chartrow">
        <div className="chartcard">
          <div className="ch"><h3>Profile shape</h3><span>0 at centre · 3 at the edge</span></div>
          <p className="cn">{view.radarNote}</p>
          <CompetencyRadar points={view.radar} />
          <div className="radarkey">
            <span className="lg"><span className="sw" style={{ background: 'var(--brand)' }}></span>{admin ? view.name.split(' ')[0] : 'Your profile'}</span>
            {admin && view.radar.some((p) => p.avg !== null) && (
              <span className="lg"><span className="sw" style={{ background: 'var(--ink-3)', height: 0, borderTop: '2px dashed var(--ink-3)' }}></span>School average</span>
            )}
          </div>
        </div>
        <div className="chartcard">
          <div className="ch"><h3>{view.barsTitle}</h3><span>strongest first</span></div>
          <p className="cn">{view.barsNote}</p>
          <DimensionBars rows={view.bars} admin={admin} />
          <div className="sechead" style={{ margin: '22px 0 8px' }}><h2 style={{ fontSize: 14 }}>Band distribution</h2><span className="desc">How the seven dimensions fall</span></div>
          <BandDistribution counts={view.distribution} />
        </div>
      </div>

      {view.showAreas && (
        <>
          <div className="sechead"><h2>{view.copy.subtitle}</h2><span className="desc">Highest and lowest of the seven dimensions</span></div>
          <StrengthsGrowth strengths={view.strengths} growth={view.growth} />
        </>
      )}

      <div className="sechead"><h2>Key insights</h2><span className="desc">{view.copy.insightsDesc}</span></div>
      <Insights items={view.insights} />

      {view.cohort && (
        <>
          <div className="sechead"><h2>Against the cohort</h2><span className="desc">{view.cohort.available ? `This teacher versus the ${view.cohort.n}-teacher school average` : 'Available from five teachers'}</span></div>
          <CohortTable cohort={view.cohort} />
        </>
      )}

      <div className="sechead"><h2>What the responses showed</h2><span className="desc">Open any dimension for the coaching note behind it</span></div>
      <BandLegend />
      <div className="profile">
        {view.dimRows.map((row) => (
          <DimensionRow key={row.id} row={row} open={open === row.id} previewNote={view.preview} onToggle={() => setOpen(open === row.id ? null : row.id)} />
        ))}
      </div>

      {view.programmes.length > 0 && (
        <>
          <div className="sechead"><h2>{view.copy.recommended}</h2><span className="desc">Thisai programmes matched to this profile</span></div>
          <ProgrammeCards items={view.programmes} />
        </>
      )}

      {view.path.length > 0 && (
        <>
          <div className="sechead"><h2>{view.copy.pathTitle}</h2><span className="desc">Sequenced from the two widest gaps</span></div>
          <PathTimeline steps={view.path} />
        </>
      )}

      <p className="foot-note">{view.footNote}</p>
      {view.itemLevel && <ItemLevelTable rows={view.itemLevel} />}
    </main>
  );
}
