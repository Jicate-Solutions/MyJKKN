-- ============================================================================
-- 20260721230000 — Close the PDE cross-tenant RLS holes
-- ============================================================================
-- Three PDE tables carried `USING (true)` SELECT policies NAMED for admin
-- access. RLS policies are OR'd, so each one silently defeated the carefully
-- written own-row policy sitting beside it: any authenticated user could read
-- every learner's work, in every institution.
--
--   pde_sub_admin_read     ON pde_submissions        SELECT  USING (true)
--   pde_events_admin_read  ON pde_engagement_events  SELECT  USING (true)
--   pde_daily_admin_read   ON pde_engagement_daily   SELECT  USING (true)
--
-- Worse, pde_engagement_daily also carried a blanket WRITE policy:
--
--   pde_daily_write        ON pde_engagement_daily   ALL     USING (true) WITH CHECK (true)
--
-- letting any authenticated user insert, alter or delete the engagement rows
-- that feed at-risk detection — i.e. a learner could delete the evidence that
-- they were struggling. A codebase sweep found NO application writer for that
-- table (every reference is a .select), so nothing legitimate depends on it.
--
-- EXPOSURE AT THE TIME OF WRITING: zero rows in all three tables. This is a
-- landmine rather than a breach, and empty tables make now the cheapest and
-- safest moment to fix it.
--
-- TENANT SCOPING WITHOUT A SCHEMA CHANGE: none of these tables has an
-- institution_id column (PDE predates that convention), but a join path to one
-- already exists — pde_submissions.assessment_id → pde_assessments.course_id →
-- vac_courses.institution_id, and the engagement tables carry course_id
-- directly. Using EXISTS against that path avoids adding a denormalised column
-- and a backfill, and cannot drift out of sync because the tenant fact stays in
-- exactly one place.
--
-- Learner self-access is preserved everywhere: each table keeps (or gains) an
-- own-row read so a learner still sees their own work.
--
-- Director decision 2026-07-21: "fix roles AND separate colleges".
-- ============================================================================

-- ── pde_submissions ─────────────────────────────────────────────────────────
-- Learner keeps pde_sub_own_read (learner_id = auth.uid()), untouched below.
DROP POLICY IF EXISTS pde_sub_admin_read ON public.pde_submissions;

CREATE POLICY pde_sub_staff_read
  ON public.pde_submissions
  FOR SELECT
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR (
      (select user_has_permission('pde.faculty.view'))
      AND EXISTS (
        SELECT 1
        FROM public.pde_assessments a
        JOIN public.vac_courses c ON c.id = a.course_id
        WHERE a.id = pde_submissions.assessment_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

-- ── pde_engagement_events ───────────────────────────────────────────────────
-- This table had NO own-row read: the USING(true) policy was the only way a
-- learner could see their own events. Dropping it without adding one would
-- have removed legitimate self-access, so the own-row policy is added first.
DROP POLICY IF EXISTS pde_events_admin_read ON public.pde_engagement_events;

CREATE POLICY pde_events_own_read
  ON public.pde_engagement_events
  FOR SELECT
  USING (learner_id = (select auth.uid()));

CREATE POLICY pde_events_staff_read
  ON public.pde_engagement_events
  FOR SELECT
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR (
      (select user_has_permission('pde.admin.view'))
      AND EXISTS (
        SELECT 1 FROM public.vac_courses c
        WHERE c.id = pde_engagement_events.course_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

-- ── pde_engagement_daily ────────────────────────────────────────────────────
-- Keeps its existing pde_daily_own_read (learner_id = auth.uid()).
DROP POLICY IF EXISTS pde_daily_admin_read ON public.pde_engagement_daily;

CREATE POLICY pde_daily_staff_read
  ON public.pde_engagement_daily
  FOR SELECT
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR (
      (select user_has_permission('pde.admin.view'))
      AND EXISTS (
        SELECT 1 FROM public.vac_courses c
        WHERE c.id = pde_engagement_daily.course_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

-- The blanket write policy is replaced with an admin-only one. Crons and
-- server-side aggregation run as service_role, which bypasses RLS entirely, so
-- they are unaffected; and no application code writes this table through an
-- authenticated client (verified by sweep). A learner can no longer edit or
-- delete the engagement record used to decide whether they are at risk.
DROP POLICY IF EXISTS pde_daily_write ON public.pde_engagement_daily;

CREATE POLICY pde_daily_admin_write
  ON public.pde_engagement_daily
  FOR ALL
  USING ((select is_super_admin()) OR (select is_admin()))
  WITH CHECK ((select is_super_admin()) OR (select is_admin()));

NOTIFY pgrst, 'reload schema';
