-- ============================================================================
-- STAFF PHOTO — SELF-CAPTURE WITH HR APPROVAL
-- Created: 2026-09-16.
--
-- WHY THIS EXISTS (Director decision, 2026-09-16)
--   A staff photograph today can only be set by an administrator opening that
--   person's record in the staff form and uploading a file for them, one at a
--   time (components/ImageUpload/staff-image-upload.tsx, reachable only from
--   app/(routes)/staff/list/_components/staff-form.tsx). That is why coverage
--   is what it is: the capability exists, the throughput does not.
--
--   This lets the person photograph themselves, from their own phone, and
--   routes it to HR for approval before it counts.
--
-- WHY APPROVAL IS NOT OPTIONAL (Director ruling, 2026-09-03, upheld)
--   lib/id-cards/photo-quality.ts refuses to print a card from a picture the
--   person put on their own login account, because that is not evidence the
--   institution photographed anyone. "Two outcomes, no override." A self-taken
--   photograph that lands straight on staff.profile_picture would be exactly
--   the value that ruling refuses.
--
--   So the submission is NOT the photograph of record. A reviewer approving it
--   IS the institutional act, and only that act writes staff.profile_picture.
--   The card system is untouched and keeps working on the column it already
--   trusts.
--
-- WHY THE WRITER CANNOT FORGE THE KEYS
--   Staff never write this table directly — RLS grants them no INSERT. They
--   call fn_submit_my_staff_photo(), which resolves their staff row from
--   auth.uid() itself and hard-codes status 'pending'. There is no argument by
--   which a caller can name someone else, or arrive already approved.
--
-- STORAGE — DELIBERATELY SPLIT
--   Submissions land in a PRIVATE bucket: they are unreviewed pictures of
--   people. Approved photographs go to the existing public 'staff-images'
--   path, unchanged, because lib/id-cards/photo-quality.ts documents that every
--   photo reference in these columns is an unsigned non-expiring URL and that
--   its shape check is only safe while that holds. Introducing a signed URL
--   here would quietly invalidate that guard. Changing it is a separate job.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Submissions table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_staff_photo_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Denormalised from staff so RLS can scope without joining a table the
  -- reader may not be able to see.
  institution_id    uuid NOT NULL,
  storage_path      text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by      uuid NOT NULL,
  submitted_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  review_note       text,
  approved_url      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hr_staff_photo_submissions IS
  'Staff-submitted photographs awaiting HR approval. Not the photograph of record — approval writes staff.profile_picture.';

CREATE INDEX IF NOT EXISTS idx_hr_staff_photo_sub_staff
  ON public.hr_staff_photo_submissions (staff_id);
-- The review queue reads pending-per-institution, newest first.
CREATE INDEX IF NOT EXISTS idx_hr_staff_photo_sub_queue
  ON public.hr_staff_photo_submissions (institution_id, status, submitted_at DESC);

-- One pending submission per person: re-submitting replaces, never queues up a
-- second picture of the same face for a reviewer to choose between.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_staff_photo_sub_one_pending
  ON public.hr_staff_photo_submissions (staff_id)
  WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_hr_staff_photo_sub_updated_at ON public.hr_staff_photo_submissions;
CREATE TRIGGER trg_hr_staff_photo_sub_updated_at
  BEFORE UPDATE ON public.hr_staff_photo_submissions
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

ALTER TABLE public.hr_staff_photo_submissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. RLS — read only. No INSERT or UPDATE policy exists for anyone: every
--    write goes through the two SECURITY DEFINER functions below, so there is
--    no path by which a submission can name the wrong person or arrive
--    already approved.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS hr_staff_photo_sub_select_own ON public.hr_staff_photo_submissions;
CREATE POLICY hr_staff_photo_sub_select_own
  ON public.hr_staff_photo_submissions
  FOR SELECT
  USING (submitted_by = auth.uid());

