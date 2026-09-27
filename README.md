# Thisai · Teacher Intelligence

This repository holds the Teacher Assessment module, a situational-judgement assessment for institutional teachers.

| Path | What |
|---|---|
| `apps/web/src/features/teacher-assessment/` | The feature folder that mounts into thisai_fe. See its [README](apps/web/src/features/teacher-assessment/README.md) for routes, endpoints and env flags |
| `apps/web/src/platform/` | The seam to the host platform (thisai.pro session, sign-out) and a dev-only account switcher |
| `apps/api/` | Express API, pure scoring (`src/scoring/v1.ts`), Postgres migrations, item bank (`data/item-bank.v1.json`, 210 items) |
| `packages/ta-shared/` | Dimension/programme catalogue and API contracts shared by web and api |
| `docs/teacher-assessment.md` | The build spec |

## MVP mode (current default)

The web app builds with **no sign-in**. It runs the backend inside the browser and saves data on the device, so it deploys as a plain static site on Vercel (`apps/web`, with SPA rewrites in `apps/web/vercel.json`). Set `VITE_TA_MODE=platform` to switch back to thisai.pro sign-in and the HTTP API. See the feature README for details.

## Run locally

```
npm install
npm run dev -w @thisai/ta-web                            # MVP: :5173 → /teacher-assessment, no API needed

npm run dev -w @thisai/ta-api                            # platform mode: API on :8787 (dev accounts, demo roster)
VITE_TA_MODE=platform npm run dev -w @thisai/ta-web
npm test
```

In platform-mode dev, a bar at the top switches between fixture accounts: teacher, admin, student, no institution, module off, cycle closed, and signed out.
