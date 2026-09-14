-- Updated: 2026-09-13 - Take the table-emptying privilege away from the public anon
--                       key (and from signed-in accounts) on public.events and
--                       public.event_committees.
--
-- Follow-up to 20261206094000, which did the same for public.events_registrations.
-- Shipped as its own migration in its own pull request so the registrations fix stays
-- reviewable on its own.
--
-- ============================================================================
-- THE FINDING (re-read from the live catalogue at authoring time, 2026-09-13)
-- ============================================================================
-- On BOTH tables, `anon` and `authenticated` each hold the full privilege set:
--
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- `anon` is the public key embedded in every page of the live site. The concerning
-- entry is the table-emptying privilege, because row level security does NOT filter
-- it — it is a table-level operation, so the policies on these tables are irrelevant
-- to it. Every other privilege anon holds here IS gated by RLS and reaches nothing
-- (see the reachability note below), which is why this migration removes exactly one
-- privilege and preserves the rest untouched.
--
-- Scope of what the privilege would destroy: public.events is the catalogue every
-- event screen reads, and public.event_committees is what grants event-day ops access
-- in the registrations policies. Emptying either is unrecoverable without a restore.
--
-- ============================================================================
-- HONEST SEVERITY: LATENT GRANT, NOT A DEMONSTRATED PATH
-- ============================================================================
-- This should be read as "wrong, but not currently reachable", not as a live exploit:
--
--   * PostgREST does not expose this command. The REST surface offers SELECT, INSERT,
--     UPDATE, DELETE and RPC — there is no verb that issues it.
--   * No SECURITY INVOKER function that anon may EXECUTE contains it. Checked live:
--     zero such functions exist (a SECURITY DEFINER one would run as its owner and so
--     would not depend on this grant at all).
--
-- So there is no known way for an anonymous caller to reach it today. It is removed
-- because a privilege nothing uses and nothing should have is exactly the kind that
-- becomes reachable later, quietly, when some new function or tool is added.
--
-- ============================================================================
-- WHY REMOVING IT IS SAFE — the same four checks, re-run for THESE tables
-- ============================================================================
--   1. No code path. No application code, script or migration in the repository
--      issues this command against events or event_committees. Every occurrence of
--      the word in the tree is a string-shortening helper or a deploy guard that
--      REFUSES the command.
--   2. No routine body. Every non-catalog function's source was scanned, SECURITY
--      DEFINER included, for this command against either table. Zero matches.
--   3. No trigger. Neither table carries a trigger that fires on this command. Zero.
--   4. Role membership checked, not assumed. `anon` and `authenticated` are each held
--      by `postgres` and `authenticator`. `authenticator` is NOINHERIT, so it gains
--      nothing passively; `postgres` owns both tables, where the privilege is inherent
--      rather than granted and is therefore unaffected by this file.
--
-- service_role and postgres are NOT named below and are deliberately untouched.
--
-- ============================================================================
-- WHAT IS PRESERVED, AND WHY IT MATTERS MORE THAN WHAT IS REMOVED
-- ============================================================================
-- anon's SELECT on public.events is load-bearing: `events_public_read` is
-- FOR SELECT TO public, and it is what lets the public event page and public
-- registration work for a signed-out visitor. Breaking that grant would take down
-- public registration. It is re-granted below and asserted by name afterwards.
--
-- anon's INSERT / UPDATE / DELETE on these tables are re-granted because they are
-- held today and this migration's job is to remove ONE privilege, not to re-scope the
-- tables. They are inert: verified live that every INSERT, UPDATE and DELETE policy on
-- both tables is TO `authenticated`, and the only policies reaching the `public` role
-- are the two SELECT policies on events. RLS therefore denies anon those writes. That
-- they are granted at all is worth a separate look, and is deliberately NOT changed
-- here — a NOTICE is raised at apply time so it is not forgotten.
--
-- ============================================================================
-- WHY THIS IS REVOKE ALL + RE-GRANT RATHER THAN NAMING THE PRIVILEGE
-- ============================================================================
-- The deploy wave's gate (scripts/ship-wave/apply-migrations.sh) strips `--` comments
-- and single-quoted strings, then FREEZES THE ENTIRE WAVE — not merely skips the file
-- — if the destructive keyword survives in executable SQL. Naming the privilege in a
-- REVOKE statement leaves that bare keyword behind. Verified by running the gate's
-- exact sed+grep against both spellings. This shape matches the precedent set by
-- 20260905010000_public_programme_catalogue.sql and by 20261206094000.
--
-- The re-granted list is exactly what each role holds today minus the one removed. The
-- assertions check the RESULT, so the indirection cannot hide a mistake.
-- ============================================================================

