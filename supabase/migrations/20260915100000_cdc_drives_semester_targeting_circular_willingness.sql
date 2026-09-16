-- =============================================================================
-- CDC Drives — institution + semester targeting, circular attachment (Google
-- Drive reference), and learner-profile / academic snapshot on willingness.
-- =============================================================================
-- Backward compatible: every column is additive and nullable / defaulted.
-- Existing drives keep working (institution_semesters = '[]' → "no semester
-- restriction", the legacy cdc_drive_eligibility.program_ids path still
-- applies for them).
--
-- Targeting shape (cdc_drives.institution_semesters):
--   [{ "institution_id": "<uuid>", "semester_orders": [5, 6] }, ...]
-- semester_orders are `semesters.semester_order` values (1..N); a learner is
-- targeted when learners_profiles.institution_id matches AND the learner's
-- semesters.semester_order is in that institution's list.
--
-- Notification ownership: the announced → willingness_open learner notification
-- is now emitted by the application (lib/services/cdc/drive-notifications.ts)
-- through the shared fanout + web-push implementation used by
-- /notifications/admin/new, targeted by institution + semester. The DB trigger
-- branch for willingness_open therefore becomes a no-op so learners are never
-- notified twice. Every other branch is unchanged.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. cdc_drives — semester targeting + circular (Google Drive reference)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cdc_drives
  ADD COLUMN IF NOT EXISTS institution_semesters jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS circular_drive_file_id text,
  ADD COLUMN IF NOT EXISTS circular_file_name     text,
  ADD COLUMN IF NOT EXISTS circular_mime_type     text,
  ADD COLUMN IF NOT EXISTS circular_size_bytes    integer,
  ADD COLUMN IF NOT EXISTS circular_uploaded_at   timestamptz,
  ADD COLUMN IF NOT EXISTS circular_uploaded_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.cdc_drives.institution_semesters IS
  'Per-institution semester targeting: [{institution_id, semester_orders:[int]}]. Empty = no semester restriction (legacy drives).';
COMMENT ON COLUMN public.cdc_drives.circular_drive_file_id IS
  'Google Drive file id of the drive circular. Bytes live in Drive, never in this DB. Served via /api/cdc/drives/[id]/circular. campus_circular_url keeps the Drive webViewLink.';

ALTER TABLE public.cdc_drives
  DROP CONSTRAINT IF EXISTS cdc_drives_institution_semesters_is_array;
ALTER TABLE public.cdc_drives
  ADD CONSTRAINT cdc_drives_institution_semesters_is_array
  CHECK (jsonb_typeof(institution_semesters) = 'array');

CREATE INDEX IF NOT EXISTS idx_cdc_drives_institution_semesters
  ON public.cdc_drives USING gin (institution_semesters);

-- ---------------------------------------------------------------------------
-- 2. cdc_drive_willingness — learner profile + academic snapshot at submission
-- ---------------------------------------------------------------------------
ALTER TABLE public.cdc_drive_willingness
  ADD COLUMN IF NOT EXISTS learner_name       text,
  ADD COLUMN IF NOT EXISTS learner_email      text,
  ADD COLUMN IF NOT EXISTS learner_mobile     text,
  ADD COLUMN IF NOT EXISTS additional_mobile  text,
  ADD COLUMN IF NOT EXISTS cgpa               numeric(4,2),
  ADD COLUMN IF NOT EXISTS arrears_count      integer,
  ADD COLUMN IF NOT EXISTS arrears_details    jsonb,
  ADD COLUMN IF NOT EXISTS academic_source    text,
  ADD COLUMN IF NOT EXISTS data_consent_at    timestamptz;

COMMENT ON COLUMN public.cdc_drive_willingness.academic_source IS
  'Where cgpa/arrears came from at submission: coe_rest | coe_db | unavailable.';
COMMENT ON COLUMN public.cdc_drive_willingness.data_consent_at IS
  'When the learner permitted CDC to use their profile + academic details for this drive. NULL = not permitted (details must not be exported).';

