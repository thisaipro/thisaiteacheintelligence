# Thisai — Teacher Intelligence · Assessment
### Claude Code build prompt, scoring algorithm, design & architecture

Paste **Part 1** into Claude Code as the task. Parts 2–5 are the specification it should follow; paste them too (or save this file as `docs/teacher-assessment.md` in the repo and tell Claude Code to read it).

---

## Part 1 — Prompt for Claude Code

```
TASK
Build the "Teacher Intelligence · Assessment" module inside the existing Thisai
platform (thisai_fe). It is a situational-judgement test (SJT) for institutional
teachers: 35 classroom scenarios per grade band, each with 4 responses the teacher
RANKS 1–4. Output is a 7-dimension teaching-practice profile, a 0–100 Teaching
Practice Index, strengths/growth areas, generated insights and a 6-week path.

CONTEXT
- Reuse the existing thisai.pro authentication. Do NOT build a new login, signup
  or password store. The module reads the signed-in user's session and resolves
  role + institution from the institution record on the backend.
- Access rule (enforce server-side AND in routing):
    take test   = role === 'teacher' AND institution_id != null AND module enabled for that institution
    manage      = role === 'institution_admin' AND same institution
    everyone else (students, parents, teachers with no institution) = 403 + "not available" screen
  Admins can view the bank, roster and any teacher's profile in their institution
  but cannot take the test.
- Visual language must match the existing Thisai Platform (Career Universe light
  theme): tokens, sticky blurred header, pill tabs, 16–18px radius cards,
  Outfit headings / Nunito Sans body. See "Design system" in docs/teacher-assessment.md.
- The prototype (Teacher Assessment Module.html + teacher-*.js/jsx/css) is the
  reference for layout, copy and behaviour. Port it; do not redesign it.

REQUIREMENTS
1. Routes
   /teacher-assessment                → landing (teacher)
   /teacher-assessment/run/:index     → runner
   /teacher-assessment/review         → review & submit
   /teacher-assessment/submitted      → confirmation
   /teacher-assessment/profile        → teacher's own report
   /teacher-assessment/admin/bank     → question bank (admin)
   /teacher-assessment/admin/teachers → roster + cohort (admin)
   /teacher-assessment/admin/teachers/:teacherId → teacher report, admin view
   Wrap all in <RequireModuleAccess> guards (teacher | admin). Unauthorised →
   <AccessDenied reason=...> with a link back to thisai.pro.
2. Item bank: 84+ items, JSON, each {item_id, grade_band, dimension, gate_dimension,
   scenario, options[4]{label,text,key_rank,points,rationale}, source_tag}.
   Serve items to the client WITHOUT key_rank / points / rationale. Scoring runs
   on the server only.
3. Runner: one item at a time; rank via drag-and-drop AND tap-card-then-tap-slot
   (keyboard accessible); side rail with elapsed clock (no time limit), item grid
   (current / ranked / unranked / flagged), flag for review, optional one-line
   free-text note (not scored). Autosave every placement (debounced 400ms PUT).
   Resume at first unranked item.
4. Review: list all items with status; submit disabled until every item has all
   4 ranks. Submission is final and locks answers.
5. Scoring, index, bands, insights and path exactly as in the algorithm section.
6. Report: index + band + framing paragraph, 7 dimension rows with band chips,
   equity gate callout when flagged, strengths (≤2), growth (≤2), insights,
   6-week path, matched Thisai programmes. Teacher and admin copy variants.
   Live preview while partially complete (clearly labelled).
7. Admin: bank table with filters (band, dimension), roster with index/band/
   validity flag, cohort averages per dimension, open any teacher's report.
8. Privacy: item-level answers visible only to the teacher and their institution
   admin; never to other teachers. No ranking against colleagues in the teacher view.
9. Responsive to 360px; hit targets ≥ 44px; WCAG AA contrast.

OUTPUT
- Feature folder src/features/teacher-assessment/ (structure in the doc).
- Backend endpoints + DB migrations (schema in the doc).
- Unit tests for scoreItem, buildProfile, indexFor, strengths/growth, pathFor,
  access guard. Snapshot tests for the report in teacher and admin mode.
- A short README in the feature folder listing endpoints and env flags.
Ask me before changing any shared auth, theme or layout component.
```

---

## Part 2 — Scoring algorithm (exactly as the prototype)

