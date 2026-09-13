-- ============================================================================
-- event_registration_waitlist — the sign-up waiting list an event never had.
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- Until it is applied, public registration behaves exactly as it does today —
-- the 51st person on a 50-place event is refused — on EVERY path, each checked
-- one at a time rather than asserted as a blanket:
--   * /p/event/<id>/register — isWaitlistAvailable() returns false, so the page
--     shows the same "Registration full" it has always shown. It does NOT offer
--     a queue that is not there. (This is the path that DID break in the first
--     version of this feature: the page promised a waiting list, took the whole
--     form, and then refused — worse than the refusal it replaced.)
--   * POST /api/events/<id>/public-register — countTaken() reads zero offers
--     without the table, which is the exact number it counted before this
--     feature existed; joinWaitlist() returns 'not_available' and the route
--     answers 422 "This event is full."; findOutstandingOffer() finds nothing,
--     so nothing is claimed; deliverPendingOffers() returns immediately.
--   * GET /api/events/<id>/waitlist — the gate function is missing too, so the
--     route answers not_yet_available (with cap_behavior null, not invented)
--     and the organiser card renders nothing.
-- Apply with Supabase `apply_migration` (never `execute_sql`, which runs the
-- SQL but writes no supabase_migrations.schema_migrations row).
--
-- ---------------------------------------------------------------------------
-- WHY NOT public.event_waitlist
-- ---------------------------------------------------------------------------
-- There is already a table called `event_waitlist` (20260417000003). It is NOT
-- this. It is the ROOM/RESOURCE overflow queue: its only live reader is
-- fn_reservation_cancelled_restore_stock_and_waitlist (20260417000004), which
-- promotes by `resource_reservation_id`. Three facts make it unusable as a
-- sign-up queue and dangerous to repurpose:
--   1. `user_id` is NOT NULL — a public registrant is very often a guest with
--      no MyJKKN account at all, so the majority of the people this feature
--      exists for could not be inserted.
--   2. It carries no participant name / phone / email and no form_id, so an
--      organiser could not contact or identify anybody on it.
--   3. It has ROW LEVEL SECURITY disabled and zero policies. Adding public
--      sign-ups to it would expose them, and turning RLS on would change the
--      behaviour of the reservation trigger that already uses it.
-- A second table is therefore the smaller, more traceable change. The
-- reservation queue is left exactly as it is.
--
-- ---------------------------------------------------------------------------
-- WHICH EVENTS QUEUE — the existing switch, not a new one
-- ---------------------------------------------------------------------------
-- `events.cap_behavior` has existed since 20260416000001 with the values
-- 'strict_cap' | 'waitlist' | 'allow_overflow', defaulting to 'waitlist', and
-- NO application code has ever read it. This migration and its route make that
-- column mean what it says:
--   waitlist       → a full event queues the next person (this table)
--   strict_cap     → a full event refuses, as every event does today
--   allow_overflow → capacity is advisory; registration is accepted past it
-- No second switch is introduced.
--
-- ---------------------------------------------------------------------------
-- AN OFFER HOLDS THE PLACE, AND THERE IS NO DEADLINE
-- ---------------------------------------------------------------------------
-- When a place frees, the head of the queue moves to status 'offered' and the
-- place is counted as TAKEN from that moment (see fn_event_waitlist_taken).
-- If the offer did not hold the place, a passer-by could register into the gap
-- the queue was meant to fill, which is the whole complaint this feature
-- answers.
--
-- The Director's ruling is automatic offering with NO deadline. The plain
-- consequence, recorded here rather than papered over with a timer: a promoted
-- person who never responds holds that place indefinitely, and nobody behind
-- them is offered it. `offered_at` is stored so the organiser's queue card can
-- show exactly how long an offer has been outstanding.
--
-- ---------------------------------------------------------------------------
-- AND AN OFFER CAN BE TAKEN UP — 'offered' IS NOT TERMINAL
-- ---------------------------------------------------------------------------
-- The promoted person returns to /p/event/<id>/register and sends the form.
-- POST /api/events/<id>/public-register recognises the offer BEFORE it checks
-- capacity (findOutstandingOffer), flips this row 'offered' → 'registered' as a
-- compare-and-swap (claimOffer), writes the ordinary registration, and points
-- `registration_id` at it. Only then does the place stop being counted twice.
--
-- This is load-bearing, and it is stated here because the first version of this
-- migration shipped WITHOUT it: nothing anywhere wrote 'registered', so every
-- freed place turned into a permanently held 'offered' row,
-- fn_event_waitlist_taken grew monotonically, and the door the offer
-- notification pointed at refused the very person the place was held for and
-- put them at the BACK of the queue. Do not reintroduce a state here that has
-- no exit.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_registration_waitlist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Which form the person answered. An event holds many (one per monthly run)
  -- and each can charge differently, so without this the answers in
  -- custom_fields are uninterpretable and the fee is unknowable.
  form_id           UUID REFERENCES public.event_registration_forms(id) ON DELETE SET NULL,

  -- JOIN ORDER, assigned once and never renumbered. The number a person is
  -- SHOWN is their rank among the rows still waiting, computed at read time;
  -- renumbering stored rows when somebody leaves the queue would rewrite
  -- history and race with concurrent joins.
  queue_seq         INTEGER NOT NULL,

  status            TEXT NOT NULL DEFAULT 'waiting',

  -- The same contact shape events_registrations uses, because these people
  -- become registrations. Name is required; at least one of phone/email is
  -- required by the route, mirroring the registration door.
  participant_name  TEXT NOT NULL,
  participant_email TEXT,
  participant_phone TEXT,

  -- Identity, when there is one. All three are nullable: a guest has none, and
  -- a guest is precisely the person most likely to be turned away today.
  profile_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  learner_id        UUID,
  institution_id    UUID,

  custom_fields     JSONB,

  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- When the place was offered. NULL while waiting.
  offered_at        TIMESTAMPTZ,
  -- When the in-app notification for that offer was actually delivered. NULL
  -- with offered_at set means the offer is real but nobody has been told yet
  -- (either the delivery pass has not run, or this person has no account).
  notified_at       TIMESTAMPTZ,
  -- Set when the offer could not be delivered in-app because the person has no
  -- MyJKKN account. The organiser's card reads this and says "contact them".
  unreachable       BOOLEAN NOT NULL DEFAULT false,

  -- Filled when the offer is taken up and becomes a real registration.
  registration_id   UUID REFERENCES public.events_registrations(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_registration_waitlist_status_check
    CHECK (status IN ('waiting', 'offered', 'registered', 'withdrawn')),
  CONSTRAINT uq_event_registration_waitlist_seq UNIQUE (event_id, queue_seq)
);

