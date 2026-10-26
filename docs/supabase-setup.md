# Supabase demo setup

The existing Vercel project can host both the Vite frontend and the Express API
(`apps/web/api/index.ts`). Supabase supplies Auth and Postgres. Teachers sign
in with email/password and see their own results; an institution admin sees the
school's submitted reports. There is no public registration form.

## 1. Environment variables

The app also reads a **repository-root `.env`**, including the names exported by
Vercel's Supabase integration: `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`) and `POSTGRES_URL`.
The frontend maps only the public URL/key to Vite; database credentials and
secret keys remain server-side. Complete Supabase URL/key configuration selects
Supabase mode automatically. Explicit `VITE_TA_MODE` / `TA_AUTH_MODE` values take
precedence. You can keep your existing integration variable names.

Add these in **Vercel → Project → Settings → Environment Variables** for each
deployment environment you intend to use:

| Variable | Value | Used by |
|---|---|---|
| `VITE_TA_MODE` | `supabase` | Browser, at build time |
| `VITE_SUPABASE_URL` | Supabase project URL | Browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key | Browser |
| `TA_AUTH_MODE` | `supabase` | API |
| `SUPABASE_URL` | Same Supabase project URL | API |
| `SUPABASE_PUBLISHABLE_KEY` | Same publishable key | API |
| `DATABASE_URL` | Supabase **Transaction pooler** connection string, with `sslmode=require` | API only |
| `TA_SHUFFLE_SALT` | A random secret, fixed before the first assessment | API only |

Copy the database host, username, password and port from **Supabase → Connect**.
URL-encode special characters in the password. Transaction pooler connections
normally use port 6543. Do not construct the pooler hostname from the region.
The API defaults to one database connection per Vercel function instance and
four for a persistent local API. `TA_DB_POOL_MAX` can override that. Connections
have a 30-second opening timeout (`TA_DB_CONNECT_TIMEOUT_MS`), TCP keepalive, and
idle retention of 60 seconds locally / 5 seconds on Vercel
(`TA_DB_IDLE_TIMEOUT_MS`). This avoids reconnecting to Supabase on every local
page refresh after a short pause.

Legacy projects can use `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` instead
of the publishable-key variables. `POSTGRES_URL` is accepted as a server-side
alias for `DATABASE_URL`. Locally, `POSTGRES_URL_NON_POOLING` (Supabase's session
pooler URL) takes precedence over `POSTGRES_URL` when no explicit `DATABASE_URL`
is supplied. On Vercel, `POSTGRES_URL` (transaction pooler) is used instead.
No Supabase secret/service-role key is needed.

Database connections to Supabase automatically use its bundled public root CA
with certificate and hostname verification enabled. If Supabase rotates its
certificate authority, set `DATABASE_SSL_CA` to the replacement PEM certificate
from Supabase's Database Settings. Literal newlines and escaped `\n` are both
accepted. Certificate errors are not bypassed.

Keep database passwords and `TA_SHUFFLE_SALT` out of all `VITE_*` variables.
Vite exposes those variables to the browser. The publishable key is intended to
be public. Assessment tables are API-only: migration 002 blocks access through
Supabase's browser-facing Data API, including access to answer keys.

For local use, copy the examples (they contain placeholders, not credentials):

```sh
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Fill in both files, or use the repository-root `.env`. Workspace files take
precedence over the root file. Environment variables supplied by the shell or
Vercel take precedence. Local credential files are gitignored.

## 2. Create the tables and load the 210 assessment items

From the repository root:

```sh
npm ci
npm run migrate -w @thisai/ta-api -- --seed-items
```

Run this with a database owner connection. Set `DATABASE_DIRECT_URL` in the API
environment file to use a separate owner connection for migrations; it takes
precedence over `DATABASE_URL` **only for migrations**. A session-pooler owner
connection also works when your network cannot reach Supabase's direct IPv6
endpoint. `POSTGRES_URL_NON_POOLING` is accepted as an alternative migration URL.
Migrations are explicit and do not run on application startup or deployment.

For the demo, the default Supabase `postgres` owner connection works as the API
connection too. The API still checks roles, ownership and institution on every
request. To additionally enforce the existing institution RLS policies for API
queries, use a separate non-owner API role as described in the feature README's
Database section. That role needs SELECT on `ta_items` and `ta_options`; the new
bank policies allow it while denying browser roles. Do not grant this database
role to Supabase's `anon` or `authenticated` roles.

## 3. Add accounts and open a cycle

1. In **Supabase → Authentication → Users**, create an email/password account
   for each teacher and a separate account for yourself as admin. Mark the
   accounts confirmed using the dashboard's Create user flow. This implementation
   uses password login; invitation/magic-link callbacks are not implemented.
2. Disable public sign-ups in Supabase's Auth settings for this demo.
3. Open [supabase-demo.sql](../apps/api/scripts/supabase-demo.sql). Replace the
   sample emails, names and departments, then run it in Supabase's SQL Editor.
   It creates an open 90-day assessment cycle and assigns the accounts to a
   common school. Repeat the teacher UPDATE for every participant.
4. Check the final SELECT results. A missing account means the email did not
   match an Auth user. Keep the institution ID identical for teachers, admin and
   cycle.

Roles and institution IDs are read from **app_metadata**, which users cannot
edit. **user_metadata** is used only for display name/department. Signing in
without a provisioned role/institution does not grant assessment access.
Change role/institution membership through the dashboard SQL or another trusted
admin process. Never authorize a role from a user-editable profile field.

Fixture reports are opt-in. To add the original 11 demo teachers and varied
completed reports to Demo School, run this from the repository root:

```sh
npm run seed:demo -w @thisai/ta-api
```

The command uses `demo-school` / `demo-cycle-1` by default. To target another
existing institution/cycle, pass their IDs after `--`. It reuses the actual bank
and scoring code, creates records in a single transaction and skips teachers
who already have an attempt in the target cycle. Existing assessments are never
overwritten. These are sample roster/report records, not Supabase Auth login
accounts. Refresh the admin Teachers page afterward; with at least five
submitted profiles the cohort chart appears.

For participating users, reports appear after submission. Each teacher gets one attempt per cycle; another test
requires another cycle. The institution admin cannot take an assessment using
the admin account. Cohort averages appear once at least five teachers submit.

## 4. Run locally or redeploy Vercel

For local development, use two terminals from the repository root:

```sh
npm run dev -w @thisai/ta-api
```

```sh
npm run dev -w @thisai/ta-web
```

Open `http://localhost:5173/teacher-assessment`. The Vite proxy forwards `/api`
to port 8787. No dev fixture account switcher appears in Supabase mode.