DROP POLICY IF EXISTS hr_staff_photo_sub_select_reviewer ON public.hr_staff_photo_submissions;
CREATE POLICY hr_staff_photo_sub_select_reviewer
  ON public.hr_staff_photo_submissions
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (
      public.user_has_permission('hr.staff_photo.review')
      AND public.role_has_institution_access(institution_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Submit — the caller names nothing but the file they just uploaded.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_submit_my_staff_photo(p_storage_path text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_staff_id uuid;
  v_inst_id  uuid;
  v_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'A photograph is required' USING ERRCODE = '22023';
  END IF;

  -- Resolve the caller's own staff row. The join column is profile_id, not
  -- user_id: staff has no user_id column, and fn_my_hr_context resolves the
  -- same way (WHERE s.profile_id = auth.uid()).
  -- Note this deliberately does NOT
  -- consider employment_categories.included_in_hr: someone who takes no part
  -- in HR still carries an identity card, so still needs a photograph.
  SELECT s.id, s.institution_id
    INTO v_staff_id, v_inst_id
    FROM public.staff s
   WHERE s.profile_id = v_uid
     AND COALESCE(s.is_active, true)
   LIMIT 1;

  -- FOUND, not a NULL check on the variables: SELECT ... INTO leaves every
  -- target NULL when no row matches, so a sentinel read from the same INTO
  -- cannot tell "no row" from "null column".
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active staff record for this login' USING ERRCODE = 'P0002';
  END IF;

  -- Re-submitting supersedes the pending one rather than queueing a second.
  UPDATE public.hr_staff_photo_submissions
     SET status      = 'rejected',
         review_note = 'Superseded by a newer photograph from the same person',
         reviewed_at = now()
   WHERE staff_id = v_staff_id
     AND status   = 'pending';

  INSERT INTO public.hr_staff_photo_submissions
    (staff_id, institution_id, storage_path, status, submitted_by)
  VALUES
    (v_staff_id, v_inst_id, p_storage_path, 'pending', v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_submit_my_staff_photo(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_submit_my_staff_photo(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Review — the institutional act. Approving is the ONLY thing that writes
--    staff.profile_picture, which is the column the card renderer trusts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_review_staff_photo_submission(
  p_submission_id uuid,
  p_approve       boolean,
  p_public_url    text DEFAULT NULL,
  p_note          text DEFAULT NULL
)
RETURNS TABLE (submission_id uuid, staff_id uuid, new_status text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_staff   uuid;
  v_inst    uuid;
  v_status  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT s.staff_id, s.institution_id, s.status
    INTO v_staff, v_inst, v_status
    FROM public.hr_staff_photo_submissions s
   WHERE s.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such submission' USING ERRCODE = 'P0002';
  END IF;

  -- Authorisation is re-checked here rather than relying on the caller having
  -- passed a route guard: this function is SECURITY DEFINER and would
  -- otherwise be a way around the table's own RLS.
  IF NOT (
        public.is_super_admin()
     OR public.is_admin()
     OR ( public.user_has_permission('hr.staff_photo.review')
          AND public.role_has_institution_access(v_inst) )
  ) THEN
    RAISE EXCEPTION 'Not allowed to review photographs for this institution'
      USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'This photograph has already been %', v_status
      USING ERRCODE = '22023';
  END IF;

  IF p_approve THEN
    -- Bind the stored value to the bucket the renderer already reads and to
    -- this person's own folder. A reviewer cannot point the card at an
    -- arbitrary picture by hand-calling this function.
    IF p_public_url IS NULL
       OR p_public_url NOT LIKE 'https://%'
       OR position('/storage/v1/object/public/staff-images/' in p_public_url) = 0
       OR position(v_staff::text in p_public_url) = 0 THEN
      RAISE EXCEPTION 'Approved photograph must be a staff-images URL for this person'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.staff
       SET profile_picture = p_public_url
     WHERE id = v_staff;

    UPDATE public.hr_staff_photo_submissions
       SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(),
           approved_url = p_public_url, review_note = p_note
     WHERE id = p_submission_id;

    RETURN QUERY SELECT p_submission_id, v_staff, 'approved'::text;
  ELSE
    UPDATE public.hr_staff_photo_submissions
       SET status = 'rejected', reviewed_by = v_uid, reviewed_at = now(),
           review_note = p_note
     WHERE id = p_submission_id;

    RETURN QUERY SELECT p_submission_id, v_staff, 'rejected'::text;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_review_staff_photo_submission(uuid, boolean, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_review_staff_photo_submission(uuid, boolean, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private bucket for unreviewed submissions.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('hr-staff-photo-submissions', 'hr-staff-photo-submissions', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
