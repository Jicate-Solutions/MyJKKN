-- ============================================================================
-- ID Card substrate v2 — universal profiles anchor (2026-07-23)
-- ============================================================================
-- Director decision 2026-07-23: ID cards are for EVERYONE (learners + faculty
-- + staff), anchored on public.profiles (the universal person table;
-- profiles.id == auth.users.id). Verified before this change:
--   • ZERO active learners lack a profile (4,180/4,180 linked)
--   • 842/844 staff linked
--   • The 1,089 unlinked learner rows are pre-enrollment pipeline records
--     (reserved/enquiry/rejected) that should not receive cards yet
--   • Cards are printed AT/AFTER account activation (Director interview)
--   • Inactive/graduated people stay printable — registrar's judgment
-- id_card_print_jobs is EMPTY (0 rows) and the substrate PRs are unmerged,
-- so the column swap is a clean in-place change, not a data migration.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- A. id_card_print_jobs: student_id (learners_profiles FK) → profile_id (profiles FK)
-- ----------------------------------------------------------------------------

DROP INDEX IF EXISTS public.idx_id_card_print_jobs_student;

-- The old learner-own policy depends on student_id — must drop before the column
DROP POLICY IF EXISTS "id_card_print_jobs_learner_view_own" ON public.id_card_print_jobs;

ALTER TABLE public.id_card_print_jobs
  DROP COLUMN IF EXISTS student_id;

ALTER TABLE public.id_card_print_jobs
  ADD COLUMN IF NOT EXISTS profile_id UUID NOT NULL
    REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_id_card_print_jobs_profile
  ON public.id_card_print_jobs (profile_id);

COMMENT ON TABLE public.id_card_print_jobs IS
  'Print job queue for ALL people (learners + employees). profile_id => profiles (universal anchor; profiles.id == auth.users.id). Bridge picks up status=pending rows, transitions through rendering/sent_to_agent/printed/failed.';

COMMENT ON COLUMN public.id_card_print_jobs.profile_id IS
  'The person the card is for. Universal: learner data joins via profiles.learner_id -> learners_profiles; employee data via staff.profile_id backlink.';

-- ----------------------------------------------------------------------------
-- B. RLS: learner-own policy → universal self-view (profile_id = auth.uid())
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "id_card_print_jobs_learner_view_own" ON public.id_card_print_jobs;

DROP POLICY IF EXISTS "id_card_print_jobs_self_view" ON public.id_card_print_jobs;
CREATE POLICY "id_card_print_jobs_self_view"
  ON public.id_card_print_jobs FOR SELECT TO authenticated
  USING (
    public.user_has_permission('id_cards.my-cards.view')
    AND profile_id = auth.uid()
  );

-- Storage self-view: photo objects are keyed by profile_id path (<profile_id>/...)
DROP POLICY IF EXISTS "student_photos_learner_select_own" ON storage.objects;

DROP POLICY IF EXISTS "student_photos_self_select_own" ON storage.objects;
CREATE POLICY "student_photos_self_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND public.user_has_permission('id_cards.my-cards.view')
    AND storage.objects.name LIKE auth.uid()::text || '/%'
  );

-- ----------------------------------------------------------------------------
-- C. Seeds: my-cards.view to employee roles; photo fallback covers staff photos
-- ----------------------------------------------------------------------------

-- Roles verified to exist in prod 2026-07-23: faculty, hod, principal, staff
UPDATE public.custom_roles
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
      'id_cards.my-cards.view', true
    ),
    updated_at = now()
WHERE role_key IN ('faculty', 'hod', 'principal', 'staff');

UPDATE public.platform_policies
SET value = '["learners_profiles.student_photo_url","staff.profile_picture","placeholder"]'::jsonb,
    description = 'Ordered photo source fallbacks for ID card rendering (learner column, then employee column, then placeholder).',
    updated_at = now()
WHERE policy_key = 'id_card.photo_fallback'
  AND scope_type = 'global';

COMMIT;
