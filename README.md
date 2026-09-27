# Thisai · Teacher Intelligence

This repository holds the Teacher Assessment module, a situational-judgement assessment for institutional teachers.

| Path | What |
|---|---|
| `apps/web/src/features/teacher-assessment/` | The feature folder that mounts into thisai_fe. See its [README](apps/web/src/features/teacher-assessment/README.md) for routes, endpoints and env flags |
| `apps/web/src/platform/` | The seam to the host platform (thisai.pro session, sign-out) and a dev-only account switcher |
| `apps/api/` | Express API, pure scoring (`src/scoring/v1.ts`), Postgres migrations, item bank (`data/item-bank.v1.json`, 210 items) |
| `packages/ta-shared/` | Dimension/programme catalogue and API contracts shared by web and api |
| `docs/teacher-assessment.md` | The build spec |

## Run locally

```
npm install
npm run dev -w @thisai/ta-api    # :8787, in-memory store, dev accounts, demo roster
npm run dev -w @thisai/ta-web    # :5173 → /teacher-assessment
npm test
```

In dev, a bar at the top switches between fixture accounts: teacher, admin, student, no institution, module off, cycle closed, and signed out.
