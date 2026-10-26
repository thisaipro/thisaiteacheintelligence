-- All assessment access goes through the Express API, including global bank keys.
-- Supabase's Data API must not expose these tables through browser credentials.
ALTER TABLE ta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE ta_schema_migrations ENABLE ROW LEVEL SECURITY;

-- The API's non-owner Postgres role can read the global bank. Browser roles
-- have neither grants nor a matching policy.
CREATE POLICY ta_items_backend_read ON ta_items FOR SELECT
  USING (current_user NOT IN ('anon', 'authenticated'));
CREATE POLICY ta_options_backend_read ON ta_options FOR SELECT
  USING (current_user NOT IN ('anon', 'authenticated'));

REVOKE ALL ON TABLE ta_items, ta_options, ta_cycles, ta_attempts, ta_answers, ta_profiles, ta_audit_log, ta_schema_migrations FROM PUBLIC;
REVOKE ALL ON SEQUENCE ta_audit_log_id_seq FROM PUBLIC;

DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE ta_items, ta_options, ta_cycles, ta_attempts, ta_answers, ta_profiles, ta_audit_log, ta_schema_migrations FROM %I', client_role);
      EXECUTE format('REVOKE ALL ON SEQUENCE ta_audit_log_id_seq FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
