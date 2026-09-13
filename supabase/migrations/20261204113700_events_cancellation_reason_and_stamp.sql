-- Events — an event can be cancelled, and the row records why (2026-09-13)
--
-- FILE ONLY / NOT APPLIED — the operator applies this at merge. Nothing here was
-- run against production by the author.
--
-- ─── WHAT WAS THERE ──────────────────────────────────────────────────────────
--
-- `cancelled` has always been a legal value of events.status (it appears in the
-- shared EVENT_STATUS_TRANSITIONS map, and fn_event_cancelled_cascade_release
-- has fired on it since 20260417000004). What did not exist was any way for a
-- general event to REACH it: GENERAL_EVENT_STATUS_TRANSITIONS allowed only
-- draft <-> live, so "cancelling" an event in practice meant pushing it back to
-- Draft. That hides the public page and closes registration — and tells the
-- people already registered nothing at all, because the row carries no record
-- that anything was called off.
--
-- ─── WHAT THIS ADDS ──────────────────────────────────────────────────────────
--
-- Three columns and one BEFORE UPDATE trigger:
--
--   cancellation_reason  the organiser's own words. REQUIRED on the transition
--                        into 'cancelled'. It is PUBLIC — /p/event/[id]/register
--                        prints it to whoever follows the registration link.
--   cancelled_at         when. Stamped here, never sent by a client.
--   cancelled_by         who, from auth.uid(). Stamped here, never sent by a
--                        client — a browser that can update the row could
--                        otherwise name somebody else as the canceller.
--
-- THE REQUIREMENT LIVES IN A TRIGGER, NOT A CHECK CONSTRAINT, and that is
-- deliberate. A table CHECK ("status = 'cancelled' implies a reason") is
-- evaluated against EVERY existing row at ADD CONSTRAINT time, so any event that
-- already sits in 'cancelled' from before this migration would either fail the
-- apply or force a NOT VALID constraint that then means nothing. The trigger
-- fires only on the TRANSITION into 'cancelled' — legacy rows are left exactly
-- as they are, and are never retroactively invalid.
--
-- WHAT IT DOES NOT DO:
--
--   · It does not touch events_registrations. A cancelled event KEEPS its
--     registrant list — that list is who has to be told.
--   · It adds no permission check. Cancelling is an UPDATE on `events`, already
--     gated by events_auth_update (super admin / creator / legacy same-
--     institution) and events_incharge_update. A cancel-specific rule here would
--     be a second guard that drifts from the first.
--   · It does not un-cancel anything, and it does not clear the three columns
--     when an event is reinstated. They stay as the record of what happened;
--     every reader keys on status = 'cancelled', so a dormant reason is never
--     shown. A second cancellation overwrites all three.
--
-- ─── ALREADY TRUE, AND WORTH KNOWING BEFORE YOU APPLY ────────────────────────
--
-- tr_event_cancelled_cascade_release (20260417000004) ALREADY fires when
-- events.status becomes 'cancelled': it cancels every linked
-- resource_reservations row and moves every invited/accepted event_human_roles
-- assignment to 'cancelled'. That behaviour is untouched here, but it is now
-- reachable from the UI for the first time. Note that it stamps the released
-- reservations with NEW.supersede_reason, a DIFFERENT column from the one added
-- here; aligning the two is left alone on purpose (it would mean replacing a
-- shared SECURITY DEFINER function for a cosmetic gain).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
-- Additive and idempotent. No FK on cancelled_by, mirroring created_by on the
-- same table: it holds an auth.uid(), and the row must outlive the account.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by        UUID;

COMMENT ON COLUMN public.events.cancellation_reason IS
  'Why the event was called off, in the organiser''s words. PUBLIC — printed on '
  '/p/event/[id]/register to anyone holding the registration link. Required by '
  'trg_events_stamp_cancellation on the move into status = ''cancelled''. Kept, '
  'not cleared, if the event is later reinstated.';

COMMENT ON COLUMN public.events.cancelled_at IS
  'When the event was cancelled. Stamped by trg_events_stamp_cancellation; never accepted from a client.';

COMMENT ON COLUMN public.events.cancelled_by IS
  'auth.uid() of whoever cancelled the event. Stamped by trg_events_stamp_cancellation; never accepted '
  'from a client, so it names the actual actor rather than whoever the browser claimed. NULL for a '
  'service-role or migration write, which has no auth.uid(). No FK, like created_by.';

-- ---------------------------------------------------------------------------
-- 2. The stamp: reason required, actor and moment recorded
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER + SET search_path, matching the sibling guard
-- fn_guard_event_privileged_fields on this same table. EXECUTE is revoked from
-- anon and PUBLIC in this file (PostgreSQL does not check EXECUTE when a trigger
-- fires, so the revoke costs nothing and closes the direct-call door that
-- Supabase's ALTER DEFAULT PRIVILEGES would otherwise leave open to anon).

CREATE OR REPLACE FUNCTION public.fn_events_stamp_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the TRANSITION into cancelled. An UPDATE on a row that is already
  -- cancelled (an edit, a visibility flip) must not re-stamp the moment, and a
  -- legacy row that arrived at 'cancelled' before this migration must never be
  -- forced to produce a reason it does not have.
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    IF NEW.cancellation_reason IS NULL OR btrim(NEW.cancellation_reason) = '' THEN
      RAISE EXCEPTION
        'Give a reason for cancelling event % — the people registered will be shown it', OLD.id
        USING ERRCODE = '23514';
    END IF;

    NEW.cancellation_reason := btrim(NEW.cancellation_reason);
    NEW.cancelled_at        := now();
    -- NULL for service-role / migration / cron writes, which have no auth.uid().
    NEW.cancelled_by        := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_stamp_cancellation() FROM anon, PUBLIC;

COMMENT ON FUNCTION public.fn_events_stamp_cancellation() IS
  'BEFORE UPDATE on events. On the move into status = ''cancelled'': refuses a blank cancellation_reason '
  '(23514) and stamps cancelled_at = now(), cancelled_by = auth.uid(). Ignores updates to a row that is '
  'already cancelled, so legacy cancelled rows are never made invalid. Adds no permission check — '
  'events_auth_update / events_incharge_update remain the only gate.';

DROP TRIGGER IF EXISTS trg_events_stamp_cancellation ON public.events;
CREATE TRIGGER trg_events_stamp_cancellation
  BEFORE UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_stamp_cancellation();
