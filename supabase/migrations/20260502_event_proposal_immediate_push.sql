-- =====================================================================
-- Migration: 20260502_event_proposal_immediate_push.sql
-- Purpose:   Restore spec fidelity for chat-bypass-workflow-gravity §5.2.
--            "Push notification to Director immediately, NOT waiting for
--            daily digest." Currently `fn_generate_event_proposal_items()`
--            runs in dashboard orchestrator with 4-hour grace window.
--            Spec §5.4 Test #2 mandated push within 60s of submit.
--
-- Pattern:   AFTER INSERT trigger on event_proposals → calls existing
--            fn_create_dashboard_work_item() → inserts user_notifications
--            row → existing trg_notify_push_on_queue_insert fires →
--            existing /api/dashboard/push-send sends web push to
--            Director's iOS within seconds.
--
-- Idempotency: 'event_proposal_immediate:<id>' is distinct from the 4-hour
--            generator's 'event_proposal:<id>:<DATE>' key, so both can
--            coexist without dup notifications. The 4-hour generator stays
--            intact as a fallback for any proposals that miss the immediate
--            trigger (e.g. backfill, race conditions).
--
-- Reference: specs/chat-bypass-workflow-gravity.md §5.2-§5.4
--            .claude/events-propose-audit.md (audit criterion 4 = FAIL)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_event_proposal_notify_immediate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE
  v_target UUID;
  v_priority TEXT;
  v_deadline_hours INT;
BEGIN
  -- Resolve Director (institution-scoped super_admin with global fallback).
  -- Mirrors the pattern used by fn_generate_event_proposal_items.
  v_target := fn_resolve_dashboard_target(NEW.institution_id);
  IF v_target IS NULL THEN
    RAISE WARNING '[fn_event_proposal_notify_immediate] No dashboard target for institution %, skipping push for proposal %',
      NEW.institution_id, NEW.id;
    RETURN NEW;
  END IF;

  -- Priority + deadline mirror the existing 4-hour generator's logic.
  IF NEW.event_date IS NOT NULL AND NEW.event_date <= CURRENT_DATE + INTERVAL '3 days' THEN
    v_priority := 'urgent';
    v_deadline_hours := 4;
  ELSE
    v_priority := 'high';
    v_deadline_hours := 24;
  END IF;

  -- Insert work item. The downstream pipeline:
  --   notifications row → user_notifications row →
  --   trg_notify_push_on_queue_insert fires →
  --   pg_net POST /api/dashboard/push-send → web-push to Director.
  PERFORM fn_create_dashboard_work_item(
    'dashboard:approval',
    v_priority,
    'Event proposal: ' || NEW.title,
    'Venue: ' || COALESCE(NEW.venue, 'TBD') ||
      ' | Date: ' || COALESCE(NEW.event_date::text, 'TBD') ||
      ' | From: ' || COALESCE(NEW.sender_email, 'unknown'),
    jsonb_build_object(
      'proposal_id', NEW.id,
      'title', NEW.title,
      'institution_id', NEW.institution_id,
      'url', '/events/propose/' || NEW.id::text || '/status'
    ),
    v_target,
    'event_proposal_immediate:' || NEW.id::text,
    v_deadline_hours
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Per memory rule feedback_silent_exception_swallow_pattern.md:
  -- log the error explicitly so silent-failure-auditor can detect it.
  -- Do NOT block the INSERT — the 4-hour fallback generator catches it.
  RAISE WARNING '[fn_event_proposal_notify_immediate] proposal_id=% institution=% error=%',
    NEW.id, NEW.institution_id, SQLERRM;
  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.fn_event_proposal_notify_immediate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_event_proposal_notify_immediate() TO service_role;

-- Drop-and-recreate is safe; the function name is unique to this migration.
DROP TRIGGER IF EXISTS trg_event_proposal_notify_immediate ON public.event_proposals;
CREATE TRIGGER trg_event_proposal_notify_immediate
  AFTER INSERT ON public.event_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_proposal_notify_immediate();

COMMENT ON FUNCTION public.fn_event_proposal_notify_immediate() IS
  'Sends immediate Director push when an event proposal is submitted. '
  'Restores spec fidelity for chat-bypass-workflow-gravity §5.2 Test #2. '
  'Uses idempotency key event_proposal_immediate:<id> (distinct from '
  '4-hour generator''s event_proposal:<id>:<DATE>). Existing daily '
  'fn_generate_event_proposal_items() remains as fallback for any race.';

COMMENT ON TRIGGER trg_event_proposal_notify_immediate ON public.event_proposals IS
  'PR-A of chat-bypass-workflow-gravity audit remediation (2026-05-02). '
  'Replaces 4-hour grace window with on-insert push to Director.';
