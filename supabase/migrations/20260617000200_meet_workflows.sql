-- ============================================================================
-- Meeting Workflows — Module 4 (Calendly "Workflows" parity)
-- ============================================================================
-- Created: 2026-06-17
-- TIER-0 safe-additive: 3 new tables + RLS + indexes + 1 SECURITY DEFINER
-- enqueue function + 1 trigger ON meeting_bookings. No DML, no destructive DDL
-- on existing tables (the trigger is additive). Idempotent throughout
-- (CREATE IF NOT EXISTS / CREATE OR REPLACE / DROP-then-CREATE POLICY/TRIGGER).
--
-- Purpose
-- -------
-- Automated, lifecycle-tied communications for native meeting bookings:
--   "send a reminder 1 day before", "thank-you after", "notify host on cancel".
-- A workflow = (trigger, optional offset) + an ordered list of actions
-- (email / WhatsApp, each a template). When a booking's lifecycle event fires
-- (insert / status change), matching active workflows for that booking's HOST
-- are EXPANDED into per-booking RUN rows with a computed scheduled_for. A cron
-- runner (app/api/cron/meeting-workflows) then dispatches due runs idempotently.
--
-- Enqueue is done by a DB TRIGGER (NOT booking-route code) so the booking flow
-- stays untouched and every write path (route, server action, manual SQL) is
-- covered uniformly.
--
-- Pattern mirrors hr_automation_rule_fires (20260515000003): operational ledger
-- (meeting_workflow_runs) separate from the config rows (meeting_workflows +
-- meeting_workflow_actions). RLS follows the standard MyJKKN permission pattern
-- (is_super_admin() OR is_admin() OR user_has_permission('meetings.workflows.*')
-- OR host owns the row). New RPC locked from anon per CLAUDE.md standing rule.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: meeting_workflows  (the config — one per host-defined automation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_workflows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name              text NOT NULL,
  trigger           text NOT NULL
                      CHECK (trigger IN ('on_booked','before_meeting','after_meeting','on_cancelled','on_rescheduled')),
  -- Lead time (before_meeting) / lag time (after_meeting), in minutes. Ignored
  -- for the instant triggers (on_booked/on_cancelled/on_rescheduled => 0).
  offset_minutes    integer NOT NULL DEFAULT 0 CHECK (offset_minutes >= 0),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_workflows_name_not_empty CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.meeting_workflows IS
  'Meeting Workflows config — a host-defined automation: a lifecycle trigger (+ optional offset) whose actions fire against matching bookings. Module 4 / Calendly Workflows parity (2026-06-17).';
COMMENT ON COLUMN public.meeting_workflows.trigger IS
  'on_booked (booking created) | before_meeting (start_time - offset) | after_meeting (end_time + offset) | on_cancelled | on_rescheduled.';
COMMENT ON COLUMN public.meeting_workflows.offset_minutes IS
  'Lead/lag minutes. before_meeting => scheduled_for = start_time - offset; after_meeting => end_time + offset. Ignored (treated as 0) for instant triggers.';

-- ---------------------------------------------------------------------------
-- 2. Table: meeting_workflow_actions  (ordered communications per workflow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_workflow_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       uuid NOT NULL REFERENCES public.meeting_workflows(id) ON DELETE CASCADE,
  order_index       integer NOT NULL DEFAULT 0,
  channel           text NOT NULL CHECK (channel IN ('email','whatsapp')),
  subject           text,                              -- email only; null for whatsapp
  body_template     text NOT NULL,                     -- supports {{attendee_name}},{{start_time}},{{host_name}},{{cancel_url}}
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_workflow_actions_body_not_empty CHECK (length(trim(body_template)) > 0)
);

COMMENT ON TABLE public.meeting_workflow_actions IS
  'Ordered actions for a meeting workflow. Each action is one message on one channel (email|whatsapp) with a placeholder-aware template. Placeholders: {{attendee_name}}, {{start_time}}, {{host_name}}, {{cancel_url}}.';

CREATE INDEX IF NOT EXISTS idx_meeting_workflow_actions_workflow
  ON public.meeting_workflow_actions(workflow_id, order_index);

-- ---------------------------------------------------------------------------
-- 3. Table: meeting_workflow_runs  (operational ledger — one per enqueued send)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_workflow_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       uuid NOT NULL REFERENCES public.meeting_workflows(id) ON DELETE CASCADE,
  booking_id        uuid NOT NULL REFERENCES public.meeting_bookings(id) ON DELETE CASCADE,
  scheduled_for     timestamptz NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','sent','failed','skipped')),
  sent_at           timestamptz,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- One run per (workflow, booking) firing. on_booked/before/after fire exactly
  -- once per booking; on_cancelled/on_rescheduled re-enqueue would collide, so
  -- the enqueue fn uses ON CONFLICT DO NOTHING against this uniqueness.
  CONSTRAINT meeting_workflow_runs_unique UNIQUE (workflow_id, booking_id)
);