### 2.1 Test assembly
- **Grade bands (6):** Pre-school, Primary (1–5), Middle (6–8), High School (9–10), Higher Secondary (11–12), College/UG.
- **Dimensions (7):** Equity of Treatment *(gate)*, Behavioural De-escalation, Doubt-Resolution & Responsiveness, Instructional Adaptability, Decision-Making Under Ambiguity, Critical Thinking / Root-Cause Diagnosis, Leadership & Influence Style.
- **Items per band:** 5 per dimension = 35.
- **Order:** round-robin across dimensions so no two consecutive items share a dimension.
  ```
  cells[d] = bank.filter(band == B && dimension == d)       // for each of 7 dims
  for r in 0..maxDepth: for d in dims: if cells[d][r] push
  ```
- **Option order:** deterministic shuffle seeded by `item_id + "#opts"` (FNV-1a hash → mulberry32 PRNG → Fisher–Yates). Guard: if the shuffle puts key-rank 1 first **and** key-rank 4 last, swap positions 0 and 2 so the key order never shows up by accident. Same order on every visit.

### 2.2 Item score (0–3)
The teacher's ranking is compared to the keyed ranking by **total rank displacement**:
```
dev = Σ over the 4 options |key_rank(option) − placed_position(option)|     // 0 … 8
item_score = round2( 3 × (1 − dev / 8) )
```
- Perfect order → dev 0 → **3.00**. Fully reversed → dev 8 → **0.00**.
- An item with fewer than 4 placed options is **null** (not scored).

### 2.3 Dimension score and band
```
dim_score = mean(item_score of scored items in that dimension)       // 0–3, 2 dp
band = strong      if dim_score ≥ 2.3
       consistent  if dim_score ≥ 1.3
       developing  otherwise
```
| Band | Range | Meaning |
|---|---|---|
| Strong | 2.3 – 3.0 | A visible strength to build on |
| Consistent | 1.3 – 2.2 | Dependable in most situations |
| Developing | 0 – 1.2 | An area with room to grow |

### 2.4 Equity gate
`equity_gate_flag = equity.items_scored > 0 AND equity.band == 'developing'`
When true, the report shows a separate priority callout above everything else. Equity describes *who* receives the teaching, not *how* it is taught, so it is never averaged away.

### 2.5 Teaching Practice Index (0–100)
```
mean  = average of scored dim_scores
index = round( mean / 3 × 100 )
index band: ≥ 77 Strong practice · ≥ 43 Consistent practice · else Developing practice
```
77 and 43 are 2.3/3 and 1.3/3, so the headline band can never disagree with the dimension rows beneath it.

### 2.6 Strengths & growth (disjoint by construction)
```
ranked = scored dimensions sorted by dim_score desc
k = min(2, floor(len(ranked) / 2))
strengths = ranked[0 : k]
growth    = ranked[len-k : len] reversed        // weakest first
```
With fewer than 4 dimensions scored, each list shrinks so they never overlap.

### 2.7 Coaching note per dimension (from the teacher's own choices)
Take the lowest-scoring item in the dimension, then:
1. The teacher's #1 = key #1 **and** the teacher's #4 = key #4 → "strongest and weakest placed correctly; only the middle two differed."
2. The teacher's #1 = key #1 only → "right instinct, but ranked '<chosen last>' below '<key worst>' — the reading of harm is less sharp."
3. Otherwise → "In the <scenario context> scenario you ranked '<chosen first>' first; the framework places '<key best>' first — <rationale>."
Option texts are trimmed to 96 characters.

### 2.8 Insights (up to 4, from the profile's shape)
- Fewer than 2 dimensions scored → one "not enough data yet" insight only.
- ▲ Sharpest dimension, with its score.
- ▼ Widest gap, with its score.
- ≈ Spread = best − worst. **≥ 1.2** → "uneven profile: one narrow intervention"; otherwise → "even profile: raise the ceiling on a strength."
- Equity: gate flagged → "!" callout; ≥ 2 equity items clear → "✓ applied the same process and tone regardless of reputation"; exactly 1 → provisional ✓.
- Every string has a teacher variant ("Your…") and an admin variant ("This teacher's…").

### 2.9 Six-week development path
Built from growth[0] (A), growth[1] (B) and strengths[0] (S):
| When | Step |
|---|---|
| Weeks 1–2 | Programme for A |
| Week 3 | Peer observation on A only · 20-min debrief · not used for appraisal |
| Weeks 4–5 | Programme for B |
| Week 6 | Retake on the same band; compare per dimension, not the index |
| Ongoing | Mentor a colleague in S (academic heads pair complementary profiles) |

Programme catalogue (one per dimension): Attention Audit · Low-Voice De-escalation · The Second Explanation · Mid-Lesson Checkpoints · Deciding With Incomplete Facts · Evidence Before Action · Influence Without Authority.

### 2.10 Cohort benchmark (admin only)
Per dimension: mean of every scored teacher's `dim_score` in the institution, plus N. Show it only when N ≥ 5, so no individual can be identified.

