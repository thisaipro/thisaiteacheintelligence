import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportScreen } from '../components/report/ReportScreen';
import { buildReportView } from '../model/reportView';
import type { CohortDTO, ProfileDTO } from '../model/types';
import teacherFx from './fixtures/profile.teacher.json';
import adminFx from './fixtures/profile.admin.json';
import cohortFx from './fixtures/cohort.json';

const teacher = teacherFx as unknown as ProfileDTO;
const admin = adminFx as unknown as ProfileDTO;
const cohort = cohortFx as unknown as CohortDTO;

describe('buildReportView', () => {
  it('teacher view model (snapshot)', () => {
    expect(buildReportView(teacher, 'teacher', cohort)).toMatchSnapshot();
  });
  it('admin view model (snapshot)', () => {
    expect(buildReportView(admin, 'admin', cohort)).toMatchSnapshot();
  });
  it('teacher view never carries cohort, validity or item-level data', () => {
    const v = buildReportView({ ...admin, validity_flag: true }, 'teacher', cohort);
    expect(v.cohort).toBeNull();
    expect(v.validity).toBeNull();
    expect(v.itemLevel).toBeNull();
    expect(v.radar.every((p) => p.avg === null)).toBe(true);
    expect(v.bars.every((b) => b.avg === null)).toBe(true);
  });
  it('admin view hides cohort values below N = 5', () => {
    const v = buildReportView(admin, 'admin', { n: 3, min_n: 5, available: false, dims: null });
    expect(v.cohort).toMatchObject({ n: 3, available: false });
    expect(v.radar.every((p) => p.avg === null)).toBe(true);
  });
  it('equity gate callout and equity row first when the gate is raised', () => {
    const v = buildReportView(teacher, 'teacher');
    expect(teacher.equity_gate).toBe(true);
    expect(v.equityGate).not.toBeNull();
    expect(v.dimRows[0].id).toBe('equity');
  });
});

describe('ReportScreen', () => {
  it('renders the teacher report (snapshot) without exam/score/fail wording', () => {
    const { container } = render(<ReportScreen view={buildReportView(teacher, 'teacher')} />);
    expect(container.firstChild).toMatchSnapshot();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/\b(exams?|scores?|scored|scoring|fail(ed|s|ure)?)\b/i);
    expect(screen.getByRole('region', { name: /worth talking through/ })).toBeInTheDocument();
    expect(screen.queryByText(/Item-level ranking data/)).toBeNull();
    expect(screen.queryByText(/School average/)).toBeNull();
  });
  it('renders the admin report (snapshot) with the caution banner and cohort', () => {
    const { container } = render(<ReportScreen view={buildReportView(admin, 'admin', cohort)} />);
    expect(container.firstChild).toMatchSnapshot();
    expect(screen.getByText(/Read with caution/)).toBeInTheDocument();
    expect(screen.getByText(/Item-level ranking data/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Against the cohort' })).toBeInTheDocument();
  });
  it('labels the live preview and holds back coaching notes', () => {
    const preview: ProfileDTO = { ...teacher, preview: true, items_answered: 12, assessed_at: null, dims: teacher.dims.map((d) => ({ ...d, coaching_note: null })) };
    render(<ReportScreen view={buildReportView(preview, 'teacher')} />);
    expect(screen.getByRole('status')).toHaveTextContent('Live preview — built from the 12 items you have ranked so far.');
  });
});
