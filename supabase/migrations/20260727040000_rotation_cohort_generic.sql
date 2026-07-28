-- ============================================================================
-- Teaching-Enterprise Spine · Phase 3 · Rotation engine → COHORT-GENERIC
-- Created: 2026-07-27
-- Hardened: 2026-07-26 (security review — see SECURITY HARDENING below)
-- Spec: specs/teaching-enterprise-spine-generalization-2026-07-26.md §6/§9
--       (§6 deferred this; the Director explicitly overrode the deferral.)
--
-- DORMANT migration. Ships as a FILE only; the Director applies it after merge
-- (a MyJKKN deploy ships CODE, not DB migrations). Fully idempotent.
--
-- ⏱  APPLY ORDER  ⏱
--   Apply this AFTER `20260727010000_teaching_enterprise_cohorts.sql` (Lane A,
--   already merged to main), which creates public.teaching_enterprise_cohorts.
--   The timestamps already order correctly — 20260727010000 < 20260727040000 —
--   so any migration runner that applies in filename order does the right thing.
--
--   Section 2 attaches the cohort_key FOREIGN KEYs only when that table (and a
--   single-column UNIQUE index on its cohort_key) already exists; otherwise it
--   RAISEs a NOTICE and skips. Section 2 is idempotent — if this somehow lands
--   first, re-running JUST that DO block afterwards attaches the FKs.
--
-- ============================================================================
-- 🔒 SECURITY HARDENING — 2026-07-26 (two HIGH defects found in review)
-- ============================================================================
-- DEFECT 1 (HIGH) — PII disclosure via an unvalidated cohort key.
--   The first draft of fn_teaching_cohort_resolve ended in an IDENTITY FALLBACK:
--   an unconfigured cohort_key resolved to ITSELF, so learner_role_key became
--   the CALLER'S OWN ARBITRARY STRING. fn_teaching_cohort_list_learners then ran
--   `WHERE cr.role_key = <that string>` and returned {id, full_name, email} for
--   ANY role the caller cared to name — a directory-harvesting hole reachable by
--   every board manager, for every role in the platform.
--   FIX: the identity fallback is GONE. teaching_enterprise_cohorts is the SOLE
--   authority; an unknown key resolves to ZERO ROWS, and every caller in this
--   file now treats "resolve returned nothing" as REFUSE (never as "use the raw
--   string as a role name"). fn_teaching_cohort_list_learners additionally
--   RAISEs 22023 on an unknown/inactive key instead of silently returning [].
--   The ONE remaining constant is a compile-time literal, not caller input:
--   while the config table does not yet exist (pre-Lane-A window) the string
--   'mba_associate' — and nothing else — resolves, reproducing the pre-Phase-3
--   hardcoding exactly. A caller-supplied key can never become a role name.
--
-- DEFECT 2 (HIGH) — the is_active kill switch was defeated.
--   fn_teaching_cohort_resolve had no is_active filter, so the daily rotation
--   cron kept granting and expiring mba_associate_postings for a DEACTIVATED
--   cohort. The CSE cohort — the first non-MBA cohort — ships is_active=false
--   (Lane B), i.e. in exactly the state that bug ignored.
--   FIX: resolve only returns ACTIVE cohorts, and both scheduler functions
--   handle an unresolvable cohort explicitly (below).
--
-- 🧊 DEACTIVATION SEMANTICS = FREEZE (not revoke). DELIBERATE CHOICE.
--   Deactivating a cohort makes its rotation INERT: no new postings are granted,
--   no existing posting is expired, and the cycle's generated grid is left
--   standing. It does NOT mass-revoke the cohort's live access.
--   Why freeze: (a) it matches what the sibling Lane B migration already
--   documents for this same flag — "flipping is_active back to false SKIPS the
--   cohort rather than removing the role — the flag is not a clean un-grant …
--   while inactive the row is inert"; (b) a kill switch that silently revoked
--   access for a whole cohort on one admin click is a far worse failure than one
--   that stops the clock. To actually withdraw access, deactivate AND expire
--   deliberately:
--       UPDATE public.mba_associate_postings SET is_active = false, updated_at = now()
--        WHERE associate_user_id IN (SELECT tm.associate_user_id
--                                      FROM public.mba_team_members tm
--                                      JOIN public.mba_teams t ON t.id = tm.team_id
--                                     WHERE t.cohort_key = '<key>');
--   Cron behaviour on a deactivated cohort:
--     · fn_mba_rotation_apply    → CLEAN SKIP. Returns (NULL, 0, 0, status) with
--       a NOTICE and mutates nothing — the daily cron route already counts a
--       NULL current_period as "paused", so a deactivated cohort shows up as
--       paused, never as a failure, and never aborts the run.
--     · fn_mba_rotation_generate → REFUSES with 22023 and leaves the existing
--       slots untouched. This one RAISEs rather than returning zeros because it
--       is an interactive, manager-gated, DESTRUCTIVE rebuild (it deletes the
--       grid) with NO cron caller anywhere in the repo — verified by grep: the
--       only scheduler the cron invokes is fn_mba_rotation_apply
--       (app/api/cron/mba-rotation-tick/route.ts). Silently returning 0 slots
--       while leaving a stale grid is the silent-failure pattern; a clear error
--       is the correct feedback for a button press.
-- ============================================================================
--
-- WHY (the coupling being removed)
--   The Part-3 engine (20260725120000_mba_team_rotation_engine.sql) is already
--   cohort-agnostic in its data model — it rotates teams through
--   improvement_areas and writes mba_associate_postings. Exactly ONE literal
--   assumed MBA: fn_mba_rotation_apply skipped any team member who did not hold
--   role_key = 'mba_associate'. A second cohort's members would therefore have
--   been silently skipped forever. This migration turns that literal into data.
--
-- WHAT CHANGES (all additive — the engine has never run: 0 cycles, 0 teams,
-- 0 slots on prod at 2026-07-26, so there is no live behaviour to regress)
--   1. mba_teams.cohort_key           text NOT NULL DEFAULT 'mba_associate'
--      mba_rotation_cycles.cohort_key text NOT NULL DEFAULT 'mba_associate'
--      Existing rows backfill to 'mba_associate'. Because BOTH default to the
--      MBA cohort, every code path below is byte-identical to today for MBA.
--      (cycles needs the column too: a cycle must round-robin only the teams of
--      its OWN cohort, otherwise a second cohort's cycle would drag MBA teams
--      into its rota. That is the isolation guarantee.)
--   2. Conditional FKs to teaching_enterprise_cohorts(cohort_key).
--   3. fn_teaching_cohort_resolve(text)       NEW — cohort_key → {display_name,
--      learner_role_key} for CONFIGURED, ACTIVE cohorts only.
--   4. fn_teaching_cohort_options()           NEW — picker list for the UI.
--   5. fn_teaching_cohort_list_learners(text) NEW — cohort-filtered member
--      picker (the cohort-generic sibling of fn_mba_list_associates(), which is
--      left UNTOUCHED so the postings page keeps its proven call path).
--   6. fn_mba_rotation_generate  — round-robins only the cycle's own cohort.
--   7. fn_mba_rotation_apply     — checks each member against THEIR cohort's
--      learner role instead of the 'mba_associate' literal.
--
-- WHAT DOES NOT CHANGE (deliberately preserved contracts)
--   - No mba_* table is renamed (spec §6: 52 files of blast radius, zero gain).
--   - Postings still land in mba_associate_postings, and include_financial is
--     still NEVER named on the scheduler's upsert — it relies on that column's
--     DEFAULT false. That is the Part-2 money-toggle contract.
--   - The previous period's postings are still EXPIRED (need-to-know: access is
--     lost on rotate-out), for ALL previous members including leavers — for
--     every cohort that resolves. A frozen (deactivated) cohort is the ONE
--     exception, by design: see DEACTIVATION SEMANTICS above.
--   - Blackout (exam/holiday pause) handling is untouched.
--   - Both scheduler functions remain idempotent, and their RETURNS TABLE shapes
--     are byte-identical, so app/api/cron/mba-rotation-tick needs no change.
--   - Grant targets are PRESERVED, not widened: fn_mba_rotation_generate stays
--     authenticated (manager-gated inside), fn_mba_rotation_apply stays
--     service_role ONLY. Every REVOKE anon/PUBLIC is re-asserted because the
--     secdef-anon-revoke gate treats CREATE OR REPLACE as a new function, and
--     because Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every
--     new function separately from PUBLIC.
--   - Guards are TIGHTENED, never loosened: every permission test is wrapped in
--     COALESCE(..., false) so it cannot fall through on a NULL (no-session).
--
-- No new TABLE is created here, so no new-table anon REVOKE is required; the
-- new columns inherit the Part-3 RLS policies already on these tables.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. cohort_key on the two rotation-owning tables.
--    ADD (nullable) → backfill → SET DEFAULT → SET NOT NULL, so the block is
--    re-runnable and never fails on a table that already has the column.
-- ============================================================================
ALTER TABLE public.mba_teams            ADD COLUMN IF NOT EXISTS cohort_key text;
ALTER TABLE public.mba_rotation_cycles  ADD COLUMN IF NOT EXISTS cohort_key text;