### 2.11 Validity flag *(to implement on the backend)*
In the prototype this is a placeholder. Suggested rules, any one sets `validity_flag = true`:
- Median time per item < 8 s.
- Same option label in the same rank on ≥ 80% of items (position bias).
- ≥ 30 of 35 items in the exact key order (possible key leak).
Flagged profiles are still shown, with a "read with caution" banner for the admin.

---

## Part 3 — Access & login flow

```
thisai.pro session ──► GET /api/me  → {user_id, role, institution_id, name}
                         │
                         ▼
          GET /api/teacher-assessment/access
          → {can_take, can_manage, reason, cycle_id}
                         │
     ┌───────────────────┼───────────────────────┐
 can_take            can_manage                 neither
 → /landing          → /admin/bank              → AccessDenied(reason)
```
- **Reasons:** `NOT_TEACHER` (student or parent) · `NO_INSTITUTION` · `MODULE_DISABLED` · `CYCLE_CLOSED`.
- The prototype's four-step check screen (account → institution → role → module access) maps one-to-one to these fields; show it only while `/access` is loading.
- Every API route re-checks access server-side. The client guard is for UX only.
- Admins who open a teacher route see "Admins manage, teachers take", with a link to the bank.
- Sign-out calls the existing thisai.pro sign-out; the module stores no credentials.

---

## Part 4 — Design system (match the Thisai Platform)

**Tokens** (from `career-universe-light.css` / `teacher-sjt.css`):
```
--bg:#ffffff  --bg-2:#ffffff  --bg-3:#f0f2fa  --bg-4:#e6e9f4
--line:#e2e5f0  --line-2:#c8cde0
--ink:#0f1436  --ink-2:#3b4373  --ink-3:#6b7099  --ink-4:#a4a8c2
--brand:#494f9c  --brand-2:#1a50a0 (logo blue)
--lime:#3fa63a  --amber:#c98a10  --coral:#e53e3e
--developing:#b57c12 / soft #fdf5e5
--consistent:#3f5fae / soft #eef2fc
--strong:#2f8a52 / soft #edf7f0
--shadow-1:0 1px 3px rgba(15,20,54,.05)
--shadow-2:0 10px 30px rgba(15,20,54,.09)
```
**Type:** Outfit 700–800 for headings, labels and numbers (letter-spacing −0.02 to −0.03em). Nunito Sans 400–700 for body. Eyebrows: 9.5–10.5px, uppercase, letter-spacing .14–.18em, weight 800, brand colour.

**Components and rules**
- **Header:** sticky, `rgba(255,255,255,.88)` with 14px blur, 1px bottom line. Contents: logo PNG (`THISAI FINAL BLUE-8.png`, 28–30px high) · divider · mode label · pill tabs centred in a `--bg-3` track (active tab is white with a soft brand shadow) · name, institution, avatar with a role badge (ADM / TCH / STU / IND).
- **Cards:** white, 1px `--line`, radius 15–18px, `--shadow-1`. The primary card gets a 3px brand top border. Accent cards get a 3px left border via `--ac`.
- **Buttons:** primary uses a vertical brand → brand-2 gradient with a 6/18 brand shadow. Ghost is white with a `--line-2` border. Radius 11px, minimum height 44px.
- **Landing is an app page, not a document:** a two-column top (hero with 3 fact tiles, plus a progress-ring card with Start/Resume and a privacy note) · journey strip · band radio tiles · dimension cards · "Good to know" cards · rules folded into a `<details>` · fixed bottom start bar.
- **Runner:** 3-column shell (rail · scenario + ranking). Scenario card has 20px radius and 20px text. Four rank slots labelled "Closest to what I'd do → Least like me". The dashed drop zone becomes solid brand when armed.
- **Band chips** always use the three semantic colours; never use red for "developing". It is growth, not failure.
- **Copy tone:** plain and second person. Never say "exam", "score" or "fail" to a teacher; use "profile", "practice" and "development".
- **Responsive:** tabs move to a second header row under 980px, grids collapse to one column, the bottom bar's buttons go full width.

---

## Part 5 — Architecture suggestions