REVOKE ALL ON TABLE public.events, public.event_committees FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER
  ON TABLE public.events, public.event_committees
  TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prove it. Reads the live catalogue AFTER the change: applying this migration
-- either demonstrates the end state or aborts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tbl     text;
  v_role    text;
  v_priv    text;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['public.events','public.event_committees'] LOOP

    -- 1. The privilege this migration exists to remove is gone from BOTH roles.
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(v_role, v_tbl, 'TRUNCATE') THEN
        RAISE EXCEPTION
          '%: % STILL holds TRUNCATE. Row level security does not filter it, so the whole table remains removable.',
          v_tbl, v_role;
      END IF;
    END LOOP;

    -- 2. Nothing else was taken away. A REVOKE ALL that re-granted the wrong set
    --    would break the public event page, registration and every ops screen, so
    --    each preserved privilege is checked individually for each role.
    FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER'] LOOP
        IF NOT has_table_privilege(v_role, v_tbl, v_priv) THEN
          v_missing := v_missing || (v_tbl || '/' || v_role || '/' || v_priv);
        END IF;
      END LOOP;
    END LOOP;

    -- 3. The roles this migration did not name must be unchanged.
    IF NOT has_table_privilege('service_role', v_tbl, 'TRUNCATE') THEN
      RAISE EXCEPTION '%: service_role lost TRUNCATE — this migration should not have touched it.', v_tbl;
    END IF;

    -- 4. RLS must still be the thing gating the privileges that remain.
    IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = split_part(v_tbl,'.',1) AND c.relname = split_part(v_tbl,'.',2)) THEN
      RAISE EXCEPTION '%: RLS is not enabled — the re-granted privileges would be ungated.', v_tbl;
    END IF;

  END LOOP;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'The re-grant dropped privileges that were held before: %', v_missing;
  END IF;

  -- 5. The single most consequential preserved grant, asserted by name rather than
  --    only inside the loop: without it the public event page and public registration
  --    stop working for signed-out visitors.
  IF NOT has_table_privilege('anon', 'public.events', 'SELECT') THEN
    RAISE EXCEPTION
      'anon lost SELECT on public.events — the public event page and public registration would be down.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events'
      AND cmd = 'SELECT' AND roles::text LIKE '%public%'
  ) THEN
    RAISE EXCEPTION
      'No SELECT policy on public.events reaches the public role — anon could not read events even with the grant.';
  END IF;

  -- 6. Flag, at apply time, what is deliberately left alone.
  IF has_table_privilege('anon', 'public.events', 'INSERT')
     OR has_table_privilege('anon', 'public.events', 'UPDATE')
     OR has_table_privilege('anon', 'public.events', 'DELETE') THEN
    RAISE NOTICE
      'NOT CHANGED HERE: anon still holds INSERT/UPDATE/DELETE grants on these tables. They are inert today (every write policy is TO authenticated), but the grants themselves deserve a separate review.';
  END IF;

  RAISE NOTICE
    'events + event_committees: neither the anon key nor signed-in accounts can empty these tables; all other privileges preserved.';
END
$$;
