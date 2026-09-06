-- Migration: Improvement Board — resolution tracking + separate finder / fixer credit
-- Date: 2026-07-27
-- Spec:  specs/teaching-enterprise-spine-generalization-2026-07-26.md §5
--        ("the contribution_mode fork"), Phase 2.
--
-- ============================================================================
-- WHY
-- ============================================================================
-- The teaching-enterprise spine has two kinds of participant:
--   * analyse-mode learners  — read de-identified `learning_*` views, FILE an
--     improvement idea (the business case). They are the FINDER.
--   * build-mode learners    — take an APPROVED idea and ship the change. They
--     are the FIXER.
-- Until now the board had nowhere to record "who shipped the fix, and where is
-- the proof", so a build-mode learner's contribution was invisible and only the
-- finder could ever appear on the Impact Leaderboard. This migration adds the
-- three columns that close the loop and the ONE write path that fills them.
--
-- ============================================================================
-- APPLY-ORDER DEPENDENCY  (read this before applying)
-- ============================================================================
--   This migration is SAFE TO APPLY BEFORE OR AFTER Lane A's
--   `teaching_enterprise_cohorts` migration. It does NOT create, alter or hard-
--   reference that table.
--
--   `teaching_enterprise_cohorts` is consulted at RUNTIME through `to_regclass`
--   + dynamic SQL, so:
--     * Lane A NOT yet applied  → the build-mode lane is inert. The ONLY callers
--       who may record a resolution are holders of `improvement.board.manage`
--       (plus super_admin / admin). This is the documented fallback in the Lane C
--       brief; it degrades capability, never security.
--     * Lane A applied          → any learner holding the `learner_role_key` of
--       an ACTIVE cohort row whose `contribution_mode = 'build'` may record a
--       resolution. No code change, no redeploy — the cohort config row alone
--       turns the lane on.
--   Verified 2026-07-27 against prod kvizhngldtiuufknvehv:
--   `to_regclass('public.teaching_enterprise_cohorts')` IS NULL (Lane A pending).
--
-- ============================================================================
-- WHY THE WRITE PATH MUST BE SECURITY DEFINER  (verified live, not assumed)
-- ============================================================================
--   TWO independent reasons, both confirmed against prod pg_policy on
--   2026-07-27. Neither is worked around by widening a policy.
--
--   (a) improvement_ideas HAS an UPDATE policy, but it excludes the fixer:
--         improvement_ideas_update  (cmd = UPDATE)  USING = WITH CHECK =
--           is_super_admin() OR is_admin()
--           OR (author_id = auth.uid() AND status = 'logged')
--           OR user_has_permission('improvement.board.manage')
--       A build-mode learner is NONE of those: not the author, the idea is
--       `approved` (not `logged`), and no `improvement.board.manage`. A direct
--       table UPDATE by them matches ZERO rows and SILENTLY SUCCEEDS WITH 0 ROWS
--       AFFECTED — the classic silent-no-op.
--
--   (b) improvement_idea_activity has RLS ENABLED and exactly ONE policy —
--       improvement_activity_select (cmd = SELECT). There is NO INSERT policy at
--       all, so a client-side INSERT of the audit row is rejected outright
--       ("new row violates row-level security policy"). The audit trail is
--       therefore only writable from a definer context.
--
--   Both tables are owned by `postgres` with relforcerowsecurity = false, so a
--   SECURITY DEFINER function owned by postgres bypasses RLS on both — which is
--   exactly why the function itself must re-implement the need-to-know gate (see
--   §3, "Read gate"). The base UPDATE policy is deliberately LEFT UNCHANGED: a
--   broad UPDATE policy would hand build-mode learners a general-purpose write on
--   every column of every idea they can see. This RPC writes three columns.
--
-- ============================================================================
-- WHAT THIS DOES
-- ============================================================================
--   1. improvement_ideas += resolution_ref / resolved_by / resolved_at,
--      with two CHECK constraints so the columns cannot be filled incoherently
--      even by a board manager writing through the base table.
--   2. fn_improvement_can_resolve()      — STABLE boolean capability probe, so
--      the UI can decide whether to render the "record the fix" input WITHOUT
--      needing SELECT on teaching_enterprise_cohorts (which build-mode learners
--      do not have).
--   3. fn_improvement_set_resolution()   — the single write path. Records the
--      CALLER as resolved_by on a FIRST-WRITER-WINS basis, validates the URL
--      shape, and writes an `improvement_idea_activity` audit row. It does NOT
--      move status.
--
--   NOT touched: fn_improvement_set_status, fn_mba_analyst_views, the RLS
--   policies on improvement_ideas, any mba_* table, any data-gap object.
--
-- ============================================================================
-- WHAT THIS DELIBERATELY DOES **NOT** DO
-- ============================================================================
--   * It does NOT change `status`, and does NOT stamp applied_by / applied_at.
--     Moving an idea along approved -> applied is a BOARD MANAGER decision and
--     remains the exclusive job of fn_improvement_set_status, which refuses every
--     status change from a non-manager (authors may only withdraw pre-approval).
--     Letting this RPC advance status would have handed a build-mode learner a
--     status transition the board's propose-only design denies them, and exceeded
--     the spec (which authorises a build-mode participant to fill
--     resolution_ref / resolved_by ONLY).
--     If recording a resolution SHOULD prompt a status change, that is a SEPARATE
--     manager action: the manager calls fn_improvement_set_status(id, 'applied').
--     Surface it in the UI as a manager prompt, never as an implicit side effect
--     of a learner's write.
--   * It does NOT reassign fixer credit to a THIRD party. A manager correcting
--     credit becomes the credited fixer themselves (audited, see §3). Moving
--     credit to some other named learner would need its own explicitly-audited
--     admin RPC; that surface is intentionally not opened here.
--
-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
--   * Both functions REVOKE EXECUTE FROM anon, PUBLIC and GRANT only to
--     `authenticated`. Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on
--     every new function SEPARATELY from PUBLIC, so the explicit anon revoke is
--     mandatory, not belt-and-braces. Re-asserted on every CREATE OR REPLACE.
--   * No new TABLE is created, so no new-table anon grant sweep is needed. The
--     three new COLUMNS inherit `improvement_ideas`' existing grants and RLS.
--   * Every super-admin / permission probe is COALESCE(..., false) wrapped and the
--     functions bail out on a NULL auth.uid() FIRST — a bare
--     `IF NOT (SELECT is_super_admin ...)` falls through with no session.
--   * The read gate in fn_improvement_set_resolution is a LITERAL transcription of
--     the live improvement_ideas_select policy, applied to EVERY caller. Because
--     the function is SECURITY DEFINER and RETURNS improvement_ideas (the FULL
--     row), a caller who cannot SELECT the row through RLS must not be able to
--     name an id and read it out of the return value.
--   * Fixer credit is FIRST-WRITER-WINS and immutable to peers: a second learner
--     cannot overwrite resolved_by (or the resolution link) and take the
--     leaderboard credit. Only a board manager may correct it, and only with an
--     audit row naming old -> new.

