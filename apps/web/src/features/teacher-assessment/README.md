# Teacher Intelligence · Assessment

A situational-judgement assessment (SJT) for institutional teachers. Each grade band has 35 classroom scenarios. For each one the teacher ranks four responses from 1 to 4. The output is a 7-dimension teaching-practice profile, a 0–100 Teaching Practice Index, strengths and growth areas, insights, and a 6-week development path.

This feature was ported from the prototype (`Thisai_Teacher_Assessment_standalone.html`) with the same layout, copy and behaviour. Its backend lives in `apps/api`. Scoring runs on the server only, in `apps/api/src/scoring/v1.ts`.

## Mounting in thisai_fe

```tsx
import { TeacherAssessmentRoutes } from '@/features/teacher-assessment';
<Route path="/teacher-assessment/*" element={<TeacherAssessmentRoutes />} />
```

The feature expects a `QueryClientProvider` and a router from the host app. It touches no shared auth, theme or layout component. The only integration point is `src/platform/session.ts`:

| Export        | In thisai_fe, point it at                               |
|---------------|---------------------------------------------------------|
| `fetchMe()`   | the existing `GET /api/me` helper (thisai.pro session)  |
| `signOut()`   | the existing thisai.pro sign-out                        |
| `THISAI_HOME` | `https://thisai.pro`                                    |

The module never stores credentials. All styles are scoped under `.ta`, so nothing leaks into the host app.

## Routes

Every route is wrapped in `<RequireModuleAccess mode="teacher|admin">`.

| Path | Screen | Guard |
|---|---|---|
| `/teacher-assessment` | Landing | teacher |
| `/teacher-assessment/run/:index` | Runner (1-based index) | teacher |
| `/teacher-assessment/review` | Review & submit | teacher |
| `/teacher-assessment/submitted` | Confirmation | teacher |
| `/teacher-assessment/profile` | Own report (live preview while in progress) | teacher; also allowed when the cycle is closed but a profile exists |
| `/teacher-assessment/admin/bank` | Question bank with keys | admin |
| `/teacher-assessment/admin/teachers` | Roster + cohort averages | admin |
| `/teacher-assessment/admin/teachers/:teacherId` | Teacher report, admin view | admin |

While `/access` loads, the guard shows the 4-step check (Thisai account → Institution → Role on record → Module access). A denial shows `AccessDenied(reason)` with a ✓ or ✕ for each step and a link to thisai.pro. An admin who opens a teacher route sees "Admins manage, teachers take". A teacher who opens an admin route sees `NOT_ADMIN`.

## API — `/api/teacher-assessment`