For Vercel, retain **Root Directory: `apps/web`**, **Framework: Vite**,
**Build command: `npm run build`**, and **Output Directory: `dist`**. Enable
**Include source files outside of the Root Directory in the Build Step** so the
function can use `apps/api` and `packages/ta-shared`. Use a current supported Node
LTS runtime (Node 22 or newer). Redeploy after setting the variables: `VITE_*`
values are embedded during the frontend build. No second API project is needed.
The Vercel routing config resolves `/api/*` as functions before the SPA fallback.
Keep the default npm install command with lifecycle scripts enabled. The root
`postinstall` builds `@thisai/ta-api/runtime` before Vercel packages the function.
The function imports this compiled JavaScript export; importing API TypeScript
source directly leaves extensionless imports that native Node cannot resolve.

After deployment, check `/api/teacher-assessment/healthz`, then sign in as a
teacher and complete an assessment. Sign in as admin to open
`/teacher-assessment/admin/teachers` and inspect that report. Signed-out API
requests return 401; missing server configuration returns 503.

The Supabase SDK refreshes browser sessions. API requests include the access
token, which the server verifies with Supabase Auth on every request. Account
changes reload the app to clear cached reports. Offline answers are scoped to
the teacher and retained if the session expires.

Page loads use a single `/api/teacher-assessment/bootstrap` request. It returns
the verified user, access decision, current attempt/answers and permitted
report/preview together. A warm load uses one batched Postgres exchange. The
server caches only the shared question bank for 60 seconds (one extra query on
a cold/expired bank cache); institution/user data stays request-scoped. Frontend
query caches are hydrated from this response so mounting the assessment or
report does not repeat the same requests.

An active Supabase session also restores the teacher's last page data from a
per-tab `sessionStorage` snapshot (maximum age eight hours). It is matched to the
SDK session's user ID and Supabase project before rendering. A refresh shows
that saved view immediately while bootstrap verifies identity/access in the
background. First-time loads use a neutral page skeleton instead of the
platform integration's access checklist. Sign-out, account changes and rejected
sessions clear the snapshot. Admin reports for other teachers are never
persisted in this cache. Server authorization is still checked on every API
request; cached permissions only control the initial UI. Queued answers and
edits made during verification are preserved when fresh page data arrives.

### Local sign-in troubleshooting

Supabase can accept the email/password even when the local API is stopped.
After authentication, the frontend needs `GET /api/me` on the API. Start both
processes with `npm run dev` from the repository root; running only the web
workspace does not start the API. The default ports are 5173 (web) and 8787 (API).
An Auth user without the administrator-managed role/institution assignment sees
an account-access message. Creating an Auth user alone does not create the
assessment tables, load the bank, assign a role, or open an assessment cycle.

## Existing modes

With no Supabase configuration, the default is still the browser-only MVP. Set
`VITE_TA_MODE=mvp` explicitly to retain it even if Supabase variables exist.
`VITE_TA_MODE=platform` and `TA_AUTH_MODE=thisai` retain the existing thisai.pro
session integration. Supabase configuration never silently falls back to a
guest or in-memory database when required backend variables are missing.

References: [Supabase password login](https://supabase.com/docs/reference/javascript/auth-signinwithpassword),
[database connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Vercel monorepo source files](https://vercel.com/docs/monorepos/monorepo-faq).