UPDATE public.mba_teams           SET cohort_key = 'mba_associate' WHERE cohort_key IS NULL;
UPDATE public.mba_rotation_cycles SET cohort_key = 'mba_associate' WHERE cohort_key IS NULL;

ALTER TABLE public.mba_teams            ALTER COLUMN cohort_key SET DEFAULT 'mba_associate';
ALTER TABLE public.mba_rotation_cycles  ALTER COLUMN cohort_key SET DEFAULT 'mba_associate';
ALTER TABLE public.mba_teams            ALTER COLUMN cohort_key SET NOT NULL;
ALTER TABLE public.mba_rotation_cycles  ALTER COLUMN cohort_key SET NOT NULL;

COMMENT ON COLUMN public.mba_teams.cohort_key IS
  'Which teaching-enterprise cohort this team belongs to (teaching_enterprise_cohorts.cohort_key). Defaults to ''mba_associate'' so pre-Phase-3 rows and any un-migrated writer keep the original behaviour. Drives which learner role fn_mba_rotation_apply requires of the team''s members. A team whose cohort is unconfigured or DEACTIVATED is skipped (frozen), not revoked.';

COMMENT ON COLUMN public.mba_rotation_cycles.cohort_key IS
  'Which teaching-enterprise cohort this rotation cycle serves. fn_mba_rotation_generate round-robins ONLY the active teams whose cohort_key matches — that is the cross-cohort isolation guarantee. Defaults to ''mba_associate''. If the cohort is deactivated the cycle goes inert: apply skips it, generate refuses.';

