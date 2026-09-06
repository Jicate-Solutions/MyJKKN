-- ---------------------------------------------------------------------------
-- Auto-lock every new public relation, however it was created.
--
-- WHY THIS EXISTS AND WHY CI COULD NOT DO IT
-- scripts/ci/check-table-anon-revoke.mjs (shipped 2026-07-27, PR #2488) already
-- requires an explicit anon revoke + ENABLE ROW LEVEL SECURITY for every new
-- relation added IN A MIGRATION. It did not stop the 2026-07-31 leak of
-- `_bak_learner_section_repair_20260731` (179 learners' learner_id / roll_number
-- / section_name, readable with the public anon key) because NO MIGRATION EVER
-- CREATED THAT TABLE. Grepping supabase/migrations/ for the name returns exactly
-- one hit: the migration that LOCKED it. It was created by hand through the
-- Supabase Management API during a live repair, so CI never saw it.
--
-- A CI guard reads the repo. Repairs here are run by hand against prod. Those
-- are disjoint sets, so only the database itself can close the gap.
--
-- WHAT IT DOES
-- On ddl_command_end for CREATE TABLE / CREATE TABLE AS / SELECT INTO /
-- CREATE VIEW / CREATE MATERIALIZED VIEW, for objects in schema `public` only:
--   * REVOKE ALL FROM anon, PUBLIC   (Supabase's ALTER DEFAULT PRIVILEGES grants
--     anon ALL on every new relation; that default cannot be suppressed on
--     hosted Supabase, which is the root cause of this entire class of leak)
--   * ENABLE ROW LEVEL SECURITY on ordinary tables. RLS-with-no-policy is
--     deny-all for ordinary roles; `postgres` and `service_role` carry
--     rolbypassrls, so repair tooling and admin routes still read the table.
--     CREATE TABLE AS never enables RLS by itself — that is the CTAS vector.
--
-- FAIL-OPEN BY DESIGN, DELIBERATELY
-- Every action is wrapped so that a failure RAISEs a WARNING and continues. An
-- event trigger that throws would abort the DDL that fired it, which would break
-- every CREATE TABLE in the cluster — a far worse outcome than one unlocked
-- relation. The CI guard remains the enforcing layer; this is the safety net
-- that also covers hand-run SQL.
--
-- NOT COVERED: an explicit `GRANT ... TO anon` issued AFTER creation. That is a
-- deliberate act, is visible in the migration diff, and is what the anon-exposure
-- allow-list plus scripts/ci/check-anon-exposure-live.mjs exist to review.
-- ---------------------------------------------------------------------------
-- ci:allow-anon-table  see reason below
-- ci:allow-no-rls      see reason below
--
-- BOTH markers, because this guard runs TWO independent checks (anon lock
-- and RLS-enabled) and each has its own hatch. Reason for both:
-- this migration creates NO relations at all — one function
--   and one event trigger. The anon-lock guard reports a phantom table named
--   "AS" because its parser matches the literal string 'CREATE TABLE AS' inside
--   the WHEN TAG IN (...) list below and reads the following token as a table
--   name. Those tag strings are required by CREATE EVENT TRIGGER syntax and
--   cannot be spelled any other way. Verified: `git diff` adds zero CREATE TABLE
--   / CREATE VIEW / CREATE MATERIALIZED VIEW statements. Follow-up worth doing
--   separately: teach scripts/ci/check-table-anon-revoke.mjs to ignore quoted
--   string literals, so a migration that merely NAMES a DDL tag stops tripping
--   a security gate and nobody learns to reach for this hatch by habit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_autolock_new_public_relation()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT objid, object_identity, schema_name, command_tag
    FROM pg_event_trigger_ddl_commands()
    WHERE schema_name = 'public'
      AND command_tag IN (
        'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO',
        'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
  LOOP
    -- 1. Shut the public anon key on every new relation.
    BEGIN
      EXECUTE format('REVOKE ALL ON %s FROM anon, PUBLIC', r.object_identity);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'autolock: could not revoke anon/PUBLIC on % (%)',
        r.object_identity, SQLERRM;
    END;

    -- 2. Enable RLS on ordinary tables only. Views and matviews cannot carry it
    --    (for a matview RLS can never apply at all, which is why a matview that
    --    keeps an anon grant is the most dangerous shape in this schema).
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.oid = r.objid AND n.nspname = 'public'
          AND c.relkind = 'r' AND NOT c.relrowsecurity
      ) THEN
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', r.object_identity);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'autolock: could not enable RLS on % (%)',
        r.object_identity, SQLERRM;
    END;
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  -- Belt and braces: nothing in here may ever abort the user's DDL.
  RAISE WARNING 'autolock: event trigger failed entirely (%)', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_autolock_new_public_relation() FROM anon, PUBLIC;

DROP EVENT TRIGGER IF EXISTS trg_autolock_new_public_relation;

CREATE EVENT TRIGGER trg_autolock_new_public_relation
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO',
               'CREATE VIEW', 'CREATE MATERIALIZED VIEW')
  EXECUTE FUNCTION public.fn_autolock_new_public_relation();

COMMENT ON FUNCTION public.fn_autolock_new_public_relation() IS
  'Revokes anon/PUBLIC and enables RLS on every new public relation, whatever '
  'created it — migration, hand-run Management-API SQL, or CTAS. Fail-open: '
  'warns and continues, never aborts the triggering DDL. Closes the vector CI '
  'cannot see (2026-07-31 _bak_ leak, 179 learners).';
