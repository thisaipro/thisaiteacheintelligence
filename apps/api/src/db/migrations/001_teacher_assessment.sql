-- Teacher Intelligence · Assessment — initial schema.
-- Keys (ta_options.key_rank / points / rationale) never leave the server.

CREATE TABLE IF NOT EXISTS ta_items (
  item_id      text PRIMARY KEY,
  grade_band   text    NOT NULL,
  dimension    text    NOT NULL,
  gate         boolean NOT NULL DEFAULT false,
  scenario     text    NOT NULL,
  source_tag   text    NOT NULL DEFAULT '',
  version      integer NOT NULL DEFAULT 1,
  active       boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS ta_items_band_dim ON ta_items (grade_band, dimension) WHERE active;

CREATE TABLE IF NOT EXISTS ta_options (
  item_id    text     NOT NULL REFERENCES ta_items(item_id) ON DELETE CASCADE,
  label      char(1)  NOT NULL CHECK (label IN ('A','B','C','D')),
  text       text     NOT NULL,
  key_rank   smallint NOT NULL CHECK (key_rank BETWEEN 1 AND 4),
  points     smallint NOT NULL CHECK (points BETWEEN 0 AND 3),
  rationale  text     NOT NULL DEFAULT '',
  PRIMARY KEY (item_id, label),
  UNIQUE (item_id, key_rank)
);

CREATE TABLE IF NOT EXISTS ta_cycles (
  cycle_id        text PRIMARY KEY,
  institution_id  text        NOT NULL,
  name            text        NOT NULL,
  opens_at        timestamptz NOT NULL,
  closes_at       timestamptz NOT NULL,
  enabled         boolean     NOT NULL DEFAULT true,
  CHECK (closes_at > opens_at)
);
CREATE INDEX IF NOT EXISTS ta_cycles_inst ON ta_cycles (institution_id);

CREATE TABLE IF NOT EXISTS ta_attempts (
  attempt_id      text PRIMARY KEY,
  teacher_id      text        NOT NULL,
  institution_id  text        NOT NULL,
  cycle_id        text        NOT NULL REFERENCES ta_cycles(cycle_id),
  grade_band      text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  submitted_at    timestamptz,
  status          text        NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','submitted')),
  item_order      jsonb       NOT NULL,
  -- Display snapshot from GET /api/me at attempt creation; the module owns no user records.
  teacher_name    text        NOT NULL DEFAULT '',
  department      text
);
-- One attempt per teacher per cycle; a retake happens in the next cycle.
CREATE UNIQUE INDEX IF NOT EXISTS ta_attempts_one_per_cycle ON ta_attempts (teacher_id, cycle_id);
CREATE INDEX IF NOT EXISTS ta_attempts_inst ON ta_attempts (institution_id, status);

CREATE TABLE IF NOT EXISTS ta_answers (
  attempt_id  text        NOT NULL REFERENCES ta_attempts(attempt_id) ON DELETE CASCADE,
  item_id     text        NOT NULL REFERENCES ta_items(item_id),
  ranked      text[]      NOT NULL CHECK (cardinality(ranked) = 4),
  note        text        NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  flagged     boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  ms_on_item  integer     NOT NULL DEFAULT 0 CHECK (ms_on_item >= 0),
  PRIMARY KEY (attempt_id, item_id)
);

CREATE TABLE IF NOT EXISTS ta_profiles (
  attempt_id        text PRIMARY KEY REFERENCES ta_attempts(attempt_id) ON DELETE CASCADE,
  index             integer,
  index_band        text,
  dims              jsonb   NOT NULL,
  equity_gate       boolean NOT NULL,
  validity_flag     boolean NOT NULL DEFAULT false,
  validity_reasons  jsonb   NOT NULL DEFAULT '[]'::jsonb,
  insights          jsonb   NOT NULL,   -- { teacher: Insight[], admin: Insight[] }
  path              jsonb   NOT NULL,   -- { teacher: PathStep[], admin: PathStep[] }
  strengths         jsonb   NOT NULL DEFAULT '[]'::jsonb,
  growth            jsonb   NOT NULL DEFAULT '[]'::jsonb,
  scoring_version   text    NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Admin views of an individual teacher's profile are audit-logged.
CREATE TABLE IF NOT EXISTS ta_audit_log (
  id                bigserial PRIMARY KEY,
  actor_id          text        NOT NULL,
  institution_id    text        NOT NULL,
  action            text        NOT NULL,
  target_teacher_id text,
  attempt_id        text,
  at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ta_audit_inst ON ta_audit_log (institution_id, at DESC);

-- Row-level security: the API sets `app.institution_id` per request
-- (SET LOCAL) so every institution-scoped table is filtered even if a
-- query forgets its WHERE clause. Items/options are global content.
ALTER TABLE ta_cycles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_answers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ta_cycles_inst ON ta_cycles;
CREATE POLICY ta_cycles_inst ON ta_cycles
  USING (institution_id = current_setting('app.institution_id', true));
DROP POLICY IF EXISTS ta_attempts_inst ON ta_attempts;
CREATE POLICY ta_attempts_inst ON ta_attempts
  USING (institution_id = current_setting('app.institution_id', true));
DROP POLICY IF EXISTS ta_answers_inst ON ta_answers;
CREATE POLICY ta_answers_inst ON ta_answers
  USING (EXISTS (SELECT 1 FROM ta_attempts a WHERE a.attempt_id = ta_answers.attempt_id
                 AND a.institution_id = current_setting('app.institution_id', true)));
DROP POLICY IF EXISTS ta_profiles_inst ON ta_profiles;
CREATE POLICY ta_profiles_inst ON ta_profiles
  USING (EXISTS (SELECT 1 FROM ta_attempts a WHERE a.attempt_id = ta_profiles.attempt_id
                 AND a.institution_id = current_setting('app.institution_id', true)));
DROP POLICY IF EXISTS ta_audit_inst ON ta_audit_log;
CREATE POLICY ta_audit_inst ON ta_audit_log
  USING (institution_id = current_setting('app.institution_id', true));
