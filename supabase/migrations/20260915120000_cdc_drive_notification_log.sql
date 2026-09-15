-- =============================================================================
-- CDC Drives — per-learner notification audit log.
-- =============================================================================
-- One row per (drive, learner, notification_type) describing what happened
-- when the app tried to notify that learner, so "learner X in semester 6 did
-- not get the drive notification" can be answered from data:
--
--   status = 'sent'            bell row + push attempted; see push_status
--   status = 'no_profile'      learner matched the audience but has no active
--                              login (profiles.learner_id link missing)
--   push_status = 'delivered' | 'failed' | 'stale_removed' | 'no_subscription'
--                | 'opted_out' | 'skipped' (VAPID unset)
--
-- Learners with NO row were never in the audience when a notification ran
-- (not eligible at the time, or the drive was never opened for willingness).
--
-- The log is also the duplicate guard: a learner with a 'sent' row for a drive
-- is never notified again for that drive, so editing the audience after
-- willingness opened notifies ONLY the newly eligible learners.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cdc_drive_notification_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id           uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id         uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  user_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_type  text NOT NULL DEFAULT 'cdc.drive.willingness_open',
  notification_id    uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  status             text NOT NULL CHECK (status IN ('sent', 'no_profile')),
  push_status        text CHECK (push_status IN ('delivered', 'failed', 'stale_removed', 'no_subscription', 'opted_out', 'skipped')),
  push_error         text,
  target_institution_id uuid,
  target_semester_order integer,
  batch_key          text,
  sent_at            timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT cdc_drive_notification_log_one_per_learner_type UNIQUE (drive_id, learner_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_cdc_drive_notification_log_drive
  ON public.cdc_drive_notification_log (drive_id, status);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_notification_log_learner
  ON public.cdc_drive_notification_log (learner_id);

COMMENT ON TABLE public.cdc_drive_notification_log IS
  'Per-learner audit of CDC drive notifications (who was targeted, whether a bell row + push went out, and why not). Also the duplicate guard for delta sends after audience edits.';

ALTER TABLE public.cdc_drive_notification_log ENABLE ROW LEVEL SECURITY;

-- CDC staff read the audit; learners may read their own rows (so support can
-- point them at it); only the service role writes.
DROP POLICY IF EXISTS "cdc_drive_notification_log_read" ON public.cdc_drive_notification_log;
CREATE POLICY "cdc_drive_notification_log_read" ON public.cdc_drive_notification_log
  FOR SELECT USING (
    public.is_cdc_staff()
    OR learner_id IN (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- Willingness deadline is enforced by the app (cdc_drives.willingness_window_close_at
-- already exists); no schema change needed for it.
