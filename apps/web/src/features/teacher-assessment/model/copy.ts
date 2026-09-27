/* All user-facing strings with a teacher and an admin variant.
   Teacher copy never says "exam", "score" or "fail" — use profile, practice, development. */
import type { ClientDenialReason, ViewerRole } from './types';

type Variant = Record<ViewerRole, string>;
const v = (teacher: string, admin: string): Variant => ({ teacher, admin });

export const DENIAL: Record<ClientDenialReason, { title: string; body: string }> = {
  NOT_TEACHER: {
    title: "Teacher Assessment isn't available for this account",
    body: 'Teacher Assessment is only for teaching staff. Your Thisai account is not a teacher account, so the assessment is hidden for you.',
  },
  NO_INSTITUTION: {
    title: "Teacher Assessment isn't available for this account",
    body: 'Your Thisai account is not linked to an institution. Teacher Assessment is switched on by a school or college for its own teaching staff.',
  },
  MODULE_DISABLED: {
    title: "Teacher Assessment isn't switched on yet",
    body: 'Your institution has not switched on Teacher Assessment. Your academic head can enable it for teaching staff.',
  },
  CYCLE_CLOSED: {
    title: 'The current assessment cycle is closed',
    body: 'Teacher Assessment opens in cycles set by your institution. The last cycle has closed; your academic head will announce the next one.',
  },
  NOT_ADMIN: {
    title: 'This page is for institution admins',
    body: 'The question bank and teacher profiles are managed by your institution admin. Your own assessment and profile are one click away.',
  },
};

export const ACCESS_STEPS = ['Thisai account', 'Institution', 'Role on record', 'Teacher Assessment access'] as const;

export const ROLE_LABEL: Record<string, string> = {
  teacher: 'Teacher', institution_admin: 'Institution admin', student: 'Student', parent: 'Parent',
};
export const roleBadge = (role: string, hasInstitution: boolean) =>
  role === 'institution_admin' ? 'ADM' : role === 'student' ? 'STU' : role === 'teacher' ? (hasInstitution ? 'TCH' : 'IND') : 'IND';

export const COPY = {
  modeTeacher: 'Teacher Intelligence · Assessment',
  modeProfile: 'Teacher Intelligence · My profile',
  modeAdmin: 'Administrator · Teacher Assessment',
  modeAdminDetail: 'Administrator · Teacher detail',
  adminsManageTitle: 'Admins manage, teachers take',
  adminsManageBody:
    'Institution administrators can review the question bank and teacher profiles, but the assessment itself opens only for teaching staff.',
  privacyLock: 'Visible only to you and your academic head. Not an appraisal record, and never shown to colleagues.',
  livePreview: (n: number) =>
    `Live preview — built from the ${n} item${n === 1 ? '' : 's'} you have ranked so far. Coaching notes appear after you submit.`,

  reportSubtitle: v('What you are good at, where you can grow', 'Strengths and development areas'),
  insightsDesc: v('Read from your own ranking pattern', 'Read from this teacher’s own ranking pattern'),
  recommended: v('Recommended for you', 'Recommended development'),
  pathTitle: v('Your six-week development path', 'Six-week development path'),
  profileTitle: v('Your teaching practice profile', 'Teaching competency profile'),
  profileDesc: v('Seven dimensions, five scenarios each', 'Seven dimensions, each scored 0–3 across five scenarios'),
  barsTitle: v('Dimension by dimension', 'Ranked by score'),
  barsNote: v('Band zones are shaded behind each bar.', 'Band zones are shaded behind each bar; the ▲ marker is the school average for that dimension.'),
  radarNote: v(
    'The filled shape is your profile — the further a point sits from the centre, the more consistently your ranking matched the framework in that dimension.',
    'The filled shape is this profile, and the dashed outline is the average of the teachers assessed at the school.',
  ),
  footNote: v(
    'The index summarises the seven dimensions; it is not a rating and not comparable across grade bands, since each band draws on its own scenarios. No comparison against colleagues is shown or produced on this report. Scenarios are composites of documented classroom patterns rather than single cited studies.',
    'The index summarises the seven dimension scores; it is not a rating and not comparable across grade bands, since each band draws on its own scenarios. School averages are computed only from teachers with a submitted profile, and shown only when at least five teachers are included. Scenarios are composites of documented classroom patterns rather than single cited studies; each item carries its own source note in the question bank.',
  ),
  equityGateBody: v(
    'On your profile it lands in Developing. Nothing here is a judgement on your teaching — it is the one place where a small, specific change would be felt most by the children who currently get the least of your attention.',
    'On this profile it lands in Developing. That is a coaching conversation to schedule, not a performance record to file — the pattern below is specific enough to act on within a fortnight.',
  ),
  notYet: v('Rank the thirty-five scenarios to build your profile.', 'This teacher has not completed enough scenarios for an index.'),
};