BEGIN;

-- ============================================================================
-- 1. Columns + coherence constraints
-- ============================================================================

ALTER TABLE public.improvement_ideas
  ADD COLUMN IF NOT EXISTS resolution_ref text,
  ADD COLUMN IF NOT EXISTS resolved_by    uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS resolved_at    timestamptz;

COMMENT ON COLUMN public.improvement_ideas.resolution_ref IS
  'Where the fix lives — an http(s) URL, normally a merged pull-request link. Filled ONLY by fn_improvement_set_resolution. NULL until a build-mode learner (or a board manager) records the shipped change.';
COMMENT ON COLUMN public.improvement_ideas.resolved_by IS
  'The FIXER — the profile that shipped the change named by resolution_ref. Distinct from author_id (the FINDER) and from applied_by (the board manager who moved the status). First-writer-wins: once set, only a board manager can change it, and only with an improvement_idea_activity audit row. Drives the fixer half of the Impact Leaderboard.';
COMMENT ON COLUMN public.improvement_ideas.resolved_at IS
  'When the resolution was first recorded (server clock, never client-supplied). Not re-stamped when the same learner refreshes their own link.';

CREATE INDEX IF NOT EXISTS improvement_ideas_resolved_by_idx
  ON public.improvement_ideas (resolved_by)
  WHERE resolved_by IS NOT NULL;