COMMENT ON TABLE public.meeting_workflow_runs IS
  'Operational ledger of scheduled workflow sends. status: pending -> sent | failed | skipped. The cron runner (app/api/cron/meeting-workflows) selects pending rows with scheduled_for <= now() and dispatches each workflow''s ordered actions. Idempotent via the unique (workflow_id, booking_id) + status gating.';

-- Runner hot path: WHERE status='pending' AND scheduled_for <= now().
CREATE INDEX IF NOT EXISTS idx_meeting_workflow_runs_status_scheduled
  ON public.meeting_workflow_runs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_meeting_workflow_runs_booking
  ON public.meeting_workflow_runs(booking_id);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
--    Standard MyJKKN pattern: super_admin / admin always; permission key for
--    custom roles; host owns their own workflows + runs.
--    Writes to runs are service_role only (cron + enqueue trigger run as
--    SECURITY DEFINER / service_role and bypass RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_workflows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_workflow_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_workflow_runs    ENABLE ROW LEVEL SECURITY;

-- ---- meeting_workflows -----------------------------------------------------
DROP POLICY IF EXISTS "meeting_workflows_select" ON public.meeting_workflows;
CREATE POLICY "meeting_workflows_select" ON public.meeting_workflows
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('meetings.workflows.view')
    OR host_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "meeting_workflows_insert" ON public.meeting_workflows;
CREATE POLICY "meeting_workflows_insert" ON public.meeting_workflows
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      host_profile_id = auth.uid()
      AND (user_has_permission('meetings.workflows.create')
           OR user_has_permission('meetings.workflows.view'))
    )
  );

DROP POLICY IF EXISTS "meeting_workflows_update" ON public.meeting_workflows;
CREATE POLICY "meeting_workflows_update" ON public.meeting_workflows
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (host_profile_id = auth.uid()
        AND (user_has_permission('meetings.workflows.edit')
             OR user_has_permission('meetings.workflows.view')))
  );

DROP POLICY IF EXISTS "meeting_workflows_delete" ON public.meeting_workflows;
CREATE POLICY "meeting_workflows_delete" ON public.meeting_workflows
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (host_profile_id = auth.uid()
        AND (user_has_permission('meetings.workflows.delete')
             OR user_has_permission('meetings.workflows.view')))
  );

-- ---- meeting_workflow_actions (scoped through the parent workflow) ----------
DROP POLICY IF EXISTS "meeting_workflow_actions_select" ON public.meeting_workflow_actions;
CREATE POLICY "meeting_workflow_actions_select" ON public.meeting_workflow_actions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('meetings.workflows.view')
    OR EXISTS (
      SELECT 1 FROM public.meeting_workflows w
      WHERE w.id = meeting_workflow_actions.workflow_id
        AND w.host_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "meeting_workflow_actions_write" ON public.meeting_workflow_actions;
CREATE POLICY "meeting_workflow_actions_write" ON public.meeting_workflow_actions
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.meeting_workflows w
      WHERE w.id = meeting_workflow_actions.workflow_id
        AND w.host_profile_id = auth.uid()
    )
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.meeting_workflows w
      WHERE w.id = meeting_workflow_actions.workflow_id
        AND w.host_profile_id = auth.uid()
    )
  );

-- ---- meeting_workflow_runs (read for owner/admin; writes via service_role) --
DROP POLICY IF EXISTS "meeting_workflow_runs_select" ON public.meeting_workflow_runs;
CREATE POLICY "meeting_workflow_runs_select" ON public.meeting_workflow_runs
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('meetings.workflows.view')
    OR EXISTS (
      SELECT 1 FROM public.meeting_workflows w
      WHERE w.id = meeting_workflow_runs.workflow_id
        AND w.host_profile_id = auth.uid()
    )
  );
-- No INSERT/UPDATE/DELETE policy for authenticated: the enqueue trigger and the
-- cron runner write as SECURITY DEFINER / service_role (RLS-bypassing).