COMMENT ON TABLE public.event_registration_waitlist IS
  'The sign-up waiting list for an event whose cap_behavior is ''waitlist''. One row per person who arrived after the event was full. Distinct from public.event_waitlist, which is the room/resource reservation overflow queue and is not touched by this feature.';
COMMENT ON COLUMN public.event_registration_waitlist.queue_seq IS
  'Join order within the event, assigned once by tr_event_registration_waitlist_seq and never renumbered. The position a person is SHOWN is their rank among rows still in status ''waiting'', computed at read time.';
COMMENT ON COLUMN public.event_registration_waitlist.status IS
  'waiting = in the queue. offered = a place freed and is being held for this person (counted as taken; no deadline, see the file header). registered = the offer was taken up through /api/events/[eventId]/public-register and registration_id points at the resulting row; this is the only exit from offered and it is what stops a freed place being held forever. withdrawn = RESERVED and written by nothing yet: there is no leave-the-queue button and no organiser removal, so no row reaches this value today. The value is kept in the CHECK because removal is the next thing this queue needs, not because anything sets it.';
COMMENT ON COLUMN public.event_registration_waitlist.offered_at IS
  'When the place was offered. With no expiry deadline this is what makes a stalled offer visible: the organiser card shows how long it has been outstanding.';
COMMENT ON COLUMN public.event_registration_waitlist.notified_at IS
  'When the in-app notification about the offer was delivered through the canonical fanout. NULL alongside a set offered_at means the offer stands but has not been announced yet.';
COMMENT ON COLUMN public.event_registration_waitlist.unreachable IS
  'true when the offer could not be announced in-app because this person matches no MyJKKN account (a guest). The offer is still real; the organiser has to reach them by phone or email.';

CREATE INDEX IF NOT EXISTS idx_event_registration_waitlist_queue
  ON public.event_registration_waitlist (event_id, queue_seq);
