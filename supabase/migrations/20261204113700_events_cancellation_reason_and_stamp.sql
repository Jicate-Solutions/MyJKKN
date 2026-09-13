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
--   cancellation_reason  the organiser's own words, when there are any.
--                        INTERNAL, not public — Director's ruling, 13 Sep:
--                        "short public line, full reason kept inside".
--                        /p/event/[id]/register prints a STANDARD cancellation
--                        notice and an address to write to; it does not read
--                        this column at all. The words are shown in full on the
--                        /events/[id] console — read by signed-in users at the
--                        institution who can open the event, a wider room than
--                        the organiser's own team. NULLABLE.
--   cancelled_at         when. Stamped here, never sent by a client.
--   cancelled_by         who, from auth.uid(). Stamped here, never sent by a
--                        client — a browser that can update the row could
--                        otherwise name somebody else as the canceller.
--
-- THE REASON IS NOT REQUIRED AT THE TABLE, ON PURPOSE. `events` is shared by
-- general events, marathons, tournaments and inductions, and flows outside this
-- feature already move a row to 'cancelled' with no reason — they have never had
-- one to give. Any table-wide rule (a CHECK, or a RAISE in this trigger) would
-- turn every one of those into a runtime failure the moment this file is
-- applied. So the requirement is scoped to the ONE path that has somewhere to
-- type a reason: the cancel dialog on /events/[id] and
-- GeneralEventService.cancel(), both of which refuse a blank one. See the long
-- note above the function in section 2.
--
-- A CHECK constraint would have been wrong for a second reason as well: it is
-- evaluated against EVERY existing row at ADD CONSTRAINT time, so any event
-- already sitting in 'cancelled' would either fail the apply or force a
-- NOT VALID constraint that then means nothing. (Read-only production check,
-- 2026-09-13: 55 events — 27 live, 23 draft, 5 archived, and none cancelled. The
-- trigger fires only on the TRANSITION, so the count does not matter either way.)
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
-- assignment to 'cancelled'. Releasing a reservation in turn restores stock and
-- PROMOTES whoever is next on that resource's waitlist, so the room can be taken
-- by someone else in the same transaction — and none of it is undone by moving
-- the event back to 'live'. That behaviour is untouched here, but it is now
-- reachable from the UI for the first time, so the cancel dialog on /events/[id]
-- states it before the organiser commits, and the console banner repeats it
-- afterwards. Note that it stamps the released
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
  'Why the event was called off, in the organiser''s words. INTERNAL, NOT PUBLIC (Director''s ruling, '
  '13 Sep 2026): /p/event/[id]/register prints a standard cancellation notice and does not read this '
  'column; the words are shown in full only on the /events/[id] console, which is read by signed-in '
  'users at the institution who can open the event — a wider room than the organiser''s own team. Do not '
  'publish this column through an anon-readable view. NULLABLE: it is required by the '
  'cancel dialog on /events/[id] and by GeneralEventService.cancel(), not by the table, because other '
  'flows on this shared table cancel an event without a reason. Normalised (trimmed, blank to NULL) by '
  'trg_events_stamp_cancellation. Kept, not cleared, if the event is later reinstated.';

COMMENT ON COLUMN public.events.cancelled_at IS
  'When the event was cancelled. Stamped by trg_events_stamp_cancellation; never accepted from a client.';

COMMENT ON COLUMN public.events.cancelled_by IS
  'auth.uid() of whoever cancelled the event. Stamped by trg_events_stamp_cancellation; never accepted '
  'from a client, so it names the actual actor rather than whoever the browser claimed. NULL for a '
  'service-role or migration write, which has no auth.uid(). No FK, like created_by.';

-- ---------------------------------------------------------------------------
-- 2. The stamp: actor and moment recorded, reason normalised
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER + SET search_path, matching the sibling guard
-- fn_guard_event_privileged_fields on this same table. EXECUTE is revoked from
-- anon and PUBLIC in this file (PostgreSQL does not check EXECUTE when a trigger
-- fires, so the revoke costs nothing and closes the direct-call door that
-- Supabase's ALTER DEFAULT PRIVILEGES would otherwise leave open to anon).
--
-- ⚠️ THIS TRIGGER DOES NOT REQUIRE A REASON, AND MUST NOT.
--
-- An earlier draft raised 23514 when a row moved into 'cancelled' without a
-- cancellation_reason. That would have been a table-wide rule on a SHARED table.
-- `events` holds general events, marathons, tournaments and inductions, and
-- other flows already cancel a row without any reason at all — a reason is a
-- field this feature invented, not something every caller knows about. A
-- table-wide RAISE would have turned each of those into a runtime 23514 the
-- moment this migration was applied: a feature added in one console breaking
-- cancellation everywhere else.
--
-- So the requirement is scoped to the path that has somewhere to type one:
--
--   · the cancel dialog on /events/[id] makes the textarea mandatory, and
--   · GeneralEventService.cancel() refuses a blank reason before it writes.
--
-- Every other writer keeps working exactly as it did, and simply gets
-- cancelled_at / cancelled_by stamped for free. A cancelled event with no reason
-- renders honestly on the one screen that reads it ("No reason was recorded for
-- this cancellation" on the /events/[id] console) rather than failing the write.
-- The public page never reads this column, so a blank reason changes nothing
-- there: it shows the same standard cancellation notice either way.

CREATE OR REPLACE FUNCTION public.fn_events_stamp_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the TRANSITION into cancelled. An UPDATE on a row that is already
  -- cancelled (an edit, a visibility flip) must not re-stamp the moment, and a
  -- legacy row that arrived at 'cancelled' before this migration is left alone.
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    -- Whitespace is not a reason. Normalise it to NULL so every reader can test
    -- one thing, and no caller can satisfy a UI requirement with a space.
    NEW.cancellation_reason := nullif(btrim(coalesce(NEW.cancellation_reason, '')), '');
    NEW.cancelled_at        := now();
    -- NULL for service-role / migration / cron writes, which have no auth.uid().
    NEW.cancelled_by        := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_events_stamp_cancellation() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_events_stamp_cancellation() TO authenticated;

COMMENT ON FUNCTION public.fn_events_stamp_cancellation() IS
  'BEFORE UPDATE on events. On the move into status = ''cancelled'': stamps cancelled_at = now() and '
  'cancelled_by = auth.uid(), and normalises a blank cancellation_reason to NULL. It does NOT require a '
  'reason — `events` is shared by general events, marathons, tournaments and inductions, and other flows '
  'cancel a row without one; a table-wide requirement would break every one of them. The requirement is '
  'enforced where a reason can actually be typed: the cancel dialog on /events/[id] and '
  'GeneralEventService.cancel(). Ignores updates to a row that is already cancelled, so legacy cancelled '
  'rows are never made invalid. Adds no permission check — events_auth_update / events_incharge_update '
  'remain the only gate.';

DROP TRIGGER IF EXISTS trg_events_stamp_cancellation ON public.events;
CREATE TRIGGER trg_events_stamp_cancellation
  BEFORE UPDATE OF status ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_events_stamp_cancellation();
