-- ============================================================================
-- MODULE 9 — Custom Webhooks for Universal Booking (Calendly parity)
-- ============================================================================
-- Created: 2026-06-17
-- TIER-0 safe-additive: two NEW tables + RLS + indexes + ONE SECURITY DEFINER
-- function + ONE AFTER trigger on meeting_bookings. No DDL on existing tables,
-- no DML. Fully idempotent (CREATE IF NOT EXISTS / DROP-then-CREATE).
--
-- Purpose
-- -------
-- A host registers webhook URLs + the booking lifecycle events they care about.
-- When a booking is created / cancelled / rescheduled, MyJKKN POSTs a signed
-- JSON payload to each matching active webhook so external systems (CRMs,
-- Zapier-style automations, the host's own backend) get the meeting in real
-- time. This is the Calendly "Create custom webhooks to get meeting information
-- in real-time" feature.
--
-- Architecture — mirror the workflows-engine pattern (DB-trigger enqueue +
-- cron dispatcher), NOT inline HTTP from the booking transaction:
--
--   meeting_bookings  ──AFTER INSERT/UPDATE──▶  fn_enqueue_meeting_webhook_deliveries()
--        (booking)                                       │
--                                                        ▼
--                                            meeting_webhook_deliveries (status='pending')
--                                                        │
--                                   /api/cron/meeting-webhooks  (every 2-5 min)
--                                                        │
--                                            POST target_url  +  X-MyJKKN-Signature
--                                                        │
--                                            mark sent / failed + response_code
--
-- Why a trigger only ENQUEUES (never calls out): Postgres cannot reliably make
-- outbound HTTP inside a transaction, and a slow/dead receiver must never block
-- (or roll back) a booking write. The trigger does pure, fast row inserts; the
-- cron worker owns all network I/O and retry. Webhook failures are isolated
-- from the booking path entirely.
--
-- Event derivation (the substrate subtlety): a RESCHEDULE on meeting_bookings
-- does NOT change `status` — it keeps status='confirmed' and moves start_time
-- (native-scheduling-service.rescheduleBooking). So we cannot key the trigger on
-- `UPDATE OF status` alone or booking.rescheduled would silently never fire.
-- We fire on AFTER INSERT OR UPDATE and derive the event from the column delta:
--   INSERT, status='confirmed'                       -> booking.created
--   UPDATE, status confirmed -> cancelled            -> booking.cancelled
--   UPDATE, status unchanged but start_time moved    -> booking.rescheduled
--
-- Standing rule (2026-04-29): every config decision = a row + admin UI. Here the
-- webhook registrations ARE the config rows (host-owned, self-service via the
-- /meetings/webhooks page) and the deliveries table is the operational ledger.
--
-- RLS / anon: per CLAUDE.md, the new SECURITY DEFINER function explicitly
-- REVOKEs EXECUTE FROM anon, PUBLIC (Supabase's default ALTER DEFAULT PRIVILEGES
-- grants anon EXECUTE on every new function otherwise). The function is only
-- ever invoked by the trigger (definer context), not by clients.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table: meeting_webhooks  — the host-owned webhook registrations (config).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_webhooks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name              text NOT NULL,
  target_url        text NOT NULL,
  -- Shared secret used to HMAC-SHA256 sign each delivery body. DB-generated so a
  -- host never has to invent one; surfaced once in the UI so they can configure
  -- their receiver's verification.
  -- pgcrypto lives in the `extensions` schema on Supabase prod (not in the
  -- default search_path), so a bare gen_random_bytes() fails with 42883 at
  -- apply time even though CI (where pgcrypto is on the path) passed. Schema-
  -- qualify it. Fixed 2026-06-19 during the migration apply (was bare on merge).
  signing_secret    text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  events            text[] NOT NULL
                      DEFAULT '{booking.created,booking.cancelled,booking.rescheduled}',
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT meeting_webhooks_name_not_empty   CHECK (length(trim(name)) > 0),
  CONSTRAINT meeting_webhooks_url_is_http      CHECK (target_url ~* '^https?://'),
  CONSTRAINT meeting_webhooks_events_not_empty CHECK (cardinality(events) > 0)
);

COMMENT ON TABLE public.meeting_webhooks IS
  'M9 — host-owned webhook registrations for the Universal Booking module. One row per (host, target URL). The host picks which booking lifecycle events trigger a POST. signing_secret signs each delivery (HMAC-SHA256). Created 2026-06-17.';
COMMENT ON COLUMN public.meeting_webhooks.events IS
  'Subset of {booking.created, booking.cancelled, booking.rescheduled}. A delivery is only enqueued when the fired event is contained here.';