-- Shape guard: an http(s) URL with no whitespace, sane length.
-- DROP IF EXISTS + ADD keeps this file authoritative and re-runnable
-- (ADD CONSTRAINT has no IF NOT EXISTS form). improvement_ideas has 0 rows on
-- prod, so the revalidation scan is free.
ALTER TABLE public.improvement_ideas
  DROP CONSTRAINT IF EXISTS improvement_ideas_resolution_ref_shape_chk;
ALTER TABLE public.improvement_ideas
  ADD CONSTRAINT improvement_ideas_resolution_ref_shape_chk
  CHECK (
    resolution_ref IS NULL
    OR (
      length(resolution_ref) BETWEEN 12 AND 500
      AND resolution_ref ~ '^https?://[^[:space:]]+$'
    )
  );

-- Status guard: a resolution only exists on an idea whose work was AUTHORISED,
-- and never without the fixer + timestamp beside it.
--   `approved` is included deliberately. The fixer records the shipped change at
--   ship time, while the idea is still `approved`; a board manager then moves it
--   approved -> applied via fn_improvement_set_status. Excluding `approved` here
--   would make the primary flow (build-mode learner records their fix) violate
--   this constraint and fail outright.
--   The legal transition graph in fn_improvement_set_status is
--     approved -> applied -> verified -> closed
--   with no edge back out of `applied`, so nothing in the existing pipeline can
--   move a resolved idea into a state this constraint forbids. The one remaining
--   edge out of `approved` is approved -> not_pursued; a manager taking that edge
--   on an idea that already carries a resolution is correctly blocked here.
ALTER TABLE public.improvement_ideas
  DROP CONSTRAINT IF EXISTS improvement_ideas_resolution_status_chk;
ALTER TABLE public.improvement_ideas
  ADD CONSTRAINT improvement_ideas_resolution_status_chk
  CHECK (
    resolution_ref IS NULL
    OR (
      status IN (
        'approved'::improvement_idea_status,
        'applied'::improvement_idea_status,
        'verified'::improvement_idea_status,
        'closed'::improvement_idea_status
      )
      AND resolved_by IS NOT NULL
      AND resolved_at IS NOT NULL
    )
  );

-- ============================================================================
-- 2. Capability probe — fn_improvement_can_resolve()
--    The UI cannot compute this itself: `teaching_enterprise_cohorts` is only
--    readable by board managers, so a build-mode learner asking "may I record a
--    fix?" has to ask a SECDEF function. Shares its predicate with the setter
--    below so the button and the write can never disagree.
--
--    SCOPE NOTE: this answers "may this caller record fixes AT ALL", not "may
--    this caller see THAT idea". The per-idea need-to-know gate lives in
--    fn_improvement_set_resolution (§3) because it depends on the idea row.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_improvement_can_resolve()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_build boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;                                   -- no session => no capability
  END IF;

  -- Board managers always may. COALESCE: these probes can return NULL.
  IF COALESCE(is_super_admin(), false)
     OR COALESCE(is_admin(), false)
     OR COALESCE(user_has_permission('improvement.board.manage'), false) THEN
    RETURN true;
  END IF;

  -- Build-mode learner lane. Inert until Lane A ships
  -- `teaching_enterprise_cohorts`; consulted dynamically so this migration can
  -- be applied in either order (see the APPLY-ORDER header).
  IF to_regclass('public.teaching_enterprise_cohorts') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1
          FROM public.user_roles ur
          JOIN public.custom_roles cr  ON cr.id = ur.role_id
          JOIN public.teaching_enterprise_cohorts tec
               ON tec.learner_role_key = cr.role_key
         WHERE ur.user_id = $1
           AND COALESCE(cr.is_active, false)
           AND COALESCE(tec.is_active, false)
           AND tec.contribution_mode = 'build'
      )
    $q$ INTO v_build USING v_uid;
  END IF;

  RETURN COALESCE(v_build, false);
END
$fn$;

