-- ============================================================================
-- General Events Module — Phase 1A, Migration 4 of 5
-- File: 20260417000004_events_phase_1a_triggers.sql
-- Purpose: 6 trigger functions for resource-first orchestration
-- Spec: specs/myjkkn-events-module-spec-v2-resource-first.md (decisions Q2, Q5, Q6, Q8, Q10)
-- Date: 2026-04-17
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TRIGGER 1: tr_event_approved_cascade_reservations
-- Fires: events.status → 'approved'
-- Action: For each linked resource_reservation, create resource_approvals rows
--         per resources.approval_config jsonb. Set event status to
--         'approved_awaiting_resources'.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_event_approved_cascade_reservations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res_record RECORD;
  approver_config JSONB;
  approver_step JSONB;
  step_idx INTEGER;
BEGIN
  -- Only fire on transition INTO 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN

    -- Iterate all reservations linked to this event (or its sessions)
    FOR res_record IN
      SELECT rr.id AS reservation_id, rr.resource_id, r.approval_config
      FROM resource_reservations rr
      JOIN resources r ON r.id = rr.resource_id
      WHERE (rr.event_id = NEW.id
             OR rr.session_id IN (SELECT id FROM event_sessions WHERE event_id = NEW.id))
        AND rr.status IN ('pending','requested')
    LOOP
      approver_config := COALESCE(res_record.approval_config, '[]'::jsonb);

      step_idx := 1;
      FOR approver_step IN SELECT * FROM jsonb_array_elements(approver_config)
      LOOP
        INSERT INTO resource_approvals (
          reservation_id, approver_user_id, approval_level, status, created_at
        )
        SELECT
          res_record.reservation_id,
          (approver_step->>'approver_user_id')::uuid,
          step_idx,
          'pending',
          now()
        WHERE (approver_step->>'approver_user_id') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM resource_approvals ra
            WHERE ra.reservation_id = res_record.reservation_id
              AND ra.approval_level = step_idx
          );

        step_idx := step_idx + 1;
      END LOOP;
    END LOOP;

    -- Promote event to awaiting-resources stage
    NEW.status_lifecycle_stage := 'approved_awaiting_resources';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_event_approved_cascade_reservations ON public.events;
CREATE TRIGGER tr_event_approved_cascade_reservations
  BEFORE UPDATE OF status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_approved_cascade_reservations();

-- ----------------------------------------------------------------------------
-- TRIGGER 2: tr_event_cancelled_cascade_release
-- Fires: events.status → 'cancelled'
-- Action: Release ALL linked reservations; set superseded_by; trigger waitlist promotion (handled by reservation trigger 5)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_event_cancelled_cascade_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    -- Cancel all reservations linked directly to event OR via its sessions
    UPDATE resource_reservations
    SET status = 'cancelled',
        cancellation_reason = COALESCE(NEW.supersede_reason, 'Event cancelled: ' || NEW.id::text),
        cancelled_at = now()
    WHERE (event_id = NEW.id
           OR session_id IN (SELECT id FROM event_sessions WHERE event_id = NEW.id))
      AND status NOT IN ('cancelled','rejected','completed');

    -- Cancel all event_human_roles too
    UPDATE event_human_roles
    SET assignment_status = 'cancelled',
        updated_at = now()
    WHERE event_id = NEW.id
      AND assignment_status IN ('invited','accepted');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_event_cancelled_cascade_release ON public.events;
CREATE TRIGGER tr_event_cancelled_cascade_release
  AFTER UPDATE OF status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_cancelled_cascade_release();

-- ----------------------------------------------------------------------------
-- TRIGGER 3: tr_reservation_approved_decrement_stock
-- Fires: resource_reservations.status → 'approved' (with quantity > 0)
-- Action: UPDATE resources SET current_stock_quantity -= reservation.quantity
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_reservation_approved_decrement_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (OLD.status IS NULL OR OLD.status <> 'approved')
     AND COALESCE(NEW.quantity, 0) > 0 THEN
    UPDATE resources
    SET current_stock_quantity = COALESCE(current_stock_quantity, initial_stock_quantity, 0) - NEW.quantity
    WHERE id = NEW.resource_id
      AND current_stock_quantity IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reservation_approved_decrement_stock ON public.resource_reservations;
CREATE TRIGGER tr_reservation_approved_decrement_stock
  AFTER UPDATE OF status ON public.resource_reservations
  FOR EACH ROW EXECUTE FUNCTION public.fn_reservation_approved_decrement_stock();