CREATE INDEX IF NOT EXISTS idx_mba_teams_cohort
  ON public.mba_teams (cohort_key, is_active);
CREATE INDEX IF NOT EXISTS idx_mba_rotation_cycles_cohort
  ON public.mba_rotation_cycles (cohort_key);

-- ============================================================================
-- 2. Conditional FKs — attached ONLY when the Lane-A config table exists with a
--    single-column UNIQUE index on cohort_key. Idempotent + safe to re-run.
-- ============================================================================
DO $fk$
DECLARE
  v_rel        oid := to_regclass('public.teaching_enterprise_cohorts');
  v_has_unique boolean;
BEGIN
  IF v_rel IS NULL THEN
    RAISE NOTICE 'teaching_enterprise_cohorts absent — cohort_key FKs SKIPPED. Apply the Lane-A cohort-config migration, then re-run this DO block.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a
      ON a.attrelid = i.indrelid
     AND a.attnum   = i.indkey[0]
    WHERE i.indrelid    = v_rel
      AND i.indisunique
      AND i.indnkeyatts = 1
      AND a.attname     = 'cohort_key'
  ) INTO v_has_unique;

  IF NOT v_has_unique THEN
    RAISE NOTICE 'teaching_enterprise_cohorts.cohort_key has no single-column UNIQUE index — cohort_key FKs SKIPPED.';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mba_teams_cohort_key_fkey'
      AND conrelid = 'public.mba_teams'::regclass
  ) THEN
    ALTER TABLE public.mba_teams
      ADD CONSTRAINT mba_teams_cohort_key_fkey
      FOREIGN KEY (cohort_key)
      REFERENCES public.teaching_enterprise_cohorts (cohort_key)
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mba_rotation_cycles_cohort_key_fkey'
      AND conrelid = 'public.mba_rotation_cycles'::regclass
  ) THEN
    ALTER TABLE public.mba_rotation_cycles
      ADD CONSTRAINT mba_rotation_cycles_cohort_key_fkey
      FOREIGN KEY (cohort_key)
      REFERENCES public.teaching_enterprise_cohorts (cohort_key)
      ON UPDATE CASCADE;
  END IF;
END
$fk$;

