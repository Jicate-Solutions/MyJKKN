-- ============================================================================
-- Updated: 2026-07-31 — lock a repair backup table that was serving 179
-- learners' identities to anyone, close the same gap on nine sibling backups,
-- and stop the cluster HOD leaderboard being readable without a login.
--
-- ── PART 1 — the live leak ─────────────────────────────────────────────────
--
-- `_bak_learner_section_repair_20260731` was created earlier today as a safety
-- copy during a section repair. It shipped with RLS OFF and a SELECT grant that
-- anon can use. Confirmed over HTTPS with the public anon key — no login: rows
-- came back carrying `learner_id`, `roll_number` and `section_name`. 179 rows,
-- 179 distinct learners.
--
-- This is the documented `_bak_` pattern: a repair migration makes a copy of the
-- rows it is about to change, and the copy inherits neither the RLS nor the
-- grants of the table it was copied from. The original is protected; the
-- photocopy is not.
--
-- ── PART 2 — the nine siblings ─────────────────────────────────────────────
--
-- Every `_bak_`/`_rollback_` relation was then swept rather than sampled. Of 72,
-- exactly ONE was anon-readable (Part 1) — so this is not systemic today. But
-- ten carry RLS OFF, and RLS-off is what turns a stray future grant into a leak
-- with no code change to blame. All ten get RLS enabled here.
--
-- Enabling RLS with no policy means deny-all for ordinary roles. That is the
-- correct posture for a backup: `service_role` and `postgres` bypass RLS, so
-- admin tooling and any rollback still read them normally, while a mistaken
-- grant can no longer expose them.
--
-- ── PART 3 — mv_cluster_leaderboard_hods ───────────────────────────────────
--
-- 78 rows carrying `hod_name`, `hod_user_id`, `department_name` and
-- `institution_name`, readable by anon. The instruction was to remove the
-- account identifiers while keeping names public. Two things found while
-- implementing it changed the shape of the fix, and both are worth recording:
--
--   1. `hod_user_id` CANNOT simply be dropped. It is consumed by the
--      authenticated dashboard — `lib/services/dashboard/cluster-rank-service.ts`
--      types it on HodLeaderboardEntry, and `components/dashboard/hod-hero-strip.tsx`
--      uses it as the React key at line 342. Dropping the column breaks that
--      component at runtime and in the type checker.
--
--   2. There is nothing public to keep. Both consumers are authenticated
--      dashboard surfaces. No unauthenticated route reads this view, so the anon
--      grant is accidental rather than a feature — "keep the names public"
--      has nothing to preserve.
--
-- So the intent (no account identifiers reachable without a login) is met by
-- revoking anon, which costs nothing: every logged-in viewer keeps the exact
-- view they have now, `hod_user_id` included. If a genuinely public leaderboard
-- is ever wanted, the right shape is a separate name-only view, not weakening
-- this one.
--
-- No data is written or deleted. Grants and RLS flags only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1 + 2 — every RLS-off repair backup
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_locked int := 0;
BEGIN
  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (c.relname LIKE '\_bak\_%' OR c.relname LIKE '\_rollback\_%')
  LOOP
    -- Idempotent: ENABLE on an already-enabled table is a no-op, and REVOKE of a
    -- grant that is not held is likewise. Safe to re-apply.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC', r.relname);
    v_locked := v_locked + 1;
  END LOOP;

  RAISE NOTICE 'Locked % backup relation(s): RLS enabled, anon and PUBLIC revoked.', v_locked;
END $$;

-- ---------------------------------------------------------------------------
-- PART 3 — the HOD leaderboard
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.mv_cluster_leaderboard_hods FROM anon, PUBLIC;
GRANT  SELECT ON TABLE public.mv_cluster_leaderboard_hods
  TO authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.mv_cluster_leaderboard_hods IS
  'Cluster HOD leaderboard. NOT readable by anon — it carries hod_name and '
  'hod_user_id for 78 people and no unauthenticated surface consumes it. '
  'hod_user_id is deliberately retained because the authenticated dashboard '
  'uses it (hod-hero-strip.tsx React key); a public leaderboard, if ever needed, '
  'belongs in a separate name-only view rather than by weakening this one.';

-- ---------------------------------------------------------------------------
-- Apply-time asserts. A revoke that silently did nothing is the failure mode
-- this whole class of bug is made of.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_open text;
  v_no_rls text;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO v_open
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'm')
    AND (c.relname LIKE '\_bak\_%' OR c.relname LIKE '\_rollback\_%'
         OR c.relname = 'mv_cluster_leaderboard_hods')
    AND has_table_privilege('anon', c.oid, 'SELECT');

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still SELECT: %', v_open;
  END IF;

  SELECT string_agg(c.relname, ', ')
    INTO v_no_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND (c.relname LIKE '\_bak\_%' OR c.relname LIKE '\_rollback\_%')
    AND NOT c.relrowsecurity;

  IF v_no_rls IS NOT NULL THEN
    RAISE EXCEPTION 'backup table(s) still have RLS off: %', v_no_rls;
  END IF;
END $$;