### 5.1 Frontend (thisai_fe)
```
src/features/teacher-assessment/
  api/            client.ts (fetch wrappers) · queries.ts (React Query hooks)
  guards/         RequireModuleAccess.tsx · AccessDenied.tsx
  model/          types.ts · bands.ts · copy.ts (teacher/admin strings)
  components/
    shell/        ModuleHeader · ProgressRing · JourneyStrip
    runner/       RankableOptionList · RankSlot · Rail · Clock · FlagButton · NoteField
    report/       IndexHero · DimensionRow · EquityGate · StrengthsGrowth · Insights · PathTimeline · ProgrammeCards
    admin/        BankTable · RosterTable · CohortChart
  pages/          Landing · Runner · Review · Submitted · Profile · AdminBank · AdminTeachers · AdminTeacherDetail
  routes.tsx
```
- **State:** React Query for server state; a small Zustand (or context) store for runner UI only (picked card, open note). Answers are optimistic: update locally, then PUT.
- **Drag and drop:** `@dnd-kit/core` with sortable keyboard support. Keep tap-to-place as the mobile default.
- **Report rendering:** a pure `buildReportView(profile, role)` produces display data; components just render it. The same view model feeds the PDF.
- **PDF:** reuse the report pagination and print CSS already built for the career report (`CareerCounsellorSection`), or render with the existing server-side PDF service.

### 5.2 Backend
**Tables**
```
ta_items(item_id PK, grade_band, dimension, gate bool, scenario, source_tag, version, active)
ta_options(item_id FK, label, text, key_rank, points, rationale)          -- never sent to client
ta_cycles(cycle_id PK, institution_id, name, opens_at, closes_at, enabled bool)
ta_attempts(attempt_id PK, teacher_id, institution_id, cycle_id, grade_band,
            started_at, submitted_at NULL, status: in_progress|submitted, item_order jsonb)
ta_answers(attempt_id FK, item_id, ranked text[4], note text, flagged bool,
           updated_at, ms_on_item int)
ta_profiles(attempt_id PK, index int, index_band, dims jsonb, equity_gate bool,
            validity_flag bool, insights jsonb, path jsonb, scoring_version)
```
**Endpoints**
```
GET  /api/teacher-assessment/access
POST /api/teacher-assessment/attempts                 {grade_band} → attempt + item list (no keys)
GET  /api/teacher-assessment/attempts/current
PUT  /api/teacher-assessment/attempts/:id/answers/:itemId   {ranked, note, flagged, ms}
POST /api/teacher-assessment/attempts/:id/submit      → scores and stores the profile, locks the attempt
GET  /api/teacher-assessment/profile/me
GET  /api/teacher-assessment/preview                  (partial live profile, not stored)
GET  /api/teacher-assessment/admin/items?band&dimension
GET  /api/teacher-assessment/admin/teachers           roster + index + flags
GET  /api/teacher-assessment/admin/teachers/:id/profile
GET  /api/teacher-assessment/admin/cohort             averages (N ≥ 5)
```
- **Scoring service:** a pure module (`scoring/v1.ts`) containing exactly the functions in Part 2, unit-tested with fixed fixtures. Store `scoring_version` on each profile so a later re-key or re-weight never silently changes old reports.
- **Security:** keys stay server-side; all queries are scoped by `institution_id` (row-level security or a query guard); audit-log admin views of individual profiles.
- **Retakes:** a new attempt per cycle. The Week-6 retake compares per dimension against the previous submitted attempt on the same band.

### 5.3 Improvements worth considering
1. **Weighted displacement.** Errors at the extremes (confusing the best and worst response) are more serious than swapping the middle two. Option: `dev = Σ w(pos)·|Δ|` with w = [1.5, 1, 1, 1.5], normalised by the new maximum.
2. **Item analytics.** Track the item-level mean and discrimination (correlation with the dimension total) so weak items can be retired from the bank.
3. **Band-specific norms.** Once each band has 50+ teachers per institution cluster, show percentile bands alongside the absolute ones (admin only).
4. **Note field → validity signal.** Optionally run the free-text line through Claude to check it agrees with the #1 ranked option. Never score it.
5. **Accessibility:** announce drops with `aria-live`; offer a pure keyboard path (↑/↓ to choose a card, 1–4 to place it).
6. **Offline tolerance:** queue answer PUTs in IndexedDB for low-bandwidth Tier-2/3 schools; sync on reconnect.

---

## Part 6 — Test fixtures (use these in the unit tests)

| Placed order vs key | dev | item score |
|---|---|---|
| 1 2 3 4 | 0 | 3.00 |
| 2 1 3 4 | 2 | 2.25 |
| 1 2 4 3 | 2 | 2.25 |
| 1 3 2 4 | 2 | 2.25 |
| 2 1 4 3 | 4 | 1.50 |
| 4 2 3 1 | 6 | 0.75 |
| 4 3 2 1 | 8 | 0.00 |

- **Index check:** dimension means [2.8, 2.4, 2.0, 1.9, 1.6, 1.2, 2.5] → mean 2.057 → index **69** → *Consistent practice*. Strengths: the 2.8 and 2.5 dimensions. Growth: 1.2, then 1.6. Spread 1.6 ≥ 1.2 → uneven-profile insight.
- **Gate check:** equity mean 1.2 → developing → `equity_gate_flag = true`, whatever the index.
