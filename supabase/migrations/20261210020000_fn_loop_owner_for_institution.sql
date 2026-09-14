-- ============================================================================
-- 20261210020000_fn_loop_owner_for_institution.sql
-- Resolve WHO owns a loop for ONE institution — the scoped owner when a
-- loop_owner_scopes row exists, else the estate-level loop_registry owner.
--
-- WHY THIS EXISTS (Director decisions 2026-09-13)
--   20261019020000 (PR #3324) seeded seven Principals into loop_owner_scopes
--   for 'attendance-intervention' and, by design, changed NO notification
--   routing: the daily learner-risk digest (learner-risk-staff-notifications)
--   still reached only each department's head. The Director ruled that the
--   scoped owner must actually RECEIVE their college's loop alerts through
--   that SAME in-app mechanism, and that a college with no scope row — or
--   whose scope row was blanked/removed through the Owners & verdicts panel —
--   keeps falling back to loop_registry.owner_email (the Director).
--
--   The table is the live registry, not the seed. Read 2026-09-13 (review):
--   production holds TEN 'attendance-intervention' rows — the seven seeded
--   Principals plus three added through the panel at 14:20Z the same day
--   (Arts & Science (Self) → viceprincipalcas@, College of Education → cao@,
--   Allied Health Sciences → dentalprincipal@). Every real college is scoped;
--   nothing falls back to the Director today. This function answers from
--   the table, whatever it holds; the CALLER decides whether the resolved
--   person may see what the alert contains (the notification route admits
--   an owner only when the row-level policy on learner_risk_assessments
--   would let them open it — see app/api/cron/learner-risk-notifications).
--
--   This file is the ONE place that fallback rule is written down for a
--   caller that needs a single answer: "for this loop, at this college, who?"
--   The notification route calls it once per institution that has at-risk
--   learners today and adds the answer as an ADDITIONAL recipient of the
--   department digests for that college. Nothing here writes; nothing here
--   changes loop_registry.owner_email.
--
-- WHAT IT RETURNS
--   text — the owner's email, or NULL when the loop has no registry row at
--   all, or when either argument is NULL (a NULL institution is a caller bug
--   for a function named *_for_institution, and must never quietly resolve
--   to the estate-level owner). A scope row's owner_email is NOT NULL by
--   table constraint, but the function still treats a blank/whitespace value
--   as absent (NULLIF(btrim)) so a hand-edited row can never resolve to ''
--   and silently notify nobody.
--
-- WHO MAY CALL IT
--   The cron route runs under the service role; the admin tower may read it
--   as a super admin / admin. Anyone else is refused — loop_owner_scopes is
--   admin-only under RLS and this SECURITY DEFINER read must not become the
--   hatch that lists per-college owners to every signed-in account. The guard
--   is an explicit predicate in a decision position (auth.role() /
--   is_super_admin() / is_admin()), so the CI secdef gate needs no marker.
--   auth.role() is NULL on a session with no JWT claims (a direct or pooler
--   connection, pg_cron); `NULL = 'service_role'` is NULL, and plpgsql's IF
--   takes NEITHER branch on NULL — so the comparison is wrapped in
--   COALESCE(…, false) to make a claim-less caller fail closed instead of
--   falling through to the lookup (review finding 2026-09-13, reproduced on
--   a throwaway Postgres).
--
-- FILE ONLY — never applied by the builder; the operator applies it at merge.
-- Add-only: no table, no policy, no seed, no change to any existing object.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_loop_owner_for_institution(
  p_loop_key text,
  p_institution_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scoped   text;
  v_registry text;
BEGIN
  -- COALESCE: auth.role() is NULL without JWT claims, NULL = 'x' is NULL, and
  -- IF NOT (NULL OR false OR false) runs neither branch — fail closed instead.
  IF NOT (
       COALESCE(auth.role() = 'service_role', false)
    OR is_super_admin()
    OR is_admin()
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- A NULL institution is a caller bug for a per-institution resolver: answer
  -- "nobody", never the estate-level owner by accident.
  IF p_loop_key IS NULL OR p_institution_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Estate-level owner. NULL when the loop is not registered at all — the
  -- caller must treat that as "nobody", never as a reason to widen.
  SELECT NULLIF(btrim(r.owner_email), '')
    INTO v_registry
    FROM loop_registry r
   WHERE r.loop_key = p_loop_key;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT NULLIF(btrim(s.owner_email), '')
    INTO v_scoped
    FROM loop_owner_scopes s
   WHERE s.loop_key = p_loop_key
     AND s.institution_id = p_institution_id;

  -- Scoped owner wins when present; a missing or blank scope falls back to
  -- the registry owner (the Director for attendance-intervention).
  RETURN COALESCE(v_scoped, v_registry);
END $$;

COMMENT ON FUNCTION public.fn_loop_owner_for_institution(text, uuid) IS
  'Owner email for one loop at one institution: the loop_owner_scopes row when present (blank treated as absent), else loop_registry.owner_email. NULL when the loop is not registered or either argument is NULL. service_role / super admin / admin only (NULL-safe: a claim-less session is refused). Added 2026-09-13 (Director decision: scoped Principals receive their college''s attendance-intervention alerts; colleges without a scope fall back to the registry owner).';

REVOKE EXECUTE ON FUNCTION public.fn_loop_owner_for_institution(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loop_owner_for_institution(text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