-- ---------------------------------------------------------------------------
-- 5. GRANTs
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_workflows        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_workflow_actions TO authenticated;
GRANT SELECT                          ON public.meeting_workflow_runs    TO authenticated;
GRANT ALL ON public.meeting_workflows        TO service_role;
GRANT ALL ON public.meeting_workflow_actions TO service_role;
GRANT ALL ON public.meeting_workflow_runs    TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Enqueue function + trigger on meeting_bookings
--    AFTER INSERT OR UPDATE OF status: for each active workflow of the
--    booking's host whose trigger matches the lifecycle event, insert a
--    meeting_workflow_runs row with computed scheduled_for. ON CONFLICT
--    DO NOTHING keeps it idempotent (re-runs / repeat status flips).
--
--    SECURITY DEFINER so the insert into meeting_workflow_runs succeeds
--    regardless of who triggered the booking write (public booking route runs
--    as service_role already; a host-side status change runs as the host).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enqueue_meeting_workflow_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
BEGIN
  -- Decide which lifecycle event this DB event represents.
  IF (TG_OP = 'INSERT') THEN
    -- A brand-new booking. Only enqueue the "booked"/"before"/"after" family
    -- for a live booking; a booking inserted already-cancelled enqueues the
    -- cancellation family instead.
    IF (NEW.status = 'cancelled') THEN
      v_event := 'on_cancelled';
    ELSE
      v_event := 'on_booked';
    END IF;
  ELSE
    -- UPDATE OF status. Only act when status actually changed.
    IF (NEW.status IS NOT DISTINCT FROM OLD.status) THEN
      RETURN NEW;
    END IF;
    IF (NEW.status = 'cancelled') THEN
      v_event := 'on_cancelled';
    ELSIF (NEW.status = 'rescheduled') THEN
      v_event := 'on_rescheduled';
    ELSE
      -- e.g. -> 'confirmed' on a re-activation; treat as a (re)booking event.
      v_event := 'on_booked';
    END IF;
  END IF;

  -- on_booked expands into THREE trigger families (on_booked + the time-based
  -- before/after workflows) because those reminders are armed at booking time.
  -- on_cancelled / on_rescheduled expand only their own family (instant).
  INSERT INTO public.meeting_workflow_runs (workflow_id, booking_id, scheduled_for, status)
  SELECT
    w.id,
    NEW.id,
    CASE w.trigger
      WHEN 'on_booked'       THEN now()
      WHEN 'before_meeting'  THEN NEW.start_time - make_interval(mins => COALESCE(w.offset_minutes, 0))
      WHEN 'after_meeting'   THEN NEW.end_time   + make_interval(mins => COALESCE(w.offset_minutes, 0))
      WHEN 'on_cancelled'    THEN now()
      WHEN 'on_rescheduled'  THEN now()
    END,
    'pending'
  FROM public.meeting_workflows w
  WHERE w.host_profile_id = NEW.host_profile_id
    AND w.is_active = true
    AND (
      (v_event = 'on_booked'      AND w.trigger IN ('on_booked','before_meeting','after_meeting'))
      OR (v_event = 'on_cancelled'   AND w.trigger = 'on_cancelled')
      OR (v_event = 'on_rescheduled' AND w.trigger = 'on_rescheduled')
    )
  ON CONFLICT (workflow_id, booking_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enqueue_meeting_workflow_runs() IS
  'AFTER INSERT/UPDATE-OF-status trigger on meeting_bookings. Expands matching active meeting_workflows of the booking host into meeting_workflow_runs with a computed scheduled_for. SECURITY DEFINER; idempotent via ON CONFLICT. Module 4 (2026-06-17).';

-- Lock the function from anon/PUBLIC per CLAUDE.md standing rule. It is a
-- trigger function (not REST-callable), but the explicit revoke is the
-- audit-trail signal and defends against any future direct grant.
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_meeting_workflow_runs() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_enqueue_meeting_workflow_runs() TO service_role;

DROP TRIGGER IF EXISTS trg_enqueue_meeting_workflow_runs ON public.meeting_bookings;
CREATE TRIGGER trg_enqueue_meeting_workflow_runs
  AFTER INSERT OR UPDATE OF status ON public.meeting_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_enqueue_meeting_workflow_runs();

-- ---------------------------------------------------------------------------
-- 7. updated_at touch trigger for meeting_workflows (reuse platform helper if
--    present; otherwise inline). Best-effort — non-fatal if helper missing.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_meeting_workflows_updated_at ON public.meeting_workflows;
    EXECUTE 'CREATE TRIGGER trg_meeting_workflows_updated_at
             BEFORE UPDATE ON public.meeting_workflows
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 8. Reload PostgREST schema cache so the new tables/relationships are visible.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
