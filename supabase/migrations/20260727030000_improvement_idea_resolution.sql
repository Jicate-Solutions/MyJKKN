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
-- WHY THE WRITE PATH MUST BE SECURITY DEFINER  (verified, not assumed)
-- ============================================================================
--   `improvement_ideas` HAS an UPDATE policy — but read what it permits (live
--   pg_policy dump, 2026-07-27):
--     improvement_ideas_update  USING/CHECK =
--       is_super_admin() OR is_admin()
--       OR (author_id = auth.uid() AND status = 'logged')
--       OR user_has_permission('improvement.board.manage')
--   A build-mode learner is NONE of those: they are not the author, the idea is
--   `approved` (not `logged`), and they do not hold `improvement.board.manage`.
--   A direct table UPDATE by them would therefore match zero rows and SILENTLY
--   SUCCEED WITH 0 ROWS AFFECTED — the classic missing-UPDATE-policy no-op.
--   So the resolution write is routed exclusively through the SECURITY DEFINER
--   RPC below. The base UPDATE policy is deliberately LEFT UNCHANGED: widening
--   it would hand build-mode learners a general-purpose write on every column of
--   every idea they can see. The RPC writes three columns and nothing else.
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
--      CALLER as resolved_by, validates the URL shape, advances an `approved`
--      idea to `applied` through the existing legal transition, and writes an
--      `improvement_idea_activity` audit row (mirroring fn_improvement_set_status).
--
--   NOT touched: fn_improvement_set_status, fn_mba_analyst_views, the RLS
--   policies on improvement_ideas, any mba_* table, any data-gap object.
--
-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
--   * Both functions REVOKE EXECUTE FROM anon, PUBLIC and GRANT only to
--     `authenticated`. Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on
--     every new function SEPARATELY from PUBLIC, so the explicit anon revoke is
--     mandatory, not belt-and-braces.
--   * No new TABLE is created, so no new-table anon grant sweep is needed. The
--     three new COLUMNS inherit `improvement_ideas`' existing grants and RLS.
--   * Every super-admin / permission probe is COALESCE(..., false) wrapped and the
--     functions bail out on a NULL auth.uid() FIRST — a bare
--     `IF NOT (SELECT is_super_admin ...)` falls through with no session.
--   * A non-manager caller additionally must clear the SAME need-to-know rules the
--     SELECT policy applies (visibility, institution access). Without that, a
--     build-mode learner could name any idea id and read a `sensitive` row back
--     out of the function's RETURNS improvement_ideas.

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
  'The FIXER — the profile that shipped the change named by resolution_ref. Distinct from author_id (the FINDER) and from applied_by (whoever moved the status). Drives the fixer half of the Impact Leaderboard.';
COMMENT ON COLUMN public.improvement_ideas.resolved_at IS
  'When the resolution was recorded (server clock, never client-supplied).';

CREATE INDEX IF NOT EXISTS improvement_ideas_resolved_by_idx
  ON public.improvement_ideas (resolved_by)
  WHERE resolved_by IS NOT NULL;

-- Shape guard: an http(s) URL with no whitespace, sane length.
-- ADD CONSTRAINT has no IF NOT EXISTS — catalog-check for idempotency.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'improvement_ideas_resolution_ref_shape_chk'
       AND conrelid = 'public.improvement_ideas'::regclass
  ) THEN
    ALTER TABLE public.improvement_ideas
      ADD CONSTRAINT improvement_ideas_resolution_ref_shape_chk
      CHECK (
        resolution_ref IS NULL
        OR (
          length(resolution_ref) BETWEEN 12 AND 500
          AND resolution_ref ~ '^https?://[^[:space:]]+$'
        )
      );
  END IF;
END
$do$;

-- Status guard: a resolution only exists on an idea whose fix has actually
-- landed, and never without the fixer + timestamp beside it.
--   The legal transition graph in fn_improvement_set_status is
--     approved -> applied -> verified -> closed
--   with no edge back out of `applied`, so nothing in the existing pipeline can
--   move a resolved idea into a state this constraint forbids.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'improvement_ideas_resolution_status_chk'
       AND conrelid = 'public.improvement_ideas'::regclass
  ) THEN
    ALTER TABLE public.improvement_ideas
      ADD CONSTRAINT improvement_ideas_resolution_status_chk
      CHECK (
        resolution_ref IS NULL
        OR (
          status IN (
            'applied'::improvement_idea_status,
            'verified'::improvement_idea_status,
            'closed'::improvement_idea_status
          )
          AND resolved_by IS NOT NULL
          AND resolved_at IS NOT NULL
        )
      );
  END IF;