COMMENT ON COLUMN public.meeting_webhooks.signing_secret IS
  'Shared secret. The dispatcher computes X-MyJKKN-Signature = hex(HMAC-SHA256(signing_secret, raw_body)). Receivers recompute to verify authenticity. Shown once in the admin UI.';

CREATE INDEX IF NOT EXISTS idx_meeting_webhooks_host
  ON public.meeting_webhooks(host_profile_id);

-- Enqueue hot path: "active webhooks of this host whose events contain X".
CREATE INDEX IF NOT EXISTS idx_meeting_webhooks_host_active
  ON public.meeting_webhooks(host_profile_id)
  WHERE is_active;

-- ---------------------------------------------------------------------------
-- 2. Table: meeting_webhook_deliveries — operational ledger of POST attempts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.meeting_webhook_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    uuid NOT NULL REFERENCES public.meeting_webhooks(id) ON DELETE CASCADE,
  booking_id    uuid REFERENCES public.meeting_bookings(id) ON DELETE SET NULL,
  event         text NOT NULL,
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sent', 'failed')),
  attempts      integer NOT NULL DEFAULT 0,
  response_code integer,
  error         text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- Idempotency key: the trigger inserts at most one delivery per
  -- (webhook, booking, event). A booking can be created once, rescheduled many
  -- times, cancelled once — reschedule re-fires are deliberately deduped to one
  -- pending row per webhook (ON CONFLICT DO NOTHING below). If a host wants
  -- per-reschedule deliveries, that is a future enhancement, not v1.
  CONSTRAINT meeting_webhook_deliveries_unique_fire
    UNIQUE (webhook_id, booking_id, event)
);

COMMENT ON TABLE public.meeting_webhook_deliveries IS
  'M9 — one row per webhook delivery attempt. status pending -> sent|failed, driven by /api/cron/meeting-webhooks. payload is the exact JSON POSTed. Created 2026-06-17.';

