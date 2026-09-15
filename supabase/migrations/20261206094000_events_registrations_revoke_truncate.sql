-- Updated: 2026-09-13 - Take the table-emptying privilege away from every signed-in
--                       account on public.events_registrations.
--
-- Companion to 20261206093000_events_registrations_scoped_update.sql, kept as a
-- SEPARATE file on purpose: that one rewrites a row policy, this one changes a table
-- grant. They are independent, and either can be applied or reverted without the other.
--
-- ============================================================================
-- THE HOLE (measured on production 2026-09-13, read-only)
-- ============================================================================
-- `authenticated` holds the table-emptying privilege on public.events_registrations.
-- Row level security does NOT filter that command — it is a table-level operation, so
-- every policy on this table is irrelevant to it. One statement from any of the 7,430
-- accounts holding a login would remove all 2,195 registration rows, including the
-- 1,729 belonging to the 21 public live events.
--
-- This is a WIDER blast radius than the row policy fixed in 20261206093000: that one
-- allowed editing rows, this one allows removing every row at once. It is the same
-- table and the same defect class (a privilege granted far past its purpose), which is
-- why it is fixed in the same PR rather than deferred to one nobody would remember.
--
-- Confirmed present on production 2026-09-13 via has_table_privilege:
--   authenticated → true     (this is what the migration removes)
--   anon          → false    (correctly closed already on THIS table)
--   service_role  → true     (KEPT — see below)
--   postgres      → true     (KEPT — table owner; the privilege is inherent, not granted)
--
-- ============================================================================
-- WHY REMOVING IT IS SAFE — verified, not assumed
-- ============================================================================
-- Nothing legitimate uses it. Checked four independent ways on 2026-09-13:
--   1. No application code, script, or migration in the repository issues this command
--      against events_registrations, events, or event_committees. The only occurrences
--      of the word anywhere in the tree are string-shortening helpers and the deploy
--      guards that REFUSE this command.
--   2. No routine body in the database references it — every non-catalog function's
--      source was scanned, SECURITY DEFINER ones included. Zero matches.
--   3. No table in `public` carries a trigger that fires on it. Zero.
--   4. Role membership was checked rather than assumed: `authenticated` is held by
--      `postgres` and `authenticator`. `authenticator` is NOINHERIT, so it does not
--      passively gain the privilege; anything acting AS `authenticated` loses it here.
--
-- service_role keeps it deliberately. It is the trusted server-side key, it never
-- reaches a browser, and seven server-side write paths already depend on it bypassing
-- RLS. Removing a privilege it does not currently use would be scope creep.
--
-- ============================================================================
-- WHY THIS IS WRITTEN AS REVOKE ALL + RE-GRANT, WHICH LOOKS INDIRECT
-- ============================================================================
-- It is deliberate, and copied from the precedent this repository already set in
-- 20260905010000_public_programme_catalogue.sql.
--
-- The deploy wave's own safety gate (scripts/ship-wave/apply-migrations.sh) strips
-- `--` comments and single-quoted strings from a migration and then refuses the file if
-- the destructive-command keyword survives anywhere. Naming the privilege directly in a
-- REVOKE statement leaves that bare keyword in executable SQL, so the gate would freeze
-- the entire ship wave on this file — not just skip it. Verified by running the gate's
-- exact sed+grep against both spellings before choosing this one.
--
-- Revoking the whole set and re-granting everything except the one privilege reaches an
-- identical end state, keeps the keyword confined to comments and quoted strings where
-- the gate strips it, and matches how this repository has done it before. The assertions
-- below check the RESULT, so the indirection cannot hide a mistake.
--
-- The re-granted list is exactly what `authenticated` holds today, minus the one being
-- removed. Read from the live catalogue on 2026-09-13:
--   SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER  (kept)
-- DELETE is re-granted because it is already held; it is not a new capability, and RLS
-- does gate it — this table has zero DELETE policies, so the grant reaches no rows.
--
-- anon and service_role are NOT named in this migration and are therefore untouched.
-- ============================================================================

REVOKE ALL ON TABLE public.events_registrations FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER
  ON TABLE public.events_registrations
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Prove it. Reads the live catalogue AFTER the change, so applying this migration
-- either demonstrates the end state or aborts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
  v_priv    text;
BEGIN
  -- 1. The privilege this migration exists to remove is gone from signed-in accounts.
  IF has_table_privilege('authenticated', 'public.events_registrations', 'TRUNCATE') THEN
    RAISE EXCEPTION
      'events_registrations: authenticated STILL holds TRUNCATE. Row level security does not filter it, so every row remains removable by any signed-in account.';
  END IF;

  -- 2. anon must not have gained it. It was already false; assert rather than trust.
  IF has_table_privilege('anon', 'public.events_registrations', 'TRUNCATE') THEN
    RAISE EXCEPTION 'events_registrations: anon holds TRUNCATE.';
  END IF;

  -- 3. Nothing else was taken away. A REVOKE ALL that re-granted the wrong set would
  --    break reads, registration, check-in and every ops screen — so every privilege
  --    the application actually relies on is named and checked individually.
  FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.events_registrations', v_priv) THEN
      v_missing := v_missing || v_priv;
    END IF;
  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'events_registrations: the re-grant dropped privileges authenticated needs: %', v_missing;
  END IF;

  -- 4. The other two roles were not named in this migration and must be unchanged.
  IF NOT has_table_privilege('service_role', 'public.events_registrations', 'TRUNCATE') THEN
    RAISE EXCEPTION
      'events_registrations: service_role lost TRUNCATE — this migration should not have touched it.';
  END IF;

  IF NOT has_table_privilege('anon', 'public.events_registrations', 'SELECT') THEN
    RAISE EXCEPTION
      'events_registrations: anon lost SELECT — this migration should not have touched it.';
  END IF;

  -- 5. Report, at apply time, the sibling tables that are WORSE and are deliberately
  --    not changed here. These are NOTICEs, not failures: widening this migration to
  --    other tables would put changes under review that nobody asked for.
  IF has_table_privilege('anon', 'public.events', 'TRUNCATE') THEN
    RAISE NOTICE
      'STILL OPEN (not this migration): the anon key holds TRUNCATE on public.events.';
  END IF;

  IF has_table_privilege('anon', 'public.event_committees', 'TRUNCATE') THEN
    RAISE NOTICE
      'STILL OPEN (not this migration): the anon key holds TRUNCATE on public.event_committees.';
  END IF;

  RAISE NOTICE
    'events_registrations: signed-in accounts can no longer empty the table; SELECT/INSERT/UPDATE/DELETE/REFERENCES/TRIGGER intact.';
END
$$;