Every route resolves identity from the thisai.pro session and re-checks access on the server. Every query is scoped by `institution_id`: the repositories apply a query guard, and Postgres also enforces RLS.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/access` | any signed-in user | `{can_take, can_manage, reason, cycle_id, cycle_name, has_profile}`. `reason` is one of `NOT_TEACHER` · `NO_INSTITUTION` · `MODULE_DISABLED` · `CYCLE_CLOSED` |
| POST | `/attempts` | teacher | `{grade_band, restart?}` → attempt + 35 items (no keys). The same band resumes the attempt. `restart` or a different band clears answers. Returns 409 once submitted in this cycle |
| GET | `/attempts/current` | teacher | Attempt for the open cycle, or `null` |
| PUT | `/attempts/:id/answers/:itemId` | teacher | `{ranked[4], note?, flagged?, ms?}`. Idempotent. `ms_on_item` never decreases. Returns 409 after submit |
| POST | `/attempts/:id/submit` | teacher | Returns 422 `{missing}` unless all 35 items are ranked. Scores, stores the profile (`scoring_version`) and locks the attempt |
| GET | `/profile/me` | teacher | Latest submitted profile (teacher copy) |
| GET | `/preview` | teacher | Partial live profile, not stored. Coaching notes are withheld (see Security) |
| GET | `/admin/items?band&dimension` | admin | Full items including `key_rank`, `points`, `rationale` |
| GET | `/admin/teachers` | admin | Roster: index, band, equity gate, validity flag, per-dimension bands, date |
| GET | `/admin/teachers/:id/profile` | admin | Admin copy + validity reasons + item-level rows. **Audit-logged** |
| GET | `/admin/cohort` | admin | Per-dimension means. `dims` is `null` until N ≥ 5 |

Local development only: `GET /api/me`, `GET /api/dev/users` and `POST /api/dev/switch-user` stand in for thisai.pro when `TA_AUTH_MODE=dev`.

## Env flags (apps/api)

| Variable | Default | Meaning |
|---|---|---|
| `TA_AUTH_MODE` | `thisai` in production, else `dev` | `thisai` forwards Cookie/Authorization to `THISAI_ME_URL`. `dev` uses fixture accounts (refused in production) |
| `THISAI_ME_URL` | — | Required for `thisai` mode, e.g. `https://thisai.pro/api/me` |
| `DATABASE_URL` | — | Postgres. Required in production. Without it the API uses the in-memory store |
| `TA_MODULE_ENABLED` | `true` | Global kill switch. When false, every user gets `MODULE_DISABLED` |
| `TA_PREVIEW_ENABLED` | `true` | Turns the live preview endpoint on or off |
| `TA_SHUFFLE_SALT` | `''` | Appended to the option-shuffle seed (see Security) |
| `TA_ITEM_BANK_PATH` | `apps/api/data/item-bank.v1.json` | Bank used for seeding / the memory store |
| `TA_DEV_SEED` | `true` | Memory store only: seed the 11-teacher demo roster and demo cycles |
| `TA_DEV_DEFAULT_USER` | `t` | Dev fixture account when no cookie/header is set |
| `PORT` | `8787` | |

Web (`apps/web`): `TA_API_URL` sets the Vite dev proxy target (default `http://localhost:8787`).

Per-institution enablement is data, not an env flag. An institution is enabled when it has a `ta_cycles` row with `enabled = true`. It is open to teachers while `opens_at ≤ now < closes_at`.

## Database

The schema is in `apps/api/src/db/migrations/001_teacher_assessment.sql`:

- The spec tables: `ta_items`, `ta_options`, `ta_cycles`, `ta_attempts`, `ta_answers`, `ta_profiles`.
- `ta_audit_log`, for admin profile views.
- `ta_attempts.teacher_name` / `department`: snapshots of `/api/me`, because the module owns no user records.
- A unique index on `(teacher_id, cycle_id)`: one attempt per cycle. A retake happens in the next cycle.

Run the migrations and seed the bank:

```
DATABASE_URL=postgres://owner@…/db npm run migrate -w @thisai/ta-api -- --seed-items
```

For RLS to apply, the API must connect as a role that is **not** the table owner (owners bypass RLS). Grant that role these privileges:

```sql
GRANT SELECT ON ta_items, ta_options TO ta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ta_cycles, ta_attempts, ta_answers, ta_profiles TO ta_app;
GRANT SELECT, INSERT ON ta_audit_log TO ta_app;
GRANT USAGE ON SEQUENCE ta_audit_log_id_seq TO ta_app;
```

## Scoring

`scoring/v1.ts` implements the spec exactly:

- round-robin assembly
- FNV-1a → mulberry32 → Fisher–Yates shuffle, with the key-order guard
- displacement item score
- dimension bands
- equity gate
- index 77/43
- disjoint strengths and growth
- coaching notes
- insights
- 6-week path
- cohort N ≥ 5
- validity flag

Deviations and interpretations to review:

