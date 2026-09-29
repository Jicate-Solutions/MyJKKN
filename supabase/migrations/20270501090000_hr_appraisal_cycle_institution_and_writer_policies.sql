-- ===========================================================================
-- HR appraisal cycles — give a cycle a college, and let the people in the
-- chain actually write to it.
--
-- Updated: 2026-09-29
--
-- TWO changes, both needed before any trial round can run.
--
-- 1) A cycle had no college. It was group-wide by construction, so opening
--    one showed "fill in your appraisal" to every staff member in all nine
--    colleges at once. institution_id makes a cycle belong to one college;
--    NULL keeps the old group-wide behaviour, so nothing existing changes
--    meaning.
--
-- 2) THE CHAIN COULD NOT RUN. The only write policy on hr_performance_reviews
--    allowed super admins and admins. A staff member could not save their own
--    self-appraisal and a head of department could not submit a review — the
--    database refused both. Every screen for those steps has existed since
--    PR #916 and none of them could ever have worked for a real user. That is
--    consistent with the module never having been used: production holds zero
--    cycles and zero appraisals.
--
-- Safe to apply: the column is nullable with no backfill, and the new
-- policies are PERMISSIVE, so they widen who may write and take nothing away.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) A cycle belongs to a college (NULL = every college, as before)
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_performance_review_cycles
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions(id);

COMMENT ON COLUMN public.hr_performance_review_cycles.institution_id IS
  'The college this appraisal round belongs to. NULL means every college — the '
  'behaviour before this column existed. Staff only see a cycle that is theirs '
  'or group-wide.';

CREATE INDEX IF NOT EXISTS idx_hr_perf_cycles_institution
  ON public.hr_performance_review_cycles(institution_id, status);

-- ---------------------------------------------------------------------------
-- 2) One open round per college, and at most one open group-wide round.
--    Two partial indexes rather than one expression: NULL is not comparable
--    in a unique index, so the group-wide case needs its own.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_perf_cycle_open_per_institution
  ON public.hr_performance_review_cycles(institution_id)
  WHERE status = 'open' AND institution_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_hr_perf_cycle_open_group_wide
  ON public.hr_performance_review_cycles((institution_id IS NULL))
  WHERE status = 'open' AND institution_id IS NULL;

-- ---------------------------------------------------------------------------
-- 3) Who can SEE a cycle. Was: any signed-in user sees every cycle.
--    Now: your own college's, or a group-wide one. Admins see all.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "hr_performance_review_cycles_select"
  ON public.hr_performance_review_cycles;
CREATE POLICY "hr_performance_review_cycles_select"
  ON public.hr_performance_review_cycles FOR SELECT USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (SELECT is_super_admin()) OR (SELECT is_admin())
      OR institution_id IS NULL
      OR role_has_institution_access(institution_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4) Who can WRITE an appraisal. This is the fix that makes the module usable.
--
--    The existing admin policy stays exactly as it is. These are PERMISSIVE
--    policies, so they OR with it: nobody loses a right they had.
--
--    The status conditions are what stop a submitted appraisal being edited
--    behind the next reviewer's back. A staff member may write while the row
--    is theirs (draft) and may hand it on; once it is submitted they cannot
--    change it. The service's state machine already refuses illegal moves —
--    this is the same rule enforced where it cannot be bypassed.
-- ---------------------------------------------------------------------------

-- Staff: create their own appraisal row.
DROP POLICY IF EXISTS "hr_performance_reviews_self_insert"
  ON public.hr_performance_reviews;
CREATE POLICY "hr_performance_reviews_self_insert"
  ON public.hr_performance_reviews FOR INSERT WITH CHECK (
    staff_id IN (
      SELECT id FROM public.staff WHERE profile_id = (SELECT auth.uid())
    )
    AND status IN ('draft', 'self_submitted')
  );

-- Staff: edit their own appraisal while it is still a draft, and submit it.
DROP POLICY IF EXISTS "hr_performance_reviews_self_update"
  ON public.hr_performance_reviews;
CREATE POLICY "hr_performance_reviews_self_update"
  ON public.hr_performance_reviews FOR UPDATE USING (
    staff_id IN (
      SELECT id FROM public.staff WHERE profile_id = (SELECT auth.uid())
    )
    AND status = 'draft'
  ) WITH CHECK (
    staff_id IN (
      SELECT id FROM public.staff WHERE profile_id = (SELECT auth.uid())
    )
    AND status IN ('draft', 'self_submitted')
  );

-- Head of department: review an appraisal from their own department once it
-- has been submitted. They may pass it on, or send it back to the person.
DROP POLICY IF EXISTS "hr_performance_reviews_hod_update"
  ON public.hr_performance_reviews;
CREATE POLICY "hr_performance_reviews_hod_update"
  ON public.hr_performance_reviews FOR UPDATE USING (
    staff_id IN (
      SELECT s.id
      FROM public.staff s
      JOIN public.departments d ON d.id = s.department_id
      WHERE d.head_of_department_id = (SELECT auth.uid())
    )
    AND status = 'self_submitted'
  ) WITH CHECK (
    staff_id IN (
      SELECT s.id
      FROM public.staff s
      JOIN public.departments d ON d.id = s.department_id
      WHERE d.head_of_department_id = (SELECT auth.uid())
    )
    AND status IN ('self_submitted', 'supervisor_reviewed', 'draft')
  );

COMMENT ON TABLE public.hr_performance_reviews IS
  'HR T5.1 — Per-staff appraisal row scoped to a hr_performance_review_cycles. '
  'State machine: draft -> self_submitted -> supervisor_reviewed -> sedc_reviewed '
  '-> final_approved. Supervisor = departments.head_of_department_id for the '
  'staff''s department. Write access: the staff member while their row is a '
  'draft, their head of department once it is submitted, admins throughout.';