-- ============================================================================
-- 3. fn_teaching_cohort_resolve — the ONE place a cohort_key becomes a role.
--
--    🔒 SECURITY-CRITICAL. This function is the ONLY translation from a
--    cohort_key (which may be caller-supplied) to a role_key (which decides
--    whose names and emails, and whose department postings, are in scope).
--
--    CONTRACT — three outcomes, no fourth:
--      · configured AND is_active   → exactly one row from the config table
--      · configured but INACTIVE    → ZERO rows  (the kill switch)
--      · unknown / blank            → ZERO ROWS  (never the caller's string)
--
--    There is NO identity fallback. An unconfigured key does NOT resolve to
--    itself: that was the directory-harvesting hole (DEFECT 1 in the header).
--    Callers MUST treat zero rows as REFUSE.
--
--    The one legacy constant: while teaching_enterprise_cohorts does not exist
--    (the pre-Lane-A window) there is no authority to consult, so exactly one
--    COMPILE-TIME literal is honoured — 'mba_associate', which is precisely the
--    string the pre-Phase-3 engine hardcoded. It is compared against a literal,
--    so caller input can never be promoted into a role name, and every other key
--    resolves to nothing. Once Lane A is applied (the documented apply order)
--    the config table is the sole authority and this branch is dead.
--
--    The table's presence is checked through pg_attribute (privilege-independent)
--    and read through dynamic SQL, so this function CREATEs and RUNs cleanly
--    while the table does not exist.
--
--    Internal helper: called from inside the SECURITY DEFINER functions below,
--    where the effective user is the definer, so `authenticated` needs no
--    EXECUTE grant. Locked to service_role for any direct system use.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_resolve(p_cohort_key text)
RETURNS TABLE (cohort_key text, display_name text, learner_role_key text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key   text := NULLIF(btrim(COALESCE(p_cohort_key, '')), '');
  v_rel   oid  := to_regclass('public.teaching_enterprise_cohorts');
  v_ready boolean := false;
BEGIN
  IF v_key IS NULL THEN
    RETURN;                                    -- nothing to resolve
  END IF;

  IF v_rel IS NOT NULL THEN
    SELECT count(*) = 4 INTO v_ready
    FROM pg_attribute a
    WHERE a.attrelid = v_rel
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname IN ('cohort_key', 'display_name', 'learner_role_key', 'is_active');
  END IF;

  IF v_ready THEN
    -- The config table is the SOLE authority once it exists. `c.is_active` is
    -- the kill switch: a deactivated cohort resolves to NOTHING, which makes it
    -- inert everywhere downstream (DEFECT 2 in the header).
    RETURN QUERY EXECUTE
      'SELECT c.cohort_key::text, c.display_name::text, c.learner_role_key::text
         FROM public.teaching_enterprise_cohorts c
        WHERE c.cohort_key = $1
          AND c.is_active'
      USING v_key;
    RETURN;   -- unknown OR deactivated → zero rows. No fallback. Deliberate.
  END IF;

  -- Config table ABSENT (pre-Lane-A). Exactly ONE compile-time literal resolves;
  -- the comparison is against a constant, so caller input is never promoted.
  IF v_key = 'mba_associate' THEN
    RETURN QUERY SELECT 'mba_associate'::text, 'MBA Associate'::text, 'mba_associate'::text;
  END IF;

  RETURN;                                      -- anything else: zero rows
END;
$fn$;

COMMENT ON FUNCTION public.fn_teaching_cohort_resolve(text) IS
  'SECURITY-CRITICAL. Resolves a teaching-enterprise cohort_key to {display_name, learner_role_key} from teaching_enterprise_cohorts, and ONLY for rows with is_active = true. Returns ZERO ROWS for an unknown, blank or DEACTIVATED key — there is deliberately no identity fallback, so a caller-supplied string can never become a role_key. Callers must treat zero rows as refuse. Before the Lane-A config table exists, the single compile-time literal ''mba_associate'' resolves (the pre-Phase-3 hardcoding) and nothing else does.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_resolve(text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_resolve(text) TO service_role;

-- ============================================================================
-- 4. fn_teaching_cohort_options — the cohort picker list for the UI.
--    Every candidate key passes through fn_teaching_cohort_resolve, so the list
--    contains ONLY configured, ACTIVE cohorts: deactivating a cohort removes it
--    from every picker (the kill switch again), and an unconfigured key that is
--    somehow present on a team or a cycle is shown as nothing rather than as a
--    fabricated label. Authentication-gated only (this returns labels, not data)
--    — matching the Part-3 rotation tables' own read policy, `auth.uid() IS NOT
--    NULL`.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_options()
RETURNS TABLE (cohort_key text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rel   oid := to_regclass('public.teaching_enterprise_cohorts');
  v_ready boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_rel IS NOT NULL THEN
    SELECT count(*) = 4 INTO v_ready
    FROM pg_attribute a
    WHERE a.attrelid = v_rel
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attname IN ('cohort_key', 'display_name', 'learner_role_key', 'is_active');
  END IF;

  IF v_ready THEN
    RETURN QUERY EXECUTE $q$
      SELECT r.cohort_key, r.display_name
      FROM (
        SELECT c.cohort_key::text AS k
          FROM public.teaching_enterprise_cohorts c
         WHERE c.is_active
        UNION SELECT 'mba_associate'::text
        UNION SELECT t.cohort_key  FROM public.mba_teams t
        UNION SELECT cy.cohort_key FROM public.mba_rotation_cycles cy
      ) keys
      -- INNER lateral: an unconfigured or deactivated key drops out entirely.
      CROSS JOIN LATERAL public.fn_teaching_cohort_resolve(keys.k) r
      ORDER BY r.display_name
    $q$;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.cohort_key, r.display_name
  FROM (
    SELECT 'mba_associate'::text AS k
    UNION SELECT t.cohort_key  FROM mba_teams t
    UNION SELECT cy.cohort_key FROM mba_rotation_cycles cy
  ) keys
  CROSS JOIN LATERAL fn_teaching_cohort_resolve(keys.k) r
  ORDER BY r.display_name;
END;
$fn$;

COMMENT ON FUNCTION public.fn_teaching_cohort_options() IS
  'Authenticated-only list of teaching-enterprise cohorts for UI pickers: {cohort_key, display_name}. Every candidate key is resolved through fn_teaching_cohort_resolve, so ONLY configured, ACTIVE cohorts appear — a deactivated cohort disappears from every picker, and no label is ever fabricated from a raw key.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_options() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_options() TO authenticated;

-- ============================================================================
-- 5. fn_teaching_cohort_list_learners — cohort-filtered member picker.
--    Same manager gate and same shape as fn_mba_list_associates(), which stays
--    in place UNTOUCHED (the postings page keeps its proven zero-argument call
--    path; no PostgREST overload ambiguity is introduced).
--
--    🔒 The cohort key is VALIDATED before any lookup. p_cohort_key is caller
--    input and this function returns learner names and EMAIL ADDRESSES, so the
--    key must name a real, active, configured cohort — validated by resolving it
--    against teaching_enterprise_cohorts, which is the only source of truth for
--    the role_key used below. An unknown, blank or deactivated key is REFUSED
--    (22023), not silently answered. Pre-hardening this function fell through to
--    an identity fallback, so ANY string a caller passed became the role_key on
--    line `cr.role_key = v_role` and it returned that role's entire member
--    roster with emails.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_teaching_cohort_list_learners(p_cohort_key text)
RETURNS TABLE (user_id uuid, name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  -- COALESCE: a NULL from any check must read as DENIED, never fall through.
  IF NOT COALESCE(
        is_super_admin() OR is_admin()
        OR user_has_permission('improvement.board.manage'), false) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  -- VALIDATION GATE. resolve() reads teaching_enterprise_cohorts and yields a
  -- row ONLY for a configured, ACTIVE cohort — so this single lookup is the
  -- validation. No row → refuse loudly; NEVER continue with the raw input.
  SELECT NULLIF(btrim(COALESCE(r.learner_role_key, '')), '') INTO v_role
  FROM fn_teaching_cohort_resolve(p_cohort_key) r;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive teaching-enterprise cohort: %',
      COALESCE(NULLIF(btrim(COALESCE(p_cohort_key, '')), ''), '(blank)')
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
    SELECT DISTINCT p.id, p.full_name, p.email
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    JOIN profiles p      ON p.id  = ur.user_id
    WHERE cr.role_key = v_role
      AND cr.is_active
    ORDER BY p.full_name;
END;
$fn$;

COMMENT ON FUNCTION public.fn_teaching_cohort_list_learners(text) IS
  'Manager-gated (improvement.board.manage) picker source: the learners holding a cohort''s learner role. p_cohort_key is VALIDATED against teaching_enterprise_cohorts first — an unknown, blank or DEACTIVATED cohort raises 22023 and no roster is returned, so a caller cannot name an arbitrary role and harvest its members'' emails. Cohort-generic sibling of fn_mba_list_associates(); fn_teaching_cohort_list_learners(''mba_associate'') returns exactly what that function returns.';

REVOKE EXECUTE ON FUNCTION public.fn_teaching_cohort_list_learners(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_teaching_cohort_list_learners(text) TO authenticated;

-- ============================================================================
-- 6. fn_mba_rotation_generate — CREATE OR REPLACE.
--    Changes vs 20260725120000:
--      (a) the round-robin participant set is the cycle's OWN cohort
--          (`t.cohort_key = v_cohort`) instead of every active team;
--      (b) the COALESCE-hardened permission guard;
--      (c) 🔒 the cycle's cohort must RESOLVE (configured + is_active) before
--          anything is rebuilt. An unconfigured or DEACTIVATED cohort is refused
--          BEFORE the DELETE, so the existing grid is frozen, never wiped.
--    Blackout jumping, the ((team + period) mod departments) placement, the
--    delete-then-insert rebuild and the return shape are otherwise unchanged.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_rotation_generate(
  p_cycle_id    uuid,
  p_num_periods integer DEFAULT NULL
)
RETURNS TABLE (periods integer, teams integer, departments integer, slots_created integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_period_wk integer;
  v_start     date;
  v_cohort    text;
  v_cohort_ok boolean;
  v_num_dept  integer;
  v_num_team  integer;
  v_periods   integer;
  v_created   integer := 0;
  v_rows      integer;
  v_cursor    date;
  v_win_start date;
  v_win_end   date;
  v_bo_end    date;
  v_guard     integer;
  p_idx       integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  -- COALESCE: a NULL from any check must read as DENIED, never fall through.
  IF NOT COALESCE(is_super_admin() OR is_admin()
          OR user_has_permission('improvement.board.manage'), false) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT period_weeks, start_date, cohort_key
    INTO v_period_wk, v_start, v_cohort
  FROM mba_rotation_cycles WHERE id = p_cycle_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'rotation cycle % not found (or missing start_date)', p_cycle_id;
  END IF;

  -- 🔒 KILL-SWITCH GATE, before any mutation. A cohort that is unconfigured or
  -- is_active = false resolves to nothing → refuse and leave the grid standing
  -- (freeze semantics). Raising is safe here: this is an interactive,
  -- manager-gated, destructive rebuild with no cron caller — the daily cron
  -- calls fn_mba_rotation_apply, which skips cleanly instead of erroring.
  SELECT EXISTS (SELECT 1 FROM fn_teaching_cohort_resolve(v_cohort)) INTO v_cohort_ok;
  IF NOT COALESCE(v_cohort_ok, false) THEN
    RAISE EXCEPTION 'teaching-enterprise cohort "%" is not configured or not active — rota generation refused; the existing slots for cycle % were left untouched',
      v_cohort, p_cycle_id
      USING ERRCODE = '22023';
  END IF;

  -- Ordered departments for this cycle (stable by display_order then label).
  -- DROP-first so the function is safe to call more than once per transaction
  -- (ON COMMIT DROP only fires at commit; a batch caller would otherwise collide).
  DROP TABLE IF EXISTS _depts;
  DROP TABLE IF EXISTS _teams;
  CREATE TEMP TABLE _depts ON COMMIT DROP AS
  SELECT a.id AS area_id,
         (row_number() OVER (ORDER BY a.display_order, a.label)) - 1 AS di
  FROM mba_rotation_cycle_departments cd
  JOIN improvement_areas a ON a.id = cd.area_id
  WHERE cd.cycle_id = p_cycle_id AND a.is_active;
  SELECT count(*) INTO v_num_dept FROM _depts;

  -- Active teams OF THIS CYCLE'S COHORT (round-robin participants), stable by
  -- creation order. This is the cross-cohort isolation guarantee: a cycle can
  -- never place another cohort's team — and therefore never another cohort's
  -- members — into its rota. With everything on the default 'mba_associate'
  -- this filter is a no-op, so MBA behaviour is unchanged.
  CREATE TEMP TABLE _teams ON COMMIT DROP AS
  SELECT t.id AS team_id,
         (row_number() OVER (ORDER BY t.created_at, t.id)) - 1 AS ti
  FROM mba_teams t
  WHERE t.is_active
    AND t.cohort_key = v_cohort;
  SELECT count(*) INTO v_num_team FROM _teams;

  -- Regenerate from scratch.
  DELETE FROM mba_rotation_slots WHERE cycle_id = p_cycle_id;

  IF v_num_dept = 0 OR v_num_team = 0 THEN
    RETURN QUERY SELECT 0, v_num_team, v_num_dept, 0;
    RETURN;
  END IF;

  v_periods := COALESCE(p_num_periods, v_num_dept);   -- default: one full rotation
  IF v_periods < 1 THEN v_periods := 1; END IF;

  v_cursor := v_start;
  FOR p_idx IN 0 .. (v_periods - 1) LOOP
    -- Advance to the next period window that clears every active blackout.
    v_guard := 0;
    LOOP
      v_win_start := v_cursor;
      v_win_end   := v_cursor + (v_period_wk * 7 - 1);
      SELECT max(b.end_date) INTO v_bo_end
      FROM mba_rotation_blackouts b
      WHERE b.cycle_id = p_cycle_id
        AND b.is_active
        AND b.start_date <= v_win_end
        AND b.end_date   >= v_win_start;
      EXIT WHEN v_bo_end IS NULL;              -- clean window
      v_cursor := v_bo_end + 1;                -- jump past the blackout, retry
      v_guard  := v_guard + 1;
      IF v_guard > 520 THEN                    -- ~10yr safety valve
        RAISE EXCEPTION 'blackout resolution exceeded safety bound for cycle %', p_cycle_id;
      END IF;
    END LOOP;

    INSERT INTO mba_rotation_slots
      (cycle_id, team_id, area_id, period_index, period_start, period_end)
    SELECT p_cycle_id, t.team_id, d.area_id, p_idx, v_win_start, v_win_end
    FROM _teams t
    JOIN _depts d ON d.di = ((t.ti + p_idx) % v_num_dept);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_created := v_created + v_rows;

    v_cursor := v_win_end + 1;
  END LOOP;

  RETURN QUERY SELECT v_periods, v_num_team, v_num_dept, v_created;
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_rotation_generate(uuid, integer) IS
  'Manager-gated (improvement.board.manage) rebuild of a cycle''s rota grid. Round-robins the active mba_teams OF THE CYCLE''S OWN cohort across the cycle''s departments, skipping blackout windows. Refuses with 22023 — before deleting anything — if the cycle''s cohort is unconfigured or is_active = false, so a deactivated cohort''s grid is frozen rather than wiped. Returns {periods, teams, departments, slots_created}.';

-- Grant target PRESERVED (authenticated; the manager gate is inside the body).
-- REVOKE re-asserted: the secdef-anon-revoke gate treats CREATE OR REPLACE as a
-- new function, and Supabase's default privileges re-grant anon on every one.
REVOKE EXECUTE ON FUNCTION public.fn_mba_rotation_generate(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_rotation_generate(uuid, integer) TO authenticated;

-- ============================================================================
-- 7. fn_mba_rotation_apply — CREATE OR REPLACE.
--    Changes vs 20260725120000:
--      (a) the "still holds the learner role" test is now per-cohort (each
--          team's own cohort_key → learner_role_key) instead of the
--          'mba_associate' literal;
--      (b) 🔒 a cycle whose cohort does not resolve (unconfigured or
--          is_active = false) is SKIPPED CLEANLY — a NOTICE plus
--          (NULL, 0, 0, status), mutating nothing at all. The cron route
--          already reads a NULL current_period as "paused", so a deactivated
--          cohort is counted, not counted as a failure, and never aborts the
--          run;
--      (c) 🔒 the previous period's postings are expired ONLY for cohorts that
--          resolve. Without this, deactivating a cohort would have expired its
--          whole roster on the next tick — a surprise mass-revocation. Freeze
--          is the documented choice (see DEACTIVATION SEMANTICS in the header).
--    Everything else is preserved exactly:
--      · postings still go to mba_associate_postings
--      · include_financial is still NOT named → keeps its DEFAULT false
--        (the Part-2 money-toggle contract)
--      · the previous period's postings are still expired (need-to-know) for
--        every live cohort, including its leavers
--      · blackout gaps still auto-pause; past-the-end still completes the cycle
--      · still idempotent, still service_role ONLY, same RETURNS TABLE shape
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_rotation_apply(p_cycle_id uuid)
RETURNS TABLE (
  current_period      integer,
  postings_activated  integer,
  postings_expired    integer,
  cycle_status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today     date := current_date;
  v_cur       integer;
  v_activated integer := 0;
  v_expired   integer := 0;
  v_max_end   date;
  v_status    text;
  v_cohort    text;
  v_cohort_ok boolean;
  v_skipped   integer := 0;
BEGIN
  SELECT status, cohort_key INTO v_status, v_cohort
  FROM mba_rotation_cycles WHERE id = p_cycle_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'rotation cycle % not found', p_cycle_id;
  END IF;

  -- 🔒 KILL-SWITCH GATE, before ANY mutation (including the auto-complete
  -- status write). A cohort that is unconfigured or is_active = false resolves
  -- to nothing → the cycle goes inert: nothing granted, nothing expired,
  -- nothing completed. Clean skip, not an error: the daily cron must not fail
  -- a run because an admin turned a cohort off.
  SELECT EXISTS (SELECT 1 FROM fn_teaching_cohort_resolve(v_cohort)) INTO v_cohort_ok;
  IF NOT COALESCE(v_cohort_ok, false) THEN
    RAISE NOTICE 'fn_mba_rotation_apply: cycle % SKIPPED — teaching-enterprise cohort "%" is not configured or not active. Existing postings are FROZEN (not expired).',
      p_cycle_id, v_cohort;
    RETURN QUERY SELECT NULL::integer, 0, 0, v_status;
    RETURN;
  END IF;

  -- Which period contains today? (all slots in a period share one window)
  SELECT s.period_index INTO v_cur
  FROM mba_rotation_slots s
  WHERE s.cycle_id = p_cycle_id
    AND s.period_start <= v_today
    AND s.period_end   >= v_today
  ORDER BY s.period_index
  LIMIT 1;

  -- No current period → auto-pause. Complete the cycle if we're past the end.
  IF v_cur IS NULL THEN
    SELECT max(period_end) INTO v_max_end FROM mba_rotation_slots WHERE cycle_id = p_cycle_id;
    IF v_max_end IS NOT NULL AND v_today > v_max_end AND v_status = 'active' THEN
      UPDATE mba_rotation_cycles SET status = 'completed', updated_at = now() WHERE id = p_cycle_id;
      v_status := 'completed';
    END IF;
    RETURN QUERY SELECT NULL::integer, 0, 0, v_status;
    RETURN;
  END IF;

  -- Per-cohort learner role for every team appearing in this cycle. One row per
  -- distinct cohort_key; resolve() is deterministic per key. For the MBA cohort
  -- this yields ('mba_associate','mba_associate') — the old literal, as data.
  -- 🔒 The lateral is INNER, so a team whose own cohort_key is unconfigured or
  -- deactivated produces NO row here and is skipped everywhere below — even if
  -- the cycle it sits in belongs to a live cohort. Defence in depth for
  -- hand-written data; the cycle-level gate above catches the normal case.
  -- DROP-first so the function is safe to call more than once per transaction.
  DROP TABLE IF EXISTS _cohort_roles;
  DROP TABLE IF EXISTS _cur;
  DROP TABLE IF EXISTS _prev;
  CREATE TEMP TABLE _cohort_roles ON COMMIT DROP AS
  SELECT DISTINCT t.cohort_key, r.learner_role_key
  FROM mba_rotation_slots s
  JOIN mba_teams t ON t.id = s.team_id
  CROSS JOIN LATERAL fn_teaching_cohort_resolve(t.cohort_key) r
  WHERE s.cycle_id = p_cycle_id;

  -- Observability: how many of this cycle's teams were frozen out.
  SELECT count(DISTINCT t.id) INTO v_skipped
  FROM mba_rotation_slots s
  JOIN mba_teams t ON t.id = s.team_id
  WHERE s.cycle_id = p_cycle_id
    AND NOT EXISTS (
      SELECT 1 FROM _cohort_roles cr3 WHERE cr3.cohort_key = t.cohort_key
    );
  IF v_skipped > 0 THEN
    RAISE NOTICE 'fn_mba_rotation_apply: cycle % — % team(s) frozen out (their cohort is unconfigured or not active); their postings were neither granted nor expired.',
      p_cycle_id, v_skipped;
  END IF;

  -- Current-period assignments, restricted to members who currently hold THEIR
  -- OWN cohort's learner role (a member who left the role mid-rotation is
  -- skipped here — their posting is not reactivated, and the RPC denies them).
  CREATE TEMP TABLE _cur ON COMMIT DROP AS
  SELECT DISTINCT tm.associate_user_id, s.area_id
  FROM mba_rotation_slots s
  JOIN mba_teams t          ON t.id = s.team_id
  JOIN _cohort_roles cr2    ON cr2.cohort_key = t.cohort_key
  JOIN mba_team_members tm  ON tm.team_id = s.team_id
  WHERE s.cycle_id = p_cycle_id
    AND s.period_index = v_cur
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = tm.associate_user_id
        AND cr.role_key = cr2.learner_role_key
        AND cr.is_active
    );

  -- Previous-period assignments (ALL members of a LIVE cohort, incl. leavers →
  -- they get expired). 🔒 The _cohort_roles join is what freezes a deactivated
  -- cohort instead of revoking it: without it, turning a cohort off would expire
  -- every one of its postings on the very next tick.
  CREATE TEMP TABLE _prev ON COMMIT DROP AS
  SELECT DISTINCT tm.associate_user_id, s.area_id
  FROM mba_rotation_slots s
  JOIN mba_teams t          ON t.id = s.team_id
  JOIN _cohort_roles cr2    ON cr2.cohort_key = t.cohort_key
  JOIN mba_team_members tm  ON tm.team_id = s.team_id
  WHERE s.cycle_id = p_cycle_id
    AND s.period_index = v_cur - 1;

  -- ACTIVATE current-period postings (include_financial left to its DEFAULT).
  WITH up AS (
    INSERT INTO mba_associate_postings
      (associate_user_id, area_id, assigned_by, assigned_at, is_active)
    SELECT c.associate_user_id, c.area_id, NULL, now(), true FROM _cur c
    ON CONFLICT (associate_user_id, area_id)
      DO UPDATE SET is_active = true, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_activated FROM up;

  -- EXPIRE previous-period postings the member is NOT staying on (need-to-know).
  WITH ex AS (
    UPDATE mba_associate_postings p
       SET is_active = false, updated_at = now()
     WHERE (p.associate_user_id, p.area_id) IN (SELECT associate_user_id, area_id FROM _prev)
       AND (p.associate_user_id, p.area_id) NOT IN (SELECT associate_user_id, area_id FROM _cur)
       AND p.is_active = true
    RETURNING 1
  )
  SELECT count(*) INTO v_expired FROM ex;

  RETURN QUERY SELECT v_cur, v_activated, v_expired, v_status;
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_rotation_apply(uuid) IS
  'Cron/system-only (service_role). Applies the CURRENT period of a rotation cycle: (re)activates each team member''s posting to their team''s current department — requiring the member still holds THEIR OWN cohort''s learner role — and expires the previous period''s postings (need-to-know). A cycle or team whose cohort is unconfigured or is_active = false is SKIPPED CLEANLY (NOTICE + NULL current_period, nothing granted and nothing expired: FREEZE, never mass-revoke), so an admin deactivating a cohort can never fail the daily cron. Auto-pauses in blackout gaps; completes the cycle past the end. Idempotent.';

-- Grant target PRESERVED (cron/system RPC → service_role only, never
-- caller-invokable). REVOKE re-asserted for the secdef-anon-revoke gate.
REVOKE EXECUTE ON FUNCTION public.fn_mba_rotation_apply(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mba_rotation_apply(uuid) TO service_role;

COMMIT;
