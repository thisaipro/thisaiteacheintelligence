/* Static catalogue for Teacher Intelligence · Assessment.
   Ported verbatim from the prototype (teacher-sjt model + TMOD layer) so the
   server narrative and the client report read from one source. */

export type DimensionId = 'equity' | 'deesc' | 'doubt' | 'adapt' | 'decide' | 'critical' | 'lead';
export type Band = 'developing' | 'consistent' | 'strong';
export type IndexBandId = Band;

export interface DimensionMeta {
  id: DimensionId;
  name: string;
  short: string;
  gate: boolean;
  blurb: string;
  action: string;
}

export const DIMENSIONS: DimensionMeta[] = [
  {
    id: 'equity', name: 'Equity of Treatment', short: 'Equity', gate: true,
    blurb: 'Whether every child gets the same quality of attention, patience and benefit of the doubt.',
    action: 'For two weeks, track who you call on and who you follow up with. A 15-minute peer observation focused only on "who did I attend to" surfaces the pattern faster than any training input.',
  },
  {
    id: 'deesc', name: 'Behavioral De-escalation', short: 'De-escalation', gate: false,
    blurb: 'How a heated moment is brought down without humiliation or escalation.',
    action: 'Practise the sequence: remove the audience, drop your voice, address the behaviour privately. Rehearse it on one recurring situation before the next incident.',
  },
  {
    id: 'doubt', name: 'Doubt-Resolution & Responsiveness', short: 'Doubt-Resolution', gate: false,
    blurb: 'What happens when a learner does not follow — and keeps not following.',
    action: 'When an explanation has not landed twice, change the representation — draw it, act it, or hand it to a peer — rather than changing the volume.',
  },
  {
    id: 'adapt', name: 'Instructional Adaptability', short: 'Adaptability', gate: false,
    blurb: 'Willingness to change method, pace or medium when the plan is not landing.',
    action: 'Build one deliberate checkpoint into every long session: two diagnostic questions at the 15-minute mark, then decide whether to continue or switch.',
  },
  {
    id: 'decide', name: 'Decision-Making Under Ambiguity', short: 'Decision-Making', gate: false,
    blurb: 'Acting sensibly when the facts are incomplete and someone still needs an answer now.',
    action: 'A phrase worth practising: "Here is what I know today, here is what I will confirm, and here is when I will come back to you."',
  },
  {
    id: 'critical', name: 'Critical Thinking / Root-Cause Diagnosis', short: 'Critical Thinking', gate: false,
    blurb: 'Separating what was observed from what was assumed before acting on it.',
    action: 'Before acting on a suspicion, gather one piece of first-hand evidence — ask the learner to talk you through their own work.',
  },
  {
    id: 'lead', name: 'Leadership & Influence Style', short: 'Leadership', gate: false,
    blurb: 'Effect on colleagues, parents and the wider staffroom, beyond one classroom.',
    action: 'Next time you raise a concern, attach an offer: "let me run it in one section and bring back what happened."',
  },
];

export const DIMENSION_NAMES = DIMENSIONS.map((d) => d.name);
export const dimById = (id: string) => DIMENSIONS.find((d) => d.id === id);
export const dimByName = (name: string) => DIMENSIONS.find((d) => d.name === name);

export interface GradeBandMeta { id: string; label: string; sub: string }
export const GRADE_BANDS: GradeBandMeta[] = [
  { id: 'Pre-school', label: 'Pre-school', sub: 'Nursery–UKG · ages 3–5' },
  { id: 'Primary (1-5)', label: 'Primary', sub: 'Classes 1–5' },
  { id: 'Middle (6-8)', label: 'Middle', sub: 'Classes 6–8' },
  { id: 'High School (9-10)', label: 'High School', sub: 'Classes 9–10' },
  { id: 'Higher Secondary (11-12)', label: 'Higher Secondary', sub: 'Classes 11–12' },
  { id: 'College/UG', label: 'College / UG', sub: 'Undergraduate faculty' },
];
export const GRADE_BAND_IDS = GRADE_BANDS.map((g) => g.id);
export const gradeBandLabel = (id: string) => GRADE_BANDS.find((g) => g.id === id)?.label ?? id;

export const BANDS: Record<Band, { id: Band; label: string; note: string; range: string }> = {
  developing: { id: 'developing', label: 'Developing', note: 'An area with room to grow', range: '0 – 1.2' },
  consistent: { id: 'consistent', label: 'Consistent', note: 'Dependable in most situations', range: '1.3 – 2.2' },
  strong: { id: 'strong', label: 'Strong', note: 'A visible strength to build on', range: '2.3 – 3.0' },
};
export const BAND_ORDER: Band[] = ['developing', 'consistent', 'strong'];