-- ---------------------------------------------------------------------------
-- 3. fn_cdc_emit_drive_notification — willingness_open branch becomes a no-op
--    (application-owned; see header). Body otherwise identical to
--    20260519T204616Z_cdc_drive_notification_lifecycle_filter.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cdc_emit_drive_notification(p_drive_id uuid, p_from_state text, p_to_state text, p_actor uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_drive_title    text;
  v_drive_url      text;
  v_user_ids       uuid[];
  v_targeting      jsonb;
  v_title          text;
  v_body           text;
  v_idempotency    text;
  v_actor          uuid;
BEGIN
  SELECT title INTO v_drive_title
  FROM public.cdc_drives
  WHERE id = p_drive_id;

  IF v_drive_title IS NULL THEN
    RETURN;
  END IF;

  v_drive_url   := '/cdc/drives/' || p_drive_id::text;
  v_idempotency := 'cdc.drive.' || p_drive_id::text || '.' || p_to_state;

  v_actor := COALESCE(
    p_actor,
    (SELECT created_by FROM public.cdc_drives WHERE id = p_drive_id)
  );

  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  IF p_to_state = 'cancelled' THEN
    SELECT array_agg(DISTINCT uid) INTO v_user_ids FROM (
      SELECT ur.user_id AS uid
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
        AND cr.is_active = true
      UNION
      SELECT p.id AS uid
      FROM public.cdc_drive_willingness w
      JOIN public.profiles p ON p.learner_id = w.learner_id
      WHERE w.drive_id = p_drive_id
        AND w.status IS DISTINCT FROM 'withdrawn'
    ) all_targets WHERE uid IS NOT NULL;

    v_title := 'Drive Cancelled: ' || v_drive_title;
    v_body  := 'The drive "' || v_drive_title || '" has been cancelled. '
            || 'See the drive page for the cancellation reason.';

  ELSIF p_to_state = 'announced' AND p_from_state = 'draft' THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_title := 'New Drive Announced: ' || v_drive_title;
    v_body  := 'A new drive "' || v_drive_title || '" has been announced. '
            || 'Review details and prepare the willingness rollout.';

  ELSIF p_to_state = 'willingness_open' THEN
    -- Application-owned since 20260915100000: the learner notification is
    -- emitted by lib/services/cdc/drive-notifications.ts (institution +
    -- semester targeting, shared fanout + web push, idempotency key
    -- 'cdc_drive_willingness_open:<drive_id>'). No-op here to avoid a
    -- duplicate bell item.
    RETURN;

  ELSIF p_to_state = 'eligibility_locked' THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key IN ('cdc_coordinator', 'cdc_head')
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_title := 'Eligibility Locked: ' || v_drive_title;
    v_body  := 'The eligibility list for "' || v_drive_title || '" has been '
            || 'locked. Proceed to attendance and selection.';

  ELSIF p_to_state = 'results_announced' THEN
    SELECT array_agg(DISTINCT p.id) INTO v_user_ids
    FROM public.cdc_drive_willingness w
    JOIN public.profiles p ON p.learner_id = w.learner_id
    WHERE w.drive_id = p_drive_id
      AND w.status IS DISTINCT FROM 'withdrawn'
      AND p.id IS NOT NULL;

    v_title := 'Results Announced: ' || v_drive_title;
    v_body  := 'Results are out for the drive "' || v_drive_title || '". '
            || 'Open the drive page to see your selection status.';

  ELSIF p_to_state = 'closed' THEN
    SELECT array_agg(DISTINCT ur.user_id) INTO v_user_ids
    FROM public.user_roles ur
    JOIN public.custom_roles cr ON cr.id = ur.role_id
    WHERE cr.role_key = 'cdc_head'
      AND cr.is_active = true
      AND ur.user_id IS NOT NULL;

    v_title := 'Drive Closed: ' || v_drive_title;
    v_body  := 'The drive "' || v_drive_title || '" has been closed. '
            || 'Final selections are recorded; archive the artifacts.';

  ELSE
    RETURN;
  END IF;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  v_targeting := jsonb_build_object('user_ids', to_jsonb(v_user_ids));

  INSERT INTO public.notifications (
    title, body, url, created_by, targeting, priority, category, kind, metadata, idempotency_key
  ) VALUES (
    v_title,
    v_body,
    v_drive_url,
    v_actor,
    v_targeting,
    'normal',
    'cdc.drive.' || p_to_state,
    'work_item',
    jsonb_build_object(
      'drive_id', p_drive_id,
      'from_state', p_from_state,
      'to_state', p_to_state,
      'recipient_count', array_length(v_user_ids, 1)
    ),
    v_idempotency
  )
  ON CONFLICT (idempotency_key) WHERE (idempotency_key IS NOT NULL) DO NOTHING;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Learner-side RLS on cdc_drive_willingness already scopes rows to
--    profiles.learner_id = row.learner_id (PR #987). The new columns inherit
--    that policy — no policy change required.
-- ---------------------------------------------------------------------------