1. **Validity: "same option label at the same rank ≥ 80%"** is applied to the label the teacher *sees*, i.e. display position. In the bank, A–D always follow the keyed order (A = key 1 on all 210 items). A bank-label rule would therefore flag exactly the teachers who agree with the framework; on the demo roster it flagged 3 of the 4 strongest profiles.
2. **Coaching-note context phrase**: a leading "On" and a leading article are stripped as well as "During/At/In". Without this the note reads "In the on a unit test scenario".
3. **Copy**: two catalogue strings said "failed/fails", which breaks the no "exam/score/fail" rule for teachers. They were reworded. The prototype's "Not an exam" card became "A reflection, not an appraisal". The admin "strong" framing now says thirty-five scenarios (the prototype said fourteen).

## Security notes

- Keys never reach a teacher's browser. Options are served in display order and **relabelled A–D by position**, because bank labels encode the key. The server maps display labels back to bank labels.
- The spec's shuffle seed (`item_id + "#opts"`) is public, and bank labels follow the key. Anyone with the algorithm can therefore recompute the key from an item_id. Set `TA_SHUFFLE_SALT` to a secret to close this. Changing it changes every item's display order, so set it before the first cycle.
- The live preview withholds coaching notes, because they quote the keyed best response while answers can still change. Band changes in the preview are still a weak signal while an item is re-ranked. Set `TA_PREVIEW_ENABLED=false` to remove the preview.

## Offline tolerance

Every placement updates the React Query cache optimistically. It is then debounced for 400 ms per item and written to an IndexedDB outbox (`api/outbox.ts`). The outbox keeps one entry per attempt+item, and the newest write wins. The outbox flushes immediately, on `online`, every 15 s while anything is pending, and on the next load. A final 4xx (for example, locked after submit) is dropped. Submit flushes the outbox first and refuses to submit while anything is still queued.

## PDF

The report is a pure view model, `buildReportView(profile, role, cohort?)`. The screen and the print output render the same model. "Download report" and "Export PDF" currently call `window.print()` with the print CSS in `styles/module.css`. The career-report pagination/print CSS (`CareerCounsellorSection`) is not in this repo. Swap it in, or point the button at the server-side PDF service, when this is mounted in thisai_fe.

## Accessibility & design

- Tokens follow the Thisai light theme. The spec colours are used for fills and borders.
- Small text uses same-hue AA variants (`--ink-3t`, `--developing-t`, `--strong-t`), because `--ink-4` on white (2.3:1) and `--developing` on its soft chip (3.3:1) fail WCAG AA.
- Hit targets are ≥ 44 px. The layout is checked at 360 px with no horizontal scroll.
- Ranking works by drag-and-drop (pointer, touch and keyboard sensors) and by tap-card-then-tap-slot. On the keyboard, ↑/↓ choose a card, 1–4 place it and Delete takes it back. Every change is announced through `aria-live`.

## Tests

```
npm test                                   # api (scoring, access, API journey) + web
TA_TEST_DATABASE_URL=postgres://owner@…/db TA_TEST_APP_DATABASE_URL=postgres://app@…/db \
  npm test -w @thisai/ta-api               # also runs migrations + RLS against Postgres
npm run gen:web-fixtures -w @thisai/ta-api # refresh report fixtures after a scoring change
```

- `apps/api/test/scoring.test.ts`: spec fixtures (1234 → 3.00 … 4321 → 0.00), index 69, strengths and growth, the uneven insight, the equity gate, the path, coaching notes, round-robin order, the shuffle against the prototype's own output, and validity.
- `apps/api/test/access.test.ts`: all four denial reasons, admin manage-only.
- `apps/api/test/api.test.ts`: every route re-checks access, no keys in teacher payloads, the full journey, locking, audit log, cohort N ≥ 5, institution scoping.
- `apps/web/.../__tests__/guard.test.tsx`: the 4-step check, the 4 denial reasons with ✓/✕, admin-on-teacher-route, teacher-on-admin-route.
- `apps/web/.../__tests__/report.test.tsx`: view-model and render snapshots in teacher and admin mode, and the no "exam/score/fail" rule.
- `apps/web/.../__tests__/ranking.test.tsx`: tap and keyboard ranking. `outbox.test.ts` covers offline queue and sync.