CREATE INDEX IF NOT EXISTS idx_event_registration_waitlist_status
  ON public.event_registration_waitlist (event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_registration_waitlist_profile
  ON public.event_registration_waitlist (profile_id)
  WHERE profile_id IS NOT NULL;
-- The delivery pass reads exactly this slice: offers made, not yet announced.
CREATE INDEX IF NOT EXISTS idx_event_registration_waitlist_pending_notify
  ON public.event_registration_waitlist (event_id)
  WHERE status = 'offered' AND notified_at IS NULL;

-- ---------------------------------------------------------------------------
-- ONE PERSON, ONE OPEN PLACE IN THE QUEUE
-- ---------------------------------------------------------------------------
-- Without this, somebody who refreshes and resubmits gets a SECOND row with a
-- fresh queue_seq; enough repeats and one person occupies the entire head of
-- the queue and is offered every place that frees. joinWaitlist() returns an
-- existing open row rather than inserting, and this is the backstop for two
-- submissions racing past that check: the service re-reads on 23505 and tells
-- the person their real position instead of surfacing an error.
--
-- PROFILE ONLY. There is deliberately NO unique index on participant_phone or
-- participant_email, and that is not an oversight — a first draft had both and
-- they were wrong for this institution. Siblings share a parent's phone number
-- and a family shares one email address; here that is routine rather than an
-- edge case. A unique index on the contact detail would reject the second
-- child's insert with 23505, the service's re-read would hand back the FIRST
-- child's row, and the second child would be told "you are already number 4 on
-- the waiting list" — holding a stranger's waitlist_id, never actually queued.
-- Two people behind one phone number are separated in the SERVICE, by name
-- (findOpenRow), where a failed match costs a duplicate row rather than
-- somebody else's place. Only profile_id is a person.
--
-- PARTIAL on the two OPEN statuses only. A 'registered' row must not block the
-- same person queueing for a later run of the same event, and a 'withdrawn' one
-- must not block them rejoining.
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registration_waitlist_open_profile
  ON public.event_registration_waitlist (event_id, profile_id)
  WHERE profile_id IS NOT NULL AND status IN ('waiting', 'offered');

-- ---------------------------------------------------------------------------
-- queue_seq assignment
-- ---------------------------------------------------------------------------
-- MAX+1 under a per-event transaction advisory lock. Two people joining the
-- same full event in the same millisecond otherwise compute the same number and
-- one of them loses to the UNIQUE constraint — which, on a public registration
-- page, reads to the loser as "something went wrong" rather than "you are 7th".
CREATE OR REPLACE FUNCTION public.fn_event_registration_waitlist_assign_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.queue_seq IS NOT NULL AND NEW.queue_seq > 0 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('event_waitlist_seq:' || NEW.event_id::text, 0));

  SELECT COALESCE(MAX(w.queue_seq), 0) + 1
    INTO NEW.queue_seq
    FROM public.event_registration_waitlist w
   WHERE w.event_id = NEW.event_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_event_registration_waitlist_seq ON public.event_registration_waitlist;
CREATE TRIGGER tr_event_registration_waitlist_seq
  BEFORE INSERT ON public.event_registration_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_registration_waitlist_assign_seq();

CREATE OR REPLACE FUNCTION public.fn_event_registration_waitlist_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_event_registration_waitlist_touch ON public.event_registration_waitlist;
CREATE TRIGGER tr_event_registration_waitlist_touch
  BEFORE UPDATE ON public.event_registration_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_registration_waitlist_touch();

-- ---------------------------------------------------------------------------
-- How many places are taken
-- ---------------------------------------------------------------------------
-- Live registrations PLUS outstanding offers — the definition of "full" that
-- the promotion trigger uses. The public registration route computes the same
-- two terms in TypeScript (countTaken in lib/services/events/waitlist-service.ts)
-- rather than calling this, deliberately: the route has to keep working BEFORE
-- this migration is applied, and a call to a function that is not there yet
-- would break registration for every event in that window. The two definitions
-- are one paragraph apart and must be changed together.
CREATE OR REPLACE FUNCTION public.fn_event_waitlist_taken(p_event_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::int
       FROM public.events_registrations r
      WHERE r.event_id = p_event_id
        AND r.status <> 'cancelled')
    +
    (SELECT COUNT(*)::int
       FROM public.event_registration_waitlist w
      WHERE w.event_id = p_event_id
        AND w.status = 'offered');
$$;

COMMENT ON FUNCTION public.fn_event_waitlist_taken(uuid) IS
  'Places currently taken on an event: non-cancelled registrations plus waiting-list offers that are still outstanding. An offer holds its place, so it counts here — otherwise a passer-by could register into the gap the queue exists to fill.';

