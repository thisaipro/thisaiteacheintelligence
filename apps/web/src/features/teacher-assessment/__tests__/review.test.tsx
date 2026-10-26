import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { resetMvpData } from '../api/localBackend';
import { RequireModuleAccess } from '../guards/RequireModuleAccess';
import Review from '../pages/Review';
import { renderAt } from './helpers';

beforeEach(() => { vi.stubEnv('VITE_TA_MODE', 'mvp'); localStorage.clear(); resetMvpData(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function openReview() {
  renderAt('/teacher-assessment/review', <>
    <Route path="/teacher-assessment/review" element={<RequireModuleAccess mode="teacher"><Review /></RequireModuleAccess>} />
    <Route path="/teacher-assessment/submitted" element={<p>SUBMITTED</p>} />
  </>);
}

describe('review demo random fill', () => {
  it('persists valid rankings for all 35 questions, preserves notes/flags, and lets the teacher submit', async () => {
    const attempt = await api.startAttempt('Middle (6-8)');
    await api.putAnswer(attempt.attempt_id, attempt.items[0].item_id, { ranked: ['A', null, null, null], note: 'Keep this note', flagged: true, ms: 18000 });
    const submit = vi.spyOn(api, 'submit');
    openReview();
    const button = await screen.findByRole('button', { name: 'Submit assessment' });
    expect(button).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fill randomly (demo)' }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(submit).not.toHaveBeenCalled();
    const saved = await api.currentAttempt();
    expect(saved?.status).toBe('in_progress');
    expect(Object.keys(saved!.answers)).toHaveLength(35);
    for (const answer of Object.values(saved!.answers)) expect([...answer.ranked].sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(saved!.answers[attempt.items[0].item_id]).toMatchObject({ note: 'Keep this note', flagged: true, ms_on_item: 18000 });
    await user.click(button);
    expect(await screen.findByText('SUBMITTED')).toBeInTheDocument();
    expect((await api.myProfile()).items_answered).toBe(35);
  });

  it('shows save failures and keeps submission disabled while questions are incomplete', async () => {
    await api.startAttempt('Pre-school');
    vi.spyOn(api, 'putAnswer').mockRejectedValue(new ApiError(503, { error: 'unavailable', message: 'Please try again.' }));
    openReview();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Fill randomly (demo)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't fill every item");
    expect(screen.getByRole('button', { name: 'Submit assessment' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fill randomly (demo)' })).toBeEnabled();
  });
});
