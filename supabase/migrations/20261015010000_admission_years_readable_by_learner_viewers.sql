-- ============================================================================
-- admission_years: readable by anyone who can already read the learners it labels
-- ============================================================================
-- WHY
-- ---
-- admission_years is a 79-row lookup (11 institutions x ~7 years) whose only job
-- is to put a name on learners_profiles.admission_year_id — a column that is
-- 99.7% populated (7,339 of 7,361 rows) and already RENDERED as a column on the
-- Learners Profiles list.
--
-- Its SELECT policy, however, required `admission.settings.years.view`, which is
-- the ADMISSION SETTINGS key. Measured on 2026-08-31: of the 24 roles that hold
-- `learners.profiles.view`, only 7 also hold that key. The other 17 — including
-- Principal, Vice Principal, Administrator, Group Registrar, Facilitator,
-- School Principal and Learner Counsellor — could read a learner but not the
-- name of the cohort they belong to.
--
-- That is already a live bug: the Profile Completion drill-down on
-- /learners/analytics ships an admission-year filter whose dropdown has been
-- silently EMPTY for those 17 roles since it was added (2026-07-30). It is also
-- what would break the new admission-year filter on the Learners Profiles list.
-- Empty, no error — the silent failure mode this module keeps reproducing.
--
-- WHAT CHANGES
-- ------------
-- One additional accepted key: `learners.profiles.view`. Nothing else moves.
--
--   * still ONE permissive policy for this table/verb — the OR branch is added
--     INSIDE the existing policy rather than shipped as a second policy, because
--     multiple permissive policies are ORed *and each is evaluated per row*
--   * tenant scope is unchanged: role_has_institution_access(institution_id)
--     still ANDs against the permission test, so a single-institution role still
--     sees only its own institution's years
--   * every auth/permission call stays wrapped in a scalar subquery `(SELECT …)`
--     so it is an InitPlan evaluated once per query, not once per candidate row
--   * no new permission key is invented and no role's grants are edited, so
--     nobody gains access to the Admission Settings year-management screens
--
-- Previous definition, for the record:
--   ( SELECT is_super_admin()) OR ( SELECT is_admin())
--   OR (( SELECT user_has_permission('admission.settings.years.view'))
--       AND role_has_institution_access(institution_id))
-- ============================================================================

DROP POLICY IF EXISTS admission_years_select ON admission_years;

CREATE POLICY admission_years_select ON admission_years
  FOR SELECT
  USING (
    (SELECT is_super_admin())
    OR (SELECT is_admin())
    OR (
      (
        (SELECT user_has_permission('admission.settings.years.view'::text))
        -- Added 2026-08-31. Reading the label of a cohort you can already read
        -- the members of. See the header for the 17 roles this unblocks.
        OR (SELECT user_has_permission('learners.profiles.view'::text))
      )
      AND role_has_institution_access(institution_id)
    )
  );

-- ── Verify the policy is shaped as intended ────────────────────────────────
-- Guards against a silent no-op (e.g. the DROP succeeding and the CREATE being
-- edited to something that no longer references both keys).
DO $verify$
DECLARE
    expr text;
BEGIN
    SELECT pg_get_expr(p.polqual, p.polrelid) INTO expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'admission_years' AND p.polname = 'admission_years_select';

    IF expr IS NULL THEN
        RAISE EXCEPTION 'admission_years_select policy is missing after migration';
    END IF;

    IF expr NOT LIKE '%learners.profiles.view%' THEN
        RAISE EXCEPTION 'admission_years_select does not accept learners.profiles.view: %', expr;
    END IF;

    IF expr NOT LIKE '%admission.settings.years.view%' THEN
        RAISE EXCEPTION 'admission_years_select dropped the original admission key: %', expr;
    END IF;

    -- The tenant guard is the part that must never be lost in a rewrite.
    IF expr NOT LIKE '%role_has_institution_access%' THEN
        RAISE EXCEPTION 'admission_years_select lost its institution scope: %', expr;
    END IF;

    -- Exactly one permissive SELECT policy on this table.
    IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'admission_years' AND p.polcmd IN ('r', '*')) <> 1 THEN
        RAISE EXCEPTION 'expected exactly one SELECT policy on admission_years';
    END IF;
END
$verify$;