-- No signed-in user needs to call this and none may: it counts rows across the
-- whole of an event's registrations with no authority check of its own, which
-- would leak the size of any event to anybody who could name its id. Its only
-- callers are the promotion trigger (which runs as the function owner, so the
-- grant is irrelevant to it) and, if ever needed, a server route under
-- service_role. `authenticated` is named in the REVOKE alongside PUBLIC because
-- revoking PUBLIC alone does not undo Supabase's direct grant to that role.
REVOKE EXECUTE ON FUNCTION public.fn_event_waitlist_taken(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_waitlist_taken(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Authority — who may read an event's queue
-- ---------------------------------------------------------------------------
-- The same four branches as fn_can_manage_event_feedback (20260909210000) and
-- fn_can_manage_event_messages (20261205083000): super admin, admin, the
-- appointed in-charge, or the event's creator. Deliberately NOT `events.view`,
-- a read key held broadly across the platform — this queue is a list of named people with
-- their phone numbers.
--
-- It is its own function rather than a call to the messages gate because that
-- gate ships in a migration that is merged but NOT YET APPLIED; depending on it
-- would make this migration fail to apply depending on the order the two land.
-- The two authorities are also allowed to diverge later.
CREATE OR REPLACE FUNCTION public.fn_can_manage_event_waitlist(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR public.is_admin()
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_waitlist(uuid) IS
  'Authority to read an event''s sign-up waiting list. Super admin, admin, the event in-charge (events.config->incharges), or the event''s creator — nothing else. Mirrors fn_can_manage_event_messages; deliberately rejects events.view.';

-- Postgres grants EXECUTE to PUBLIC by default and Supabase's ALTER DEFAULT
-- PRIVILEGES grants anon on top, so a new SECURITY DEFINER function is callable
-- by an unauthenticated client unless this is stated. Every branch resolves
-- through auth.uid(), which is NULL for anon, so the body already fails closed
-- — but an unauthenticated caller should not reach the body at all.
REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_waitlist(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_waitlist(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Automatic promotion when a place frees
-- ---------------------------------------------------------------------------
-- Fires on events_registrations, so it catches EVERY way a place can free —
-- the organiser removing someone, a status change to 'cancelled', a deletion —
-- without this PR touching the cancel flow, which is out of its scope.
--
-- Deliberately conservative:
--   * It only ever promotes ONE row, and only when a place is genuinely free.
--   * It does nothing unless events.cap_behavior = 'waitlist' AND
--     events.max_registrations is set.
--   * It reads only columns that exist in production today.
--   * It does NOT notify. Announcing the offer is the application's job,
--     through the one canonical notification fanout; a second messaging
--     mechanism written in SQL is exactly what this module must not grow.
CREATE OR REPLACE FUNCTION public.fn_event_registration_freed_offer_waitlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id   UUID;
  v_max        INTEGER;
  v_behavior   TEXT;
  v_next_id    UUID;
BEGIN
  v_event_id := COALESCE(OLD.event_id, NEW.event_id);
  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.max_registrations, e.cap_behavior
    INTO v_max, v_behavior
    FROM public.events e
   WHERE e.id = v_event_id;

  IF v_max IS NULL OR v_behavior IS DISTINCT FROM 'waitlist' THEN
    RETURN NULL;
  END IF;

  -- Serialise per event so two simultaneous cancellations cannot offer the
  -- same single free place to two different people.
  PERFORM pg_advisory_xact_lock(hashtextextended('event_waitlist_offer:' || v_event_id::text, 0));

  IF public.fn_event_waitlist_taken(v_event_id) >= v_max THEN
    RETURN NULL;
  END IF;

  SELECT w.id
    INTO v_next_id
    FROM public.event_registration_waitlist w
   WHERE w.event_id = v_event_id
     AND w.status = 'waiting'
   ORDER BY w.queue_seq ASC
   LIMIT 1;

  IF v_next_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.event_registration_waitlist
     SET status = 'offered',
         offered_at = now()
   WHERE id = v_next_id
     AND status = 'waiting';

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_event_registration_freed_offer_waitlist() IS
  'When a registration is cancelled or removed from a waitlist-behaviour event that has spare capacity, offers the freed place to the person at the head of the queue. Offers one row only, holds the place, and sets no deadline. Announcing the offer is done by the application through the canonical notification fanout, never here.';

-- The third SECURITY DEFINER function in this file, and the one the
-- check-secdef-anon-revoke gate never examined: that gate skips RETURNS TRIGGER,
-- so it reported "2 new secdef function(s) checked" and this one kept Postgres's
-- default PUBLIC grant plus Supabase's ALTER DEFAULT PRIVILEGES grant to anon.
-- Not exploitable — Postgres refuses a direct call to a trigger function — but
-- an unlocked default that no automated check looked at is not a thing to leave
-- lying about. No GRANT follows: firing a trigger does not test EXECUTE (it is
-- checked once, at CREATE TRIGGER, against the creator), so revoking from
-- everybody changes nothing about the two triggers below.
REVOKE EXECUTE ON FUNCTION public.fn_event_registration_freed_offer_waitlist()
  FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS tr_events_registration_cancelled_offer_waitlist ON public.events_registrations;
CREATE TRIGGER tr_events_registration_cancelled_offer_waitlist
  AFTER UPDATE OF status ON public.events_registrations
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.fn_event_registration_freed_offer_waitlist();

DROP TRIGGER IF EXISTS tr_events_registration_deleted_offer_waitlist ON public.events_registrations;
CREATE TRIGGER tr_events_registration_deleted_offer_waitlist
  AFTER DELETE ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_registration_freed_offer_waitlist();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- `authenticated` MUST be named in the REVOKE, not just anon and PUBLIC.
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
-- TO anon, authenticated, service_role`, so the moment CREATE TABLE runs,
-- `authenticated` holds its OWN direct INSERT/UPDATE/DELETE grant, independent
-- of PUBLIC, which survives `REVOKE ALL ... FROM anon, PUBLIC`.
-- (Repo rule; memory feedback_authenticated_holds_a_direct_table_grant_too.)
--
-- Every write is made by the API routes under the service-role client, after
-- they have checked capacity and authority themselves. A signed-in client that
-- could write here directly could put itself at the head of somebody else's
-- queue.
--
-- NO DELETE FOR ANYBODY, deliberately and permanently. A queue row is the record
-- that somebody was refused a place and what happened next; deleting it would
-- erase the only evidence an offer was ever made. Leaving the queue, when it is
-- built, is a status change to 'withdrawn', not a delete — which is also why the
-- assertion block below demands DELETE be absent for anon and authenticated
-- rather than granting it to service_role "just in case".
REVOKE ALL ON public.event_registration_waitlist FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.event_registration_waitlist TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_registration_waitlist TO service_role;

-- Assert the result rather than trusting the statements above: a grant that did
-- not take is invisible until somebody writes a row they should not have been
-- able to write.
DO $assert$
DECLARE
  v_priv text;
BEGIN
  FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
    IF has_table_privilege('authenticated', 'public.event_registration_waitlist', v_priv) THEN
      RAISE EXCEPTION
        'event_registration_waitlist is client-writable: role authenticated still holds % on it', v_priv;
    END IF;
    IF has_table_privilege('anon', 'public.event_registration_waitlist', v_priv) THEN
      RAISE EXCEPTION
        'event_registration_waitlist is writable by anon: role anon still holds % on it', v_priv;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.event_registration_waitlist', 'SELECT') THEN
    RAISE EXCEPTION 'event_registration_waitlist is readable by anon — a public list of named people with phone numbers';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.event_registration_waitlist', 'SELECT') THEN
    RAISE EXCEPTION 'event_registration_waitlist is unreadable by authenticated — the organiser queue would never render';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.event_registration_waitlist', 'INSERT') THEN
    RAISE EXCEPTION 'event_registration_waitlist cannot be written by service_role — nobody could ever join a queue';
  END IF;
END
$assert$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Read-only for `authenticated`, and only two audiences: people who may manage
-- the event, and the person whose own row it is. A guest has no session and so
-- reads nothing here — their position comes back in the registration response.
ALTER TABLE public.event_registration_waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_registration_waitlist_select ON public.event_registration_waitlist;
CREATE POLICY event_registration_waitlist_select ON public.event_registration_waitlist
  FOR SELECT
  USING (
    public.fn_can_manage_event_waitlist(event_id)
    OR profile_id = auth.uid()
  );

-- ============================================================================
-- ROLLBACK (for reference)
-- ============================================================================
-- DROP TRIGGER IF EXISTS tr_events_registration_deleted_offer_waitlist ON public.events_registrations;
-- DROP TRIGGER IF EXISTS tr_events_registration_cancelled_offer_waitlist ON public.events_registrations;
-- DROP FUNCTION IF EXISTS public.fn_event_registration_freed_offer_waitlist();
-- DROP FUNCTION IF EXISTS public.fn_can_manage_event_waitlist(uuid);
-- DROP FUNCTION IF EXISTS public.fn_event_waitlist_taken(uuid);
-- DROP TABLE IF EXISTS public.event_registration_waitlist;