COMMENT ON FUNCTION public.fn_improvement_can_resolve() IS
  'True when the caller may record a resolution on an improvement idea AT ALL: a board manager (improvement.board.manage / admin / super_admin), or a learner holding the learner_role_key of an active teaching_enterprise_cohorts row with contribution_mode = build. Does NOT decide per-idea visibility — fn_improvement_set_resolution enforces that. Returns false (never raises) so the UI can gate a control on it.';

REVOKE EXECUTE ON FUNCTION public.fn_improvement_can_resolve() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_can_resolve() TO authenticated;

-- ============================================================================
-- 3. The write path — fn_improvement_set_resolution()
--    Records RESOLUTION ONLY: resolution_ref / resolved_by / resolved_at + one
--    audit row. Never status, never applied_by.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_improvement_set_resolution(
  p_idea_id        uuid,
  p_resolution_ref text
)
RETURNS public.improvement_ideas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_idea       public.improvement_ideas;
  v_manage     boolean;
  v_can_read   boolean;
  v_ref        text;
  v_prev_by    uuid;
  v_prev_ref   text;
  v_reassigned boolean := false;
  v_action     text;
  v_note       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- ---- URL shape (mirrors improvement_ideas_resolution_ref_shape_chk) -------
  v_ref := btrim(COALESCE(p_resolution_ref, ''));
  IF v_ref = '' THEN
    RAISE EXCEPTION 'a resolution link is required' USING ERRCODE = '22023';
  END IF;
  IF v_ref !~ '^https?://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'resolution link must be a single http:// or https:// URL with no spaces'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_ref) < 12 OR length(v_ref) > 500 THEN
    RAISE EXCEPTION 'resolution link must be between 12 and 500 characters'
      USING ERRCODE = '22023';
  END IF;

  -- ---- Capability: may this caller record fixes at all? ---------------------
  v_manage := COALESCE(is_super_admin(), false)
              OR COALESCE(is_admin(), false)
              OR COALESCE(user_has_permission('improvement.board.manage'), false);

  IF NOT (v_manage OR COALESCE(public.fn_improvement_can_resolve(), false)) THEN
    RAISE EXCEPTION 'not authorized: a build-mode cohort role or improvement.board.manage is required to record a resolution'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_idea
    FROM public.improvement_ideas
   WHERE id = p_idea_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'idea not found' USING ERRCODE = 'P0002';
  END IF;

  -- ---- Read gate: need-to-know on THIS idea ---------------------------------
  --   This function RETURNS the whole idea row and runs as the definer with RLS
  --   bypassed, so without this a caller could name any id and read a
  --   `sensitive` or other-institution idea straight out of the return value.
  --   The predicate below is a LITERAL transcription of the live
  --   improvement_ideas_select policy (read from pg_policy on prod 2026-07-27):
  --     is_super_admin() OR is_admin()
  --     OR (author_id = auth.uid())
  --     OR (user_has_permission('improvement.board.manage')
  --         AND role_has_institution_access(institution_id))
  --     OR (visibility = 'open'
  --         AND user_has_permission('improvement.ideas.view')
  --         AND role_has_institution_access(institution_id))
  --   It is applied to EVERY caller, managers included — a board manager whose
  --   role scope excludes the idea's institution cannot SELECT that idea through
  --   RLS either, so they must not read it out of this function. The gate can
  --   therefore never grant more than the SELECT policy does.
  --   improvement_ideas.institution_id is NOT NULL, so
  --   role_has_institution_access never sees the NULL-means-public branch here.
  v_can_read :=
       COALESCE(is_super_admin(), false)
    OR COALESCE(is_admin(), false)
    OR (v_idea.author_id = v_uid)
    OR (COALESCE(user_has_permission('improvement.board.manage'), false)
        AND COALESCE(role_has_institution_access(v_idea.institution_id), false))
    OR (v_idea.visibility = 'open'::improvement_idea_visibility
        AND COALESCE(user_has_permission('improvement.ideas.view'), false)
        AND COALESCE(role_has_institution_access(v_idea.institution_id), false));

  IF NOT v_can_read THEN
    RAISE EXCEPTION 'not authorized: this idea is not visible to you'
      USING ERRCODE = '42501';
  END IF;

  -- ---- Credit gate: fixer credit is FIRST-WRITER-WINS -----------------------
  --   resolved_by is what the Impact Leaderboard pays out on, so it must not be
  --   silently stealable by the next learner (or the next board manager) to call
  --   this function. Same rule for resolution_ref: it is the proof of THAT
  --   learner's work and is not another learner's to overwrite.
  --   Reachable cases after this gate:
  --     (a) resolved_by IS NULL     -> first writer takes the credit
  --     (b) resolved_by  = caller   -> same learner refreshing their own link
  --     (c) resolved_by <> caller   -> board manager correcting credit, audited
  v_prev_by  := v_idea.resolved_by;
  v_prev_ref := v_idea.resolution_ref;

  IF v_prev_by IS NOT NULL AND v_prev_by <> v_uid THEN
    IF NOT v_manage THEN
      RAISE EXCEPTION 'this idea is already credited to another learner; fixer credit and the resolution link cannot be reassigned'
        USING ERRCODE = '42501';
    END IF;
    v_reassigned := true;    -- board manager correction; audited below
  END IF;

  -- ---- Status precondition (a CHECK, never a transition) --------------------
  --   Read-only guard: a resolution only makes sense once the board has approved
  --   the work. This RPC does NOT move status — see the "WHAT THIS DELIBERATELY
  --   DOES NOT DO" header. Mirrors improvement_ideas_resolution_status_chk.
  IF v_idea.status NOT IN (
       'approved'::improvement_idea_status,
       'applied'::improvement_idea_status,
       'verified'::improvement_idea_status,
       'closed'::improvement_idea_status
     ) THEN
    RAISE EXCEPTION 'cannot record a resolution while the idea is %; a board manager must approve it first',
      v_idea.status USING ERRCODE = '22023';
  END IF;

  -- ---- The write: three columns, nothing else ------------------------------
  UPDATE public.improvement_ideas SET
    resolution_ref = v_ref,
    resolved_by    = CASE WHEN v_reassigned THEN v_uid ELSE COALESCE(resolved_by, v_uid) END,
    resolved_at    = CASE WHEN v_reassigned THEN now()  ELSE COALESCE(resolved_at, now()) END
  WHERE id = p_idea_id
  RETURNING * INTO v_idea;

  -- ---- Audit row (same table + shape fn_improvement_set_status writes) ------
  --   to_status is NULL by design: this RPC never moves status. from_status
  --   records the (unchanged) status the resolution was recorded against.
  v_action := CASE
                WHEN v_reassigned      THEN 'resolution_reassigned'
                WHEN v_prev_by IS NULL THEN 'resolution_recorded'
                ELSE                        'resolution_ref_updated'
              END;

  v_note := CASE
              WHEN v_reassigned
                THEN 'fixer credit reassigned by board manager from learner '
                     || v_prev_by::text || ' to learner ' || v_uid::text
                     || COALESCE('; previous link ' || v_prev_ref, '; no previous link')
                     || '; new link ' || v_ref
              ELSE v_ref
            END;

  INSERT INTO public.improvement_idea_activity
    (idea_id, actor_id, action, from_status, to_status, note)
  VALUES (
    p_idea_id,
    v_uid,
    v_action,
    v_idea.status,
    NULL,
    v_note
  );

  RETURN v_idea;
END
$fn$;

COMMENT ON FUNCTION public.fn_improvement_set_resolution(uuid, text) IS
  'The ONLY write path for improvement_ideas.resolution_ref / resolved_by / resolved_at. Records the CALLER as the fixer on a FIRST-WRITER-WINS basis (a peer learner cannot overwrite the credit or the link; a board manager may correct it, which writes an improvement_idea_activity row action = resolution_reassigned naming old -> new). Validates the http(s) URL shape and enforces a read gate transcribed from the improvement_ideas_select policy. Does NOT change status and does NOT stamp applied_by — moving approved -> applied stays the exclusive job of fn_improvement_set_status. SECURITY DEFINER because the base UPDATE policy makes a build-mode learner''s direct UPDATE a silent 0-row no-op, and improvement_idea_activity has no INSERT policy at all.';

REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_resolution(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_resolution(uuid, text) TO authenticated;

COMMIT;