END
$do$;

-- ============================================================================
-- 2. Capability probe — fn_improvement_can_resolve()
--    The UI cannot compute this itself: `teaching_enterprise_cohorts` is only
--    readable by board managers, so a build-mode learner asking "may I record a
--    fix?" has to ask a SECDEF function. Shares its predicate with the setter
--    below so the button and the write can never disagree.
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
  'True when the caller may record a resolution on an improvement idea: a board manager (improvement.board.manage / admin / super_admin), or a learner holding the learner_role_key of an active teaching_enterprise_cohorts row with contribution_mode = build. Returns false (never raises) so the UI can gate a control on it.';

REVOKE EXECUTE ON FUNCTION public.fn_improvement_can_resolve() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_can_resolve() TO authenticated;

-- ============================================================================
-- 3. The write path — fn_improvement_set_resolution()
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
  v_can        boolean;
  v_ref        text;
  v_from       public.improvement_idea_status;
  v_advanced   boolean := false;
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

  -- ---- Capability ----------------------------------------------------------
  v_manage := COALESCE(is_super_admin(), false)
              OR COALESCE(is_admin(), false)
              OR COALESCE(user_has_permission('improvement.board.manage'), false);

  v_can := v_manage OR COALESCE(public.fn_improvement_can_resolve(), false);

  IF NOT v_can THEN
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

  -- ---- Need-to-know for non-managers ---------------------------------------
  --   This function RETURNS the whole idea row, and it runs as the definer with
  --   RLS bypassed. Without these two checks a build-mode learner could guess an
  --   id and read a `sensitive` or other-institution idea straight out of the
  --   return value. Mirrors improvement_ideas_select.
  IF NOT v_manage THEN
    IF v_idea.visibility <> 'open'::improvement_idea_visibility
       AND v_idea.author_id <> v_uid THEN
      RAISE EXCEPTION 'not authorized: this idea is restricted'
        USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(role_has_institution_access(v_idea.institution_id), false) THEN
      RAISE EXCEPTION 'not authorized: this idea belongs to another institution'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ---- Status gate ---------------------------------------------------------
  --   `approved` is the state a build-mode learner picks work up from, so
  --   recording the fix ALSO advances the idea along the existing legal edge
  --   approved -> applied (the same edge fn_improvement_set_status allows) and
  --   stamps applied_by/applied_at exactly as that function does. Recording on
  --   an already applied/verified/closed idea just (re)writes the link.
  v_from := v_idea.status;

  IF v_from = 'approved'::improvement_idea_status THEN
    v_advanced := true;
  ELSIF v_from NOT IN (
    'applied'::improvement_idea_status,
    'verified'::improvement_idea_status,
    'closed'::improvement_idea_status
  ) THEN
    RAISE EXCEPTION 'cannot record a resolution while the idea is %; it must be approved first',
      v_from USING ERRCODE = '22023';
  END IF;

  UPDATE public.improvement_ideas SET
    resolution_ref = v_ref,
    resolved_by    = v_uid,
    resolved_at    = now(),
    status         = CASE WHEN v_advanced THEN 'applied'::improvement_idea_status ELSE status END,
    applied_by     = CASE WHEN v_advanced THEN COALESCE(applied_by, v_uid) ELSE applied_by END,
    applied_at     = CASE WHEN v_advanced THEN COALESCE(applied_at, now())  ELSE applied_at  END
  WHERE id = p_idea_id
  RETURNING * INTO v_idea;

  -- ---- Audit row (same table + shape fn_improvement_set_status writes) ------
  INSERT INTO public.improvement_idea_activity
    (idea_id, actor_id, action, from_status, to_status, note)
  VALUES (
    p_idea_id,
    v_uid,
    'resolution_recorded',
    v_from,
    CASE WHEN v_advanced THEN 'applied'::improvement_idea_status ELSE NULL END,
    v_ref
  );

  RETURN v_idea;
END
$fn$;

COMMENT ON FUNCTION public.fn_improvement_set_resolution(uuid, text) IS
  'The ONLY write path for improvement_ideas.resolution_ref / resolved_by / resolved_at. Records the CALLER as the fixer, validates the http(s) URL shape, advances an approved idea along the existing approved -> applied edge, and writes an improvement_idea_activity row (action = resolution_recorded). SECURITY DEFINER because the base UPDATE policy does not permit a build-mode learner to write, which would make a direct UPDATE a silent 0-row no-op.';

REVOKE EXECUTE ON FUNCTION public.fn_improvement_set_resolution(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_improvement_set_resolution(uuid, text) TO authenticated;

COMMIT;
