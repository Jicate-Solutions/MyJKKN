-- ============================================================================
-- 20260721220000 — pde_clinical_image_reviews
-- ============================================================================
-- Audit trail for the burned-in-identifier confirmation gate on clinical
-- teaching images.
--
-- Metadata (EXIF/GPS) is stripped mechanically and provably. Burned-in pixel
-- identifiers are NOT — a patient banner inside a photographed monitor is
-- caught only by a person looking at the image and ticking a box. That human
-- judgement was previously unrecorded: if a patient detail ever reached a
-- learner, there was no way to trace who approved the image or when.
--
-- Every tick AND every withdrawal is recorded, so the trail shows a reviewer
-- who changed their mind rather than silently dropping the earlier decision.
--
-- Decision: Director, 2026-07-21 ("record who and when").
-- Design: specs/pde-image-bridge-design-2026-07-21.md
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pde_clinical_image_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Storage object path within the pde-clinical-images bucket. Stable identity:
  -- the public URL embeds a host that could change, the path will not.
  storage_path    text NOT NULL,
  image_url       text NOT NULL,
  -- 'confirmed_clean' = reviewer asserts no identifier is visible in the pixels.
  -- 'withdrawn'       = reviewer un-ticked; the image was detached from the case.
  decision        text NOT NULL CHECK (decision IN ('confirmed_clean', 'withdrawn')),
  -- Where the image came from, so an audit can separate PMS-sourced imagery
  -- from imagery a person uploaded by hand.
  source          text NOT NULL DEFAULT 'unknown'
                    CHECK (source IN ('pms_import', 'upload', 'unknown')),
  reviewed_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at     timestamptz NOT NULL DEFAULT now(),
  institution_id  uuid NOT NULL REFERENCES public.institutions(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Reviewer history for one image, newest first — the audit read path.
CREATE INDEX IF NOT EXISTS ix_pde_clinical_image_reviews_path
  ON public.pde_clinical_image_reviews (storage_path, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS ix_pde_clinical_image_reviews_reviewer
  ON public.pde_clinical_image_reviews (reviewed_by, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS ix_pde_clinical_image_reviews_institution
  ON public.pde_clinical_image_reviews (institution_id);

ALTER TABLE public.pde_clinical_image_reviews ENABLE ROW LEVEL SECURITY;

-- Canonical dynamic-permission pattern: admin bypass first, then the permission
-- key + institution scope. Never hardcode role names (CLAUDE.md).
DROP POLICY IF EXISTS pde_clinical_image_reviews_select ON public.pde_clinical_image_reviews;
CREATE POLICY pde_clinical_image_reviews_select
  ON public.pde_clinical_image_reviews
  FOR SELECT
  USING (
    (select is_super_admin()) OR (select is_admin())
    OR (
      (select user_has_permission('pde.faculty.view'))
      AND (select role_has_institution_access(institution_id))
    )
  );

-- Inserts are written by the review endpoint as the acting reviewer. The
-- reviewed_by column is forced to auth.uid() so a row can never be attributed
-- to someone else.
DROP POLICY IF EXISTS pde_clinical_image_reviews_insert ON public.pde_clinical_image_reviews;
CREATE POLICY pde_clinical_image_reviews_insert
  ON public.pde_clinical_image_reviews
  FOR INSERT
  WITH CHECK (
    reviewed_by = (select auth.uid())
    AND (
      (select is_super_admin()) OR (select is_admin())
      OR (
        (select user_has_permission('pde.faculty.view'))
        AND (select role_has_institution_access(institution_id))
      )
    )
  );

-- An audit trail that can be edited is not an audit trail. No UPDATE or DELETE
-- policy exists, so only service_role (which bypasses RLS) can ever alter these
-- rows — deliberately, mirroring cohort_status_events.

NOTIFY pgrst, 'reload schema';