-- Cron picker hot path: pending rows whose scheduled_for has arrived.
CREATE INDEX IF NOT EXISTS idx_meeting_webhook_deliveries_due
  ON public.meeting_webhook_deliveries(status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_meeting_webhook_deliveries_webhook
  ON public.meeting_webhook_deliveries(webhook_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
--    Pattern mirrors meeting_bookings (host-owns-own) + the standardized
--    is_super_admin/is_admin bypass + user_has_permission('meetings.webhooks.*').
--    The cron dispatcher and the trigger run as service_role / definer and
--    bypass RLS, so these policies are purely for the admin UI reads/writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.meeting_webhooks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_webhook_deliveries  ENABLE ROW LEVEL SECURITY;

-- ---- meeting_webhooks: host owns own; admins + meetings.webhooks.view see -----
DROP POLICY IF EXISTS "meeting_webhooks_select" ON public.meeting_webhooks;
CREATE POLICY "meeting_webhooks_select"
  ON public.meeting_webhooks FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR host_profile_id = auth.uid()
    OR user_has_permission('meetings.webhooks.view')
  );

DROP POLICY IF EXISTS "meeting_webhooks_insert" ON public.meeting_webhooks;
CREATE POLICY "meeting_webhooks_insert"
  ON public.meeting_webhooks FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (host_profile_id = auth.uid()
        AND user_has_permission('meetings.webhooks.manage'))
    -- A host with the base meetings module (no explicit webhooks.manage yet)
    -- can still register webhooks for THEMSELVES; cross-host inserts are blocked.
    OR host_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "meeting_webhooks_update" ON public.meeting_webhooks;
CREATE POLICY "meeting_webhooks_update"
  ON public.meeting_webhooks FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR host_profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "meeting_webhooks_delete" ON public.meeting_webhooks;
CREATE POLICY "meeting_webhooks_delete"
  ON public.meeting_webhooks FOR DELETE USING (
    is_super_admin()
    OR is_admin()
    OR host_profile_id = auth.uid()
  );

-- ---- meeting_webhook_deliveries: read-only for the owning host + admins ------
-- Writes happen only via the trigger (definer) and the cron (service_role).
DROP POLICY IF EXISTS "meeting_webhook_deliveries_select" ON public.meeting_webhook_deliveries;
CREATE POLICY "meeting_webhook_deliveries_select"
  ON public.meeting_webhook_deliveries FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('meetings.webhooks.view')
    OR EXISTS (
      SELECT 1 FROM public.meeting_webhooks w
      WHERE w.id = meeting_webhook_deliveries.webhook_id
        AND w.host_profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. GRANTs — authenticated reads/writes via RLS; service_role bypasses.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_webhooks           TO authenticated;
GRANT SELECT                         ON public.meeting_webhook_deliveries TO authenticated;
GRANT ALL ON public.meeting_webhooks           TO service_role;
GRANT ALL ON public.meeting_webhook_deliveries TO service_role;

-- ---------------------------------------------------------------------------
-- 5. updated_at touch trigger on meeting_webhooks (reuse generic setter if it
--    exists; otherwise define a tiny local one). The native scheduling module
--    ships tg_native_scheduling_set_updated_at — reuse it to avoid a duplicate.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'tg_native_scheduling_set_updated_at'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    DROP TRIGGER IF EXISTS tg_meeting_webhooks_updated ON public.meeting_webhooks;
    CREATE TRIGGER tg_meeting_webhooks_updated
      BEFORE UPDATE ON public.meeting_webhooks
      FOR EACH ROW EXECUTE FUNCTION public.tg_native_scheduling_set_updated_at();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Enqueue function + trigger on meeting_bookings.
--    SECURITY DEFINER so it can INSERT into the deliveries table regardless of
--    who/what caused the booking write (public booking flow = service_role,
--    host cancel = authenticated). Idempotent inserts via the unique key.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enqueue_meeting_webhook_deliveries()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event    text;
  v_payload  jsonb;
  v_host     uuid;
BEGIN
  -- ---- Derive the lifecycle event from the row delta ----------------------
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'confirmed' THEN
      v_event := 'booking.created';
    ELSE
      -- A booking inserted directly in a non-confirmed state is not a
      -- "created" lifecycle event a host registered for. Nothing to enqueue.
      RETURN NEW;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.status = 'confirmed' AND NEW.status = 'cancelled') THEN
      v_event := 'booking.cancelled';
    ELSIF (NEW.status = 'confirmed'
           AND OLD.status = 'confirmed'
           AND NEW.start_time IS DISTINCT FROM OLD.start_time) THEN
      -- Reschedule: status stays confirmed, start_time moved.
      v_event := 'booking.rescheduled';
    ELSE
      -- Any other update (e.g. the updated_at touch, video_url backfill,
      -- google_event_id stamp) is not a lifecycle event. Skip.
      RETURN NEW;
    END IF;

  ELSE
    RETURN NEW;
  END IF;

  v_host := NEW.host_profile_id;

  -- ---- Build the payload once (reused per matching webhook) ----------------
  v_payload := jsonb_build_object(
    'event', v_event,
    'created_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'booking', jsonb_build_object(
      'id', NEW.id,
      'uid', NEW.uid,
      'meeting_type_id', NEW.meeting_type_id,
      'host_profile_id', NEW.host_profile_id,
      'institution_id', NEW.institution_id,
      'attendee_name', NEW.attendee_name,
      'attendee_email', NEW.attendee_email,
      'attendee_phone', NEW.attendee_phone,
      'start_time', NEW.start_time,
      'end_time', NEW.end_time,
      'previous_start_time', NEW.previous_start_time,
      'status', NEW.status,
      'source', NEW.source,
      'video_url', NEW.video_url,
      'google_event_id', NEW.google_event_id,
      'cancellation_reason', NEW.cancellation_reason
    )
  );

  -- ---- Enqueue one delivery per matching active webhook --------------------
  -- ON CONFLICT (webhook_id, booking_id, event) DO NOTHING makes the whole
  -- operation idempotent: a duplicate firing (e.g. a retried UPDATE) never
  -- double-enqueues. Reschedule of an already-rescheduled booking is deduped to
  -- one pending row per webhook by design (see ledger comment above).
  INSERT INTO public.meeting_webhook_deliveries
    (webhook_id, booking_id, event, payload)
  SELECT w.id, NEW.id, v_event, v_payload
  FROM public.meeting_webhooks w
  WHERE w.host_profile_id = v_host
    AND w.is_active
    AND v_event = ANY (w.events)
  ON CONFLICT (webhook_id, booking_id, event) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_enqueue_meeting_webhook_deliveries() IS
  'M9 — AFTER INSERT/UPDATE on meeting_bookings: derives booking.created / .cancelled / .rescheduled from the row delta and enqueues a pending delivery per matching active webhook. Definer; idempotent via unique (webhook_id, booking_id, event).';

-- Lock the function from anon (Supabase default-grant defense — CLAUDE.md).
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_meeting_webhook_deliveries() FROM anon, PUBLIC;
-- (Not granted to authenticated either — it is trigger-invoked only, never RPC.)

DROP TRIGGER IF EXISTS tg_enqueue_meeting_webhooks ON public.meeting_bookings;
CREATE TRIGGER tg_enqueue_meeting_webhooks
  AFTER INSERT OR UPDATE ON public.meeting_bookings
  FOR EACH ROW EXECUTE FUNCTION public.fn_enqueue_meeting_webhook_deliveries();

-- ---------------------------------------------------------------------------
-- 7. Reload PostgREST schema cache so the new tables are immediately visible
--    to the REST/admin reads.
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