export const ITEMS_PER_DIMENSION = 5;
export const ITEMS_PER_ATTEMPT = ITEMS_PER_DIMENSION * DIMENSIONS.length; // 35
export const COHORT_MIN_N = 5;

export interface IndexBandMeta { min: number; id: IndexBandId; label: string; frame: string; frameAdmin: string }
export const INDEX_BANDS: IndexBandMeta[] = [
  {
    min: 77, id: 'strong', label: 'Strong practice',
    frame: 'Across the thirty-five scenarios your responses matched the framework closely and consistently. The useful reading of this report is not the number — it is the two dimensions where your ranking diverged most, because those are where a small change will be felt fastest.',
    frameAdmin: "Across the thirty-five scenarios this teacher's responses matched the framework closely and consistently. The number is the least useful part of the profile — the two dimensions where the ranking diverged most are where coaching would land fastest.",
  },
  {
    min: 43, id: 'consistent', label: 'Consistent practice',
    frame: "Your responses were dependable in most situations, with clear variation between dimensions. This is the ordinary shape of an experienced teacher's profile: some instincts are sharp, one or two are still forming. The dimension rows below are where the actual signal is.",
    frameAdmin: "Responses were dependable in most situations, with clear variation between dimensions — the ordinary shape of an experienced teacher's profile. The dimension rows below carry the signal worth acting on, not the index.",
  },
  {
    min: 0, id: 'developing', label: 'Developing practice',
    frame: 'Your rankings diverged from the framework on several scenarios — most often in which response does the least harm rather than which does the most good. That is a coachable, specific gap, and the two priority dimensions below are where to start.',
    frameAdmin: 'Rankings diverged from the framework on several scenarios — most often on which response does the least harm rather than which does the most good. That is a specific, coachable gap; the two priority dimensions below are where to start.',
  },
];
export const indexBandFor = (value: number) => INDEX_BANDS.find((b) => value >= b.min)!;

export interface Programme { title: string; kind: string; weeks: string; mode: string; what: string }
/* Thisai development catalogue, one entry per dimension */
export const PROGRAMMES: Record<DimensionId, Programme> = {
  equity: {
    title: 'Attention Audit', kind: 'Practice tool', weeks: '2 weeks', mode: 'Self-paced + peer observer',
    what: 'A tally sheet and a 15-minute peer observation protocol that records only who you called on, who you followed up with, and who you let pass. The pattern is almost never the one teachers predict.',
  },
  deesc: {
    title: 'Low-Voice De-escalation', kind: 'Workshop', weeks: 'Half day', mode: 'In-person, role-played',
    what: 'Rehearses one sequence until it is automatic: remove the audience, drop the voice, address the behaviour privately, return to instruction inside ninety seconds.',
  },
  doubt: {
    title: 'The Second Explanation', kind: 'Micro-course', weeks: '4 sessions', mode: 'Video + classroom task',
    what: 'Builds a personal bank of second and third representations for the five concepts your learners most reliably get stuck on, so an explanation that does not land has somewhere to go.',
  },
  adapt: {
    title: 'Mid-Lesson Checkpoints', kind: 'Practice tool', weeks: '3 weeks', mode: 'Self-paced',
    what: 'Two diagnostic questions at the fifteen-minute mark, and a decision rule for what to do with the answer. Turns adaptability from instinct into a scheduled habit.',
  },
  decide: {
    title: 'Deciding With Incomplete Facts', kind: 'Clinic', weeks: '2 sessions', mode: 'Case discussion',
    what: 'Works through real school cases — a parent call, an unverified allegation, a missing child — using one holding phrase: what I know today, what I will confirm, when I will come back to you.',
  },
  critical: {
    title: 'Evidence Before Action', kind: 'Micro-course', weeks: '3 sessions', mode: 'Video + reflection log',
    what: 'Separating the observation from the inference. Practises gathering one piece of first-hand evidence — usually asking the learner to talk through their own work — before acting on a suspicion.',
  },
  lead: {
    title: 'Influence Without Authority', kind: 'Workshop', weeks: 'Half day', mode: 'In-person, cohort',
    what: 'How a concern lands in a staffroom: raising it with an attached offer, running a change in one section first, bringing back what actually happened.',
  },
};