-- ----------------------------------------------------------------------------
-- TRIGGER 4: tr_reservation_cancelled_increment_stock
-- Fires: resource_reservations.status → 'cancelled' (was 'approved' with quantity > 0)
-- Action: UPDATE resources SET current_stock_quantity += reservation.quantity
-- Also: Promote top of waitlist if any
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_reservation_cancelled_restore_stock_and_waitlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_waitlist_id UUID;
BEGIN
  -- Restore stock if a previously-approved reservation is cancelled
  IF NEW.status = 'cancelled'
     AND OLD.status = 'approved'
     AND COALESCE(OLD.quantity, 0) > 0 THEN
    UPDATE resources
    SET current_stock_quantity = COALESCE(current_stock_quantity, 0) + OLD.quantity
    WHERE id = OLD.resource_id;
  END IF;

  -- Promote top of waitlist for this reservation (if it's a single-resource booking)
  IF NEW.status = 'cancelled' THEN
    SELECT id INTO next_waitlist_id
    FROM event_waitlist
    WHERE resource_reservation_id = NEW.id
      AND status = 'waiting'
    ORDER BY position ASC
    LIMIT 1;

    IF next_waitlist_id IS NOT NULL THEN
      UPDATE event_waitlist
      SET status = 'promoted', promoted_at = now()
      WHERE id = next_waitlist_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_reservation_cancelled_restore_stock_and_waitlist ON public.resource_reservations;
CREATE TRIGGER tr_reservation_cancelled_restore_stock_and_waitlist
  AFTER UPDATE OF status ON public.resource_reservations
  FOR EACH ROW EXECUTE FUNCTION public.fn_reservation_cancelled_restore_stock_and_waitlist();

-- ----------------------------------------------------------------------------
-- TRIGGER 5: tr_emergency_event_override
-- Fires: events.is_emergency = true on INSERT or UPDATE
-- Action: Bump conflicting reservations + log entry into events_emergency_overrides_log
-- Note: Maintenance bypass is checked at app layer (not enforced here to avoid surprises)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_emergency_event_override()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bumped_ids UUID[];
BEGIN
  IF NEW.is_emergency = true
     AND (TG_OP = 'INSERT' OR OLD.is_emergency IS DISTINCT FROM true) THEN

    -- Find conflicting reservations (overlapping time windows on same resources)
    -- and bump them. Only bumps reservations that are pending/approved (not active check-out).
    WITH this_event_resources AS (
      SELECT DISTINCT rr.resource_id, rr.start_time, rr.end_time
      FROM resource_reservations rr
      WHERE rr.event_id = NEW.id
    ),
    bumped AS (
      UPDATE resource_reservations rr
      SET status = 'cancelled',
          cancellation_reason = 'Bumped by emergency event ' || NEW.id::text,
          cancelled_at = now()
      FROM this_event_resources tr
      WHERE rr.resource_id = tr.resource_id
        AND rr.event_id IS DISTINCT FROM NEW.id
        AND rr.status IN ('pending','approved')
        AND tstzrange(rr.start_time, rr.end_time) && tstzrange(tr.start_time, tr.end_time)
        AND rr.checked_out_at IS NULL
      RETURNING rr.id
    )
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO bumped_ids FROM bumped;

    -- Audit log entry
    INSERT INTO events_emergency_overrides_log (
      event_id, overridden_by, override_reason, bumped_reservation_ids
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.proposed_by, NEW.created_by),
      COALESCE(NEW.emergency_reason, 'No reason provided'),
      bumped_ids
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_emergency_event_override ON public.events;
CREATE TRIGGER tr_emergency_event_override
  AFTER INSERT OR UPDATE OF is_emergency ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.fn_emergency_event_override();

-- ----------------------------------------------------------------------------
-- TRIGGER 6: tr_caretaker_escalate_silent_approvals (cron-style helper function)
-- This is not a row trigger — it's a function called by a cron job (or on-demand)
-- to escalate resource_approvals past their escalate_after_hours threshold.
-- Phase 1A delivers the function; cron wiring happens in Phase 1B.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_escalate_silent_resource_approvals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  escalated_count INTEGER := 0;
  ra_record RECORD;
  escalate_hours INTEGER;
  escalate_to_user UUID;
BEGIN
  FOR ra_record IN
    SELECT ra.id AS approval_id,
           ra.reservation_id,
           ra.approver_user_id,
           ra.created_at,
           r.approval_config,
           r.caretaker_user_id
    FROM resource_approvals ra
    JOIN resource_reservations rr ON rr.id = ra.reservation_id
    JOIN resources r ON r.id = rr.resource_id
    WHERE ra.status = 'pending'
      AND ra.escalated_to IS NULL
      AND ra.acted_at IS NULL
  LOOP
    escalate_hours := COALESCE(
      (ra_record.approval_config->>'escalate_after_hours')::integer,
      48
    );

    IF ra_record.created_at < (now() - (escalate_hours || ' hours')::interval) THEN
      -- Escalate to caretaker as fallback (Phase 1B will resolve manager via custom_roles)
      escalate_to_user := COALESCE(
        (ra_record.approval_config->>'escalate_to_user_id')::uuid,
        ra_record.caretaker_user_id
      );

      IF escalate_to_user IS NOT NULL AND escalate_to_user <> ra_record.approver_user_id THEN
        UPDATE resource_approvals
        SET escalated_to = escalate_to_user,
            escalated_at = now(),
            escalation_reason = format('Auto-escalated after %s hours of silence', escalate_hours)
        WHERE id = ra_record.approval_id;

        escalated_count := escalated_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN escalated_count;
END;
$$;

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.fn_escalate_silent_resource_approvals();
-- DROP TRIGGER IF EXISTS tr_emergency_event_override ON public.events;
-- DROP FUNCTION IF EXISTS public.fn_emergency_event_override();
-- DROP TRIGGER IF EXISTS tr_reservation_cancelled_restore_stock_and_waitlist ON public.resource_reservations;
-- DROP FUNCTION IF EXISTS public.fn_reservation_cancelled_restore_stock_and_waitlist();
-- DROP TRIGGER IF EXISTS tr_reservation_approved_decrement_stock ON public.resource_reservations;
-- DROP FUNCTION IF EXISTS public.fn_reservation_approved_decrement_stock();
-- DROP TRIGGER IF EXISTS tr_event_cancelled_cascade_release ON public.events;
-- DROP FUNCTION IF EXISTS public.fn_event_cancelled_cascade_release();
-- DROP TRIGGER IF EXISTS tr_event_approved_cascade_reservations ON public.events;
-- DROP FUNCTION IF EXISTS public.fn_event_approved_cascade_reservations();
