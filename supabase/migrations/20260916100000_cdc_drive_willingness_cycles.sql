-- 2026-09-16 — CDC drive willingness opening cycles
--
-- The willingness window becomes a controlled, reopenable period with history:
--   cycle 1  open → close → notification sent
--   cycle 2  (reopened) open → close → notification sent
-- One row per opening. cdc_drives.willingness_window_open_at / _close_at keep
-- mirroring the CURRENT cycle so every existing "is the window open" check
-- (computeWillingnessWindowState, learner page, dashboard card, /mine) is
-- untouched.
--
-- Notification dedupe becomes per cycle: cdc_drive_notification_log gains
-- cycle_no and its unique key widens to (drive, learner, type, cycle).
--
-- Ships as a FILE — apply out of band (see project_supabase_db_push_does_not_work).

-- 1. Cycles table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_willingness_cycles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id              uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  cycle_no              integer NOT NULL CHECK (cycle_no >= 1),
  open_at               timestamptz NOT NULL,
  close_at              timestamptz,
  -- Stored kind; 'expired' and the scheduled→open flip are derived from time by the app.
  status                text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'open', 'reopened', 'closed')),
  reopen_reason         text,
  notification_sent     boolean NOT NULL DEFAULT false,
  notification_sent_at  timestamptz,
  notification_id       uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_drive_willingness_cycles_one_per_no UNIQUE (drive_id, cycle_no),
  CONSTRAINT cdc_drive_willingness_cycles_close_after_open CHECK (close_at IS NULL OR close_at > open_at)
);

CREATE INDEX IF NOT EXISTS idx_cdc_drive_willingness_cycles_drive
  ON public.cdc_drive_willingness_cycles (drive_id, cycle_no DESC);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_willingness_cycles_due
  ON public.cdc_drive_willingness_cycles (open_at)
  WHERE notification_sent = false;

COMMENT ON TABLE public.cdc_drive_willingness_cycles IS
  'One row per willingness opening of a CDC drive (initial + every reopen). The latest cycle is mirrored onto cdc_drives.willingness_window_open_at/_close_at. Notification per cycle is sent by the app when open_at passes (transition/reopen immediately, else cron /api/cron/cdc-willingness-cycles).';

ALTER TABLE public.cdc_drive_willingness_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdc_drive_willingness_cycles_read" ON public.cdc_drive_willingness_cycles;
CREATE POLICY "cdc_drive_willingness_cycles_read" ON public.cdc_drive_willingness_cycles
  FOR SELECT USING (public.is_cdc_staff() OR public.user_has_permission('cdc.drives.view'));
-- Writes: service role only (app routes gate on cdc.drives.edit).

-- 2. Per-cycle notification audit -------------------------------------------
ALTER TABLE public.cdc_drive_notification_log
  ADD COLUMN IF NOT EXISTS cycle_no integer NOT NULL DEFAULT 1;

ALTER TABLE public.cdc_drive_notification_log
  DROP CONSTRAINT IF EXISTS cdc_drive_notification_log_one_per_learner_type;
ALTER TABLE public.cdc_drive_notification_log
  ADD CONSTRAINT cdc_drive_notification_log_one_per_learner_type_cycle
  UNIQUE (drive_id, learner_id, notification_type, cycle_no);

-- 3. Backfill cycle 1 for drives that already opened willingness ------------
INSERT INTO public.cdc_drive_willingness_cycles
  (drive_id, cycle_no, open_at, close_at, status, notification_sent, notification_sent_at, notification_id, created_by, created_at)
SELECT
  d.id,
  1,
  COALESCE(d.willingness_window_open_at, t.transitioned_at, d.created_at),
  d.willingness_window_close_at,
  CASE WHEN d.status = 'willingness_open' THEN 'open' ELSE 'closed' END,
  n.id IS NOT NULL,
  n.created_at,
  n.id,
  d.created_by,
  COALESCE(t.transitioned_at, d.created_at)
FROM public.cdc_drives d
LEFT JOIN LATERAL (
  SELECT transitioned_at FROM public.cdc_drive_state_transitions s
  WHERE s.drive_id = d.id AND s.to_status = 'willingness_open'
  ORDER BY transitioned_at ASC LIMIT 1
) t ON true
LEFT JOIN LATERAL (
  SELECT id, created_at FROM public.notifications x
  WHERE x.idempotency_key LIKE 'cdc_drive_willingness_open:' || d.id::text || '%'
  ORDER BY created_at ASC LIMIT 1
) n ON true
WHERE d.status IN ('willingness_open', 'eligibility_locked', 'attendance_day', 'results_announced', 'closed')
  AND NOT EXISTS (SELECT 1 FROM public.cdc_drive_willingness_cycles c WHERE c.drive_id = d.id);
