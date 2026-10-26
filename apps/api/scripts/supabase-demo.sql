-- Run AFTER `npm run migrate -w @thisai/ta-api -- --seed-items`.
-- Create each participant in Supabase Dashboard -> Authentication -> Users ->
-- Add user -> Create new user (email/password, confirmed). No email is sent here.
-- Disable public sign-ups in Supabase Auth settings for this invited demo.

-- One institution and one assessment cycle for all demo participants.
INSERT INTO public.ta_cycles (cycle_id, institution_id, name, opens_at, closes_at, enabled)
VALUES ('demo-cycle-1', 'demo-school', 'Teacher Assessment Demo', now() - interval '1 day', now() + interval '90 days', true)
ON CONFLICT (cycle_id) DO NOTHING;

-- Replace these example values. Run this UPDATE once per teacher.
-- app_metadata can only be changed by an administrator; never use user_metadata
-- to assign a role or institution.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
      '{"role":"teacher","institution_id":"demo-school","institution_name":"Demo School"}'::jsonb,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
      '{"name":"Demo Teacher","department":"General"}'::jsonb
WHERE email = 'demo@thisai.pro';

-- Your separate admin account: can view all submitted reports in this school.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) ||
      '{"role":"institution_admin","institution_id":"demo-school","institution_name":"Demo School"}'::jsonb,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
      '{"name":"Demo Administrator"}'::jsonb
WHERE email = 'admin@example.com';

-- Confirm the intended accounts were updated (zero rows means email mismatch).
SELECT id, email, raw_app_meta_data->>'role' AS role,
       raw_app_meta_data->>'institution_id' AS institution
FROM auth.users
WHERE email IN ('demo@thisai.pro', 'admin@example.com');
