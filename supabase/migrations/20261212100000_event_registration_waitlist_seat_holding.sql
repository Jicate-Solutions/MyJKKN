-- ============================================================================
-- event_registration_waitlist — SEAT HOLDING for a full event. PR 1 of 3.
--
-- ⚠️ UNAPPLIED PROPOSAL. The PR that introduces this file does NOT execute it.
-- Until it is applied, public registration behaves exactly as it does today:
-- every read of this table in application code treats "relation does not
-- exist" (42P01 / PGRST202 / PGRST205) as "no waiting list yet" and falls back
-- to the 422 "This event is full." that the 51st person has always received.
-- Apply with Supabase `apply_migration` (never `execute_sql`, which runs the
-- SQL but writes no supabase_migrations.schema_migrations row).
--
-- ---------------------------------------------------------------------------
-- WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
-- ---------------------------------------------------------------------------
-- PR #3714 tried to land three hard things in one piece — holding a seat under
-- concurrency, money on a paid event, and identity for people who have no
-- account — and stopped after five review rounds in which each fix opened the
-- next hole. This file carries ONLY the first of the three:
--
--   * a waiting list for an event whose cap_behavior is 'waitlist';
--   * when a place frees, the head of the queue is OFFERED it and the place is
--     HELD for them (an outstanding offer counts as taken);
--   * they take it up through the ordinary registration door;
--   * the hold LAPSES after 24 hours if they do not, and the place is offered
--     to the next person.
--
-- FOR SIGNED-IN REGISTRANTS ONLY. `profile_id` is NOT NULL: a row cannot exist
-- for somebody with no MyJKKN account, so the guest-identity problem (PR 3)
-- cannot arise here by construction. NO MONEY: the application engages the
-- queue only on a form whose fee is zero; a paid form behaves as today (PR 2).
--
-- ---------------------------------------------------------------------------
-- THE ONE RULE THIS FILE EXISTS TO MAKE TRUE
-- ---------------------------------------------------------------------------
-- #3714's remaining defect: its trigger refused an offered → registered
-- transition only when the claim code was left UNCHANGED, so a statement that
-- simply nulled the code passed without ever matching it — and its clean-up
-- helper did precisely that on a row matched by name and phone. Somebody who
-- knew a queued person's name and number could absorb the place being held for
-- them.
--
-- Here the ONLY way out of 'offered' into 'registered' is a statement that
-- PRESENTS the code, through the write-only column `claim_code_presented`, and
-- the trigger compares what was presented with what is stored. Nulling the
-- code, leaving it alone, presenting the wrong one, or presenting nothing are
-- all refused with 42501 — whatever the WHERE clause said and whoever wrote
-- it. A successful claim consumes the code in the same statement, so the same
-- code cannot take the place up twice. The state machine is the trigger's, not
-- the application's:
--
--     waiting ──(place frees: fn_event_waitlist_settle)──▶ offered
--     waiting ──(registered through the ordinary door)───▶ registered
--     offered ──(presents the matching code, in time)────▶ registered
--     offered ──(24h pass, settle sweeps it)─────────────▶ expired
--     registered, expired: terminal.
--
-- Every other transition is refused. While a row is 'offered' its code and its
-- deadline are immutable. `claim_code_presented` never rests in the table: the
-- trigger nulls it on every write, so it cannot be read back.
--
-- ---------------------------------------------------------------------------
-- WHY NOT public.event_waitlist
-- ---------------------------------------------------------------------------
-- That table (20260417000003) is the ROOM/RESOURCE overflow queue; its only live
-- reader promotes by `resource_reservation_id` (20260417000004); it has RLS
-- disabled and zero policies. It is left exactly as it is.
--
-- ---------------------------------------------------------------------------
-- WHICH EVENTS QUEUE — the existing switch, not a new one
-- ---------------------------------------------------------------------------
-- `events.cap_behavior` has existed since 20260416000001 ('strict_cap' |
-- 'waitlist' | 'allow_overflow', default 'waitlist') and no application code
-- has ever read it. This migration and its route read it: 'waitlist' queues.
-- 'strict_cap' and 'allow_overflow' both behave exactly as every event does
-- today (a hard 422 when full) — giving 'allow_overflow' its literal meaning is
-- a capacity decision, not a seat-holding one, and is not made here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE public.event_registration_waitlist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,

  -- Which form the person answered. An event holds many (one per monthly run)
  -- and each can charge differently, so without this the answers in
  -- custom_fields are uninterpretable.
  form_id           UUID REFERENCES public.event_registration_forms(id) ON DELETE SET NULL,

  -- JOIN ORDER, assigned once and never renumbered. The number a person is
  -- SHOWN is their rank among the rows still waiting, computed at read time.
  queue_seq         INTEGER NOT NULL,

  status            TEXT NOT NULL DEFAULT 'waiting',

  -- The same contact shape events_registrations uses, because these people
  -- become registrations.
  participant_name  TEXT NOT NULL,
  participant_email TEXT,
  participant_phone TEXT,

  -- WHO. NOT NULL: this queue is for people with an account, and the offer is
  -- bound to that account. A deleted account leaves the queue with it.
  profile_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  learner_id        UUID,
  institution_id    UUID,

  custom_fields     JSONB,

  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- When the place was offered, and when the hold lapses. Both NULL while
  -- waiting; both set by the trigger on entering 'offered' and immutable after.
  offered_at        TIMESTAMPTZ,
  offer_expires_at  TIMESTAMPTZ,
  -- When the in-app notification for that offer was delivered. NULL with
  -- offered_at set means the offer is real but nobody has been told yet.
  notified_at       TIMESTAMPTZ,

  -- THE SINGLE-USE CLAIM TOKEN. Minted by the trigger when the row enters
  -- 'offered'; consumed (set NULL) by the trigger when the row is taken up.
  -- Never written by the application. In this PR it is a server-held handle —
  -- the route reads it off the row it is entitled to (profile_id = caller) and
  -- presents it back; PR 3 is where a code is read aloud to somebody.
  claim_code        TEXT,
  -- WRITE-ONLY MAILBOX. A claim writes the code it holds here; the trigger
  -- compares it with claim_code and always nulls it, so it never rests.
  claim_code_presented TEXT,

  -- The registration the row became. Set in the same statement as the claim,
  -- so a 'registered' row is never seen without it (until the registration is
  -- deleted, when the FK nulls it).
  registration_id   UUID REFERENCES public.events_registrations(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT event_registration_waitlist_status_check
    CHECK (status IN ('waiting', 'offered', 'registered', 'expired')),
  CONSTRAINT uq_event_registration_waitlist_seq UNIQUE (event_id, queue_seq)
);

COMMENT ON TABLE public.event_registration_waitlist IS
  'The sign-up waiting list for an event whose cap_behavior is ''waitlist'' — signed-in registrants only (profile_id NOT NULL). One row per person who arrived after the event was full. Distinct from public.event_waitlist (the room/resource reservation overflow queue), which is untouched.';
COMMENT ON COLUMN public.event_registration_waitlist.queue_seq IS
  'Join order within the event, assigned once by tr_event_registration_waitlist_seq and never renumbered. The position a person is SHOWN is their rank among rows still ''waiting'', computed at read time.';
COMMENT ON COLUMN public.event_registration_waitlist.status IS
  'waiting = in the queue. offered = a place freed and is HELD for this person until offer_expires_at (counted as taken by fn_event_waitlist_taken). registered = taken up; registration_id points at the registration. expired = the hold lapsed unclaimed. registered and expired are terminal. Every transition is enforced by fn_event_registration_waitlist_guard.';
COMMENT ON COLUMN public.event_registration_waitlist.claim_code IS
  'Single-use claim token. Minted by the trigger on entering ''offered''; the ONLY way out of ''offered'' into ''registered'' is a statement that presents this exact value through claim_code_presented, and the trigger consumes it in that statement. Immutable while offered. Never written by the application.';
COMMENT ON COLUMN public.event_registration_waitlist.claim_code_presented IS
  'Write-only. A claim writes the code it holds here; the trigger compares it with claim_code and nulls it on every write, so it is always NULL at rest.';
COMMENT ON COLUMN public.event_registration_waitlist.offer_expires_at IS
  'When the hold lapses: offered_at + 24 hours (Director's ruling, 2026-09-14), set by the trigger, immutable. Past it the offer neither holds a place nor can be taken up; fn_event_waitlist_settle marks it expired and offers the place to the next person.';

CREATE INDEX idx_event_registration_waitlist_queue
  ON public.event_registration_waitlist (event_id, queue_seq);
CREATE INDEX idx_event_registration_waitlist_status
  ON public.event_registration_waitlist (event_id, status);
CREATE INDEX idx_event_registration_waitlist_profile
  ON public.event_registration_waitlist (profile_id);
-- The announcement pass reads exactly this slice: offers made, not yet told.
CREATE INDEX idx_event_registration_waitlist_pending_notify
  ON public.event_registration_waitlist (event_id)
  WHERE status = 'offered' AND notified_at IS NULL;

-- ONE PERSON, ONE OPEN PLACE PER FORM. Somebody who refreshes and resubmits
-- must not get a second row with a fresh queue_seq. Scoped to the form because
-- every service lookup is: an event holds many forms (one per monthly run) and
-- a place on September's must not block queueing for October's. COALESCE gives
-- rows with no form_id one shared key so they still cannot double up. Partial
-- on the two OPEN statuses only, so a taken-up or lapsed row does not block a
-- later join.
CREATE UNIQUE INDEX uq_event_registration_waitlist_open_profile
  ON public.event_registration_waitlist
     (event_id, profile_id, COALESCE(form_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('waiting', 'offered');

-- Two live codes must never collide within an event: the claim compares
-- against exactly one row.
CREATE UNIQUE INDEX uq_event_registration_waitlist_claim_code
  ON public.event_registration_waitlist (event_id, claim_code)
  WHERE claim_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- queue_seq assignment
-- ---------------------------------------------------------------------------
-- MAX+1 under a per-event transaction advisory lock, so two people joining in
-- the same millisecond do not compute the same number and lose one of them to
-- the UNIQUE constraint.
CREATE FUNCTION public.fn_event_registration_waitlist_assign_seq()
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

CREATE TRIGGER tr_event_registration_waitlist_seq
  BEFORE INSERT ON public.event_registration_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_registration_waitlist_assign_seq();

CREATE FUNCTION public.fn_event_registration_waitlist_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_event_registration_waitlist_touch
  BEFORE UPDATE ON public.event_registration_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_registration_waitlist_touch();

-- ---------------------------------------------------------------------------
-- The claim token
-- ---------------------------------------------------------------------------
-- Six characters from an alphabet with no 0/O, 1/I/L or U. Nobody reads this
-- one aloud in this PR, but PR 3 will, and a token minted here must not need
-- re-minting then. Randomness comes from pgcrypto (extensions.gen_random_bytes,
-- as 20260617001400 and 20260603130000 already use it), not from random().
CREATE FUNCTION public.fn_event_waitlist_new_claim_code()
RETURNS TEXT
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT string_agg(
           substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + (get_byte(b, i) % 30), 1),
           '' ORDER BY i)
    FROM extensions.gen_random_bytes(6) AS b, generate_series(0, 5) AS i;
$$;

COMMENT ON FUNCTION public.fn_event_waitlist_new_claim_code() IS
  'A 6-character single-use claim token from an alphabet with no 0/O, 1/I/L or U, minted from pgcrypto. Called only by fn_event_registration_waitlist_guard.';

REVOKE EXECUTE ON FUNCTION public.fn_event_waitlist_new_claim_code() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_waitlist_new_claim_code() TO service_role;

-- ---------------------------------------------------------------------------
-- THE STATE MACHINE — one trigger, every transition
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.fn_event_registration_waitlist_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_candidate TEXT;
  v_taken     BOOLEAN;
BEGIN
  -- A row is born waiting, with nothing minted, nothing presented and nothing
  -- attached. Whatever the INSERT said about those columns is overwritten.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'waiting' THEN
      RAISE EXCEPTION 'A waiting-list row is born waiting; it cannot be inserted as ''%''', NEW.status
        USING ERRCODE = '42501';
    END IF;
    NEW.claim_code           := NULL;
    NEW.claim_code_presented := NULL;
    NEW.offered_at           := NULL;
    NEW.offer_expires_at     := NULL;
    NEW.registration_id      := NULL;
    RETURN NEW;
  END IF;

  -- ===== UPDATE from here =====

  -- 1. LEAVING 'offered'. Exactly two exits, and neither can be taken by a
  --    statement that merely nulls or leaves the code.
  IF OLD.status = 'offered' AND NEW.status <> 'offered' THEN
    IF NEW.status = 'registered' THEN
      IF NEW.claim_code_presented IS NULL
         OR OLD.claim_code IS NULL
         OR NEW.claim_code_presented <> OLD.claim_code
      THEN
        RAISE EXCEPTION
          'A held place can only be taken up by a statement that presents its claim code (row %)', OLD.id
          USING ERRCODE = '42501';
      END IF;
      IF OLD.offer_expires_at IS NOT NULL AND now() >= OLD.offer_expires_at THEN
        RAISE EXCEPTION
          'This offer lapsed at % and can no longer be taken up (row %)', OLD.offer_expires_at, OLD.id
          USING ERRCODE = '42501';
      END IF;
      IF NEW.registration_id IS NULL THEN
        RAISE EXCEPTION
          'Taking a place up names the registration it became (row %)', OLD.id
          USING ERRCODE = '42501';
      END IF;
      -- CONSUMED. The same code cannot take the place up twice.
      NEW.claim_code := NULL;
    ELSIF NEW.status = 'expired' THEN
      IF OLD.offer_expires_at IS NULL OR now() < OLD.offer_expires_at THEN
        RAISE EXCEPTION
          'An offer cannot be expired before its deadline (row %)', OLD.id
          USING ERRCODE = '42501';
      END IF;
      NEW.claim_code      := NULL;
      NEW.registration_id := NULL;
    ELSE
      RAISE EXCEPTION
        'A held place is either taken up or lapses; it cannot become ''%'' (row %)', NEW.status, OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. STAYING 'offered': the code and the deadline are immutable. This is what
  --    stops a "tidy-up" from invalidating or re-minting a live offer.
  IF OLD.status = 'offered' AND NEW.status = 'offered' THEN
    IF NEW.claim_code IS DISTINCT FROM OLD.claim_code
       OR NEW.offer_expires_at IS DISTINCT FROM OLD.offer_expires_at
       OR NEW.offered_at IS DISTINCT FROM OLD.offered_at
       OR NEW.registration_id IS NOT NULL
    THEN
      RAISE EXCEPTION
        'The code, deadline and attachment of an outstanding offer cannot be altered (row %)', OLD.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. ENTERING 'offered': only from 'waiting'. Mint the token, start the clock.
  IF NEW.status = 'offered' AND OLD.status <> 'offered' THEN
    IF OLD.status <> 'waiting' THEN
      RAISE EXCEPTION
        'Only a waiting row can be offered a place; this one is ''%'' (row %)', OLD.status, OLD.id
        USING ERRCODE = '42501';
    END IF;

    v_candidate := NULL;
    FOR i IN 1..8 LOOP
      v_candidate := public.fn_event_waitlist_new_claim_code();
      SELECT EXISTS (
        SELECT 1 FROM public.event_registration_waitlist w
         WHERE w.event_id = NEW.event_id AND w.claim_code = v_candidate
      ) INTO v_taken;
      EXIT WHEN NOT v_taken;
      v_candidate := NULL;
    END LOOP;
    IF v_candidate IS NULL THEN
      RAISE EXCEPTION 'Could not mint a unique waiting-list claim code for event %', NEW.event_id;
    END IF;

    NEW.claim_code       := v_candidate;
    NEW.offered_at       := now();
    NEW.offer_expires_at := now() + interval '24 hours';
    NEW.registration_id  := NULL;
    NEW.notified_at      := NULL;
  END IF;

  -- 4. 'waiting' → 'registered' directly: the person registered through the
  --    ordinary door (a place freed and they walked in before the queue
  --    reached them). The row must name that registration.
  IF OLD.status = 'waiting' AND NEW.status = 'registered' AND NEW.registration_id IS NULL THEN
    RAISE EXCEPTION
      'Closing a waiting row names the registration it became (row %)', OLD.id
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'waiting' AND NEW.status = 'expired' THEN
    RAISE EXCEPTION 'Only an offer can lapse; a waiting row cannot expire (row %)', OLD.id
      USING ERRCODE = '42501';
  END IF;

  -- 5. 'registered' and 'expired' are terminal. Once registered, the only
  --    change registration_id may take is to NULL (the FK's ON DELETE SET
  --    NULL when the registration itself is removed).
  IF OLD.status IN ('registered', 'expired') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION
      'A ''%'' waiting-list row is final; it cannot become ''%'' (row %)', OLD.status, NEW.status, OLD.id
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'registered'
     AND NEW.registration_id IS NOT NULL
     AND NEW.registration_id IS DISTINCT FROM OLD.registration_id
  THEN
    RAISE EXCEPTION
      'A taken-up place cannot be re-pointed at a different registration (row %)', OLD.id
      USING ERRCODE = '42501';
  END IF;

  -- The mailbox never rests.
  NEW.claim_code_presented := NULL;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_event_registration_waitlist_guard() IS
  'The waiting-list state machine. waiting→offered (mints the claim token, sets the 24h deadline), waiting→registered (with registration_id), offered→registered ONLY when claim_code_presented equals the stored claim_code and the deadline has not passed (the code is consumed in that statement), offered→expired only past the deadline. Everything else — including nulling or altering the code of an outstanding offer — is refused with 42501. claim_code_presented is nulled on every write.';

CREATE TRIGGER tr_event_registration_waitlist_guard
  BEFORE INSERT OR UPDATE ON public.event_registration_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.fn_event_registration_waitlist_guard();

REVOKE EXECUTE ON FUNCTION public.fn_event_registration_waitlist_guard()
  FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- How many places are taken
-- ---------------------------------------------------------------------------
-- Live registrations PLUS offers that are still within their deadline. An
-- offer holds its place until it lapses; a lapsed one holds nothing even
-- before the settle pass has marked it expired, and the trigger refuses to let
-- it be taken up, so the two definitions cannot disagree.
--
-- The public registration route computes the same two terms in TypeScript
-- (countTaken in lib/services/events/waitlist-service.ts) rather than calling
-- this, deliberately: the route has to keep working BEFORE this migration is
-- applied. The two definitions must be changed together.
CREATE FUNCTION public.fn_event_waitlist_taken(p_event_id uuid)
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
        AND w.status = 'offered'
        AND (w.offer_expires_at IS NULL OR w.offer_expires_at > now()));
$$;

COMMENT ON FUNCTION public.fn_event_waitlist_taken(uuid) IS
  'Places currently taken on an event: non-cancelled registrations plus waiting-list offers still within their deadline. An offer holds its place until it lapses.';

-- Counts rows across a whole event with no authority check of its own; no
-- signed-in user may call it. `authenticated` is named because revoking PUBLIC
-- alone does not undo Supabase's direct grant to that role.
REVOKE EXECUTE ON FUNCTION public.fn_event_waitlist_taken(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_waitlist_taken(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- SETTLE: lapse stale offers, then offer every free place to the queue
-- ---------------------------------------------------------------------------
-- The one function that moves people forward. Called by the trigger below when
-- a registration is cancelled or deleted, and by the application before it
-- decides capacity at the public door and when the organiser opens the queue
-- card — so a lapsed hold is released, and a place freed any other way (a raised
-- max_registrations, say) is offered, on the next request that touches the
-- event. There is no cron.
--
-- Serialised per event with an advisory lock, so two simultaneous cancellations
-- cannot offer one free place to two people. Offers ONE row per free place, in
-- queue order, and refuses to offer at all on a draft/cancelled/completed event
-- or after the registration window has shut — an offer nobody can take would
-- hold its seat for the whole 24 hours for nothing. Expiring stale offers is
-- always done, whatever the event's state.
--
-- Does NOT notify. Announcing the offer is the application's job through the
-- canonical notification fanout.
CREATE FUNCTION public.fn_event_waitlist_settle(p_event_id uuid)
RETURNS TABLE (expired_count integer, offered_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max       INTEGER;
  v_behavior  TEXT;
  v_status    TEXT;
  v_closes_at TIMESTAMPTZ;
  v_next_id   UUID;
  v_expired   INTEGER := 0;
  v_offered   INTEGER := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('event_waitlist_settle:' || p_event_id::text, 0));

  UPDATE public.event_registration_waitlist
     SET status = 'expired'
   WHERE event_id = p_event_id
     AND status = 'offered'
     AND offer_expires_at IS NOT NULL
     AND offer_expires_at <= now();
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  SELECT e.max_registrations, e.cap_behavior, e.status, e.registration_close_date
    INTO v_max, v_behavior, v_status, v_closes_at
    FROM public.events e
   WHERE e.id = p_event_id;

  IF NOT FOUND
     OR v_max IS NULL
     OR v_behavior IS DISTINCT FROM 'waitlist'
     OR v_status IN ('draft', 'cancelled', 'completed')
     OR (v_closes_at IS NOT NULL AND now() > v_closes_at)
  THEN
    RETURN QUERY SELECT v_expired, 0;
    RETURN;
  END IF;

  -- One offer per free place, head of the queue first. Bounded so a
  -- pathological event cannot loop forever; 200 offers in one pass is far more
  -- than any queue here will ever need.
  FOR i IN 1..200 LOOP
    EXIT WHEN public.fn_event_waitlist_taken(p_event_id) >= v_max;

    SELECT w.id
      INTO v_next_id
      FROM public.event_registration_waitlist w
     WHERE w.event_id = p_event_id
       AND w.status = 'waiting'
     ORDER BY w.queue_seq ASC
     LIMIT 1;
    EXIT WHEN v_next_id IS NULL;

    UPDATE public.event_registration_waitlist
       SET status = 'offered'
     WHERE id = v_next_id
       AND status = 'waiting';
    v_offered := v_offered + 1;
  END LOOP;

  RETURN QUERY SELECT v_expired, v_offered;
END;
$$;

COMMENT ON FUNCTION public.fn_event_waitlist_settle(uuid) IS
  'Marks lapsed offers expired, then offers every free place on a waitlist-behaviour event to the people waiting, in queue order, one row per place, under a per-event advisory lock. Refuses to make new offers on a draft/cancelled/completed event or after the registration window has shut. Returns how many lapsed and how many were offered. Never notifies.';

REVOKE EXECUTE ON FUNCTION public.fn_event_waitlist_settle(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_event_waitlist_settle(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Authority — who may read an event's queue
-- ---------------------------------------------------------------------------
-- Mirrors fn_can_manage_event_feedback as scoped by 20261210090000: super admin;
-- an admin WITH institution access to the event; the appointed in-charge; or
-- the event's creator. Deliberately NOT `events.view` — this queue is a list of
-- named people with their phone numbers. Its own function rather than a call to
-- the messages gate (20261205083000), which is merged but may not be applied.
CREATE FUNCTION public.fn_can_manage_event_waitlist(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_super_admin()
    OR (
      public.is_admin()
      AND EXISTS (
        SELECT 1
        FROM public.events e
        WHERE e.id = p_event_id
          AND (e.institution_id IS NULL OR public.role_has_institution_access(e.institution_id))
      )
    )
    OR public.fn_is_event_incharge(p_event_id)
    OR EXISTS (
      SELECT 1
      FROM public.events e
      WHERE e.id = p_event_id
        AND e.created_by = auth.uid()
    );
$$;

COMMENT ON FUNCTION public.fn_can_manage_event_waitlist(uuid) IS
  'Authority to read an event''s sign-up waiting list. Super admin; an admin WITH institution access to the event (role_has_institution_access); the event in-charge (events.config->incharges); or the event''s creator. Rejects events.view. Same shape as fn_can_manage_event_feedback after 20261210090000.';

REVOKE EXECUTE ON FUNCTION public.fn_can_manage_event_waitlist(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_can_manage_event_waitlist(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A freed place settles the queue
-- ---------------------------------------------------------------------------
-- Fires on events_registrations, so it catches EVERY way a place can free —
-- the organiser removing someone, a status change to 'cancelled', a deletion —
-- without this PR touching the cancel flow. Cheapest question first: a bulk
-- cancel of n registrations on an event nobody is queuing for must not run the
-- settle pass n times.
CREATE FUNCTION public.fn_event_registration_freed_settle_waitlist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- OLD is set on both the UPDATE and the DELETE path; NEW is never needed.
  IF OLD.event_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.event_registration_waitlist w
     WHERE w.event_id = OLD.event_id
       AND w.status IN ('waiting', 'offered')
  ) THEN
    RETURN NULL;
  END IF;

  PERFORM public.fn_event_waitlist_settle(OLD.event_id);
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.fn_event_registration_freed_settle_waitlist() IS
  'When a registration is cancelled or removed, settles that event''s waiting list (fn_event_waitlist_settle): lapsed offers expire and every free place is offered to the next person in order. Skips events with nobody queuing.';

-- Firing a trigger does not test EXECUTE, so revoking from everybody changes
-- nothing about the two triggers below; it just leaves no default grant lying
-- about on a SECURITY DEFINER body the secdef gate does not examine.
REVOKE EXECUTE ON FUNCTION public.fn_event_registration_freed_settle_waitlist()
  FROM anon, authenticated, PUBLIC;

CREATE TRIGGER tr_events_registration_cancelled_settle_waitlist
  AFTER UPDATE OF status ON public.events_registrations
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION public.fn_event_registration_freed_settle_waitlist();

CREATE TRIGGER tr_events_registration_deleted_settle_waitlist
  AFTER DELETE ON public.events_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_registration_freed_settle_waitlist();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- `authenticated` MUST be named in the REVOKE: Supabase's ALTER DEFAULT
-- PRIVILEGES hands that role its own direct INSERT/UPDATE/DELETE at CREATE
-- TABLE time, independent of PUBLIC (memory
-- feedback_authenticated_holds_a_direct_table_grant_too).
--
-- Every write is made by the API routes under the service-role client, after
-- they have checked capacity and authority. NO DELETE FOR ANYBODY: a queue row
-- is the record that somebody was refused a place and what happened next.
REVOKE ALL ON public.event_registration_waitlist FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.event_registration_waitlist TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.event_registration_waitlist TO service_role;

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
    RAISE EXCEPTION 'event_registration_waitlist is readable by anon — a list of named people with phone numbers';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.event_registration_waitlist', 'SELECT') THEN
    RAISE EXCEPTION 'event_registration_waitlist is unreadable by authenticated — the organiser queue would never render';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.event_registration_waitlist', 'INSERT') THEN
    RAISE EXCEPTION 'event_registration_waitlist cannot be written by service_role — nobody could ever join a queue';
  END IF;
  IF has_table_privilege('service_role', 'public.event_registration_waitlist', 'DELETE') THEN
    RAISE EXCEPTION 'event_registration_waitlist is deletable by service_role — queue rows are the record and must not be erasable';
  END IF;

  IF has_function_privilege('anon', 'public.fn_can_manage_event_waitlist(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_can_manage_event_waitlist is callable by anon';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_event_waitlist_settle(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_event_waitlist_settle is callable by any signed-in user';
  END IF;
  IF has_function_privilege('authenticated', 'public.fn_event_waitlist_taken(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_event_waitlist_taken is callable by any signed-in user';
  END IF;
END
$assert$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Read-only for `authenticated`, two audiences: people who may manage the
-- event, and the person whose own row it is.
ALTER TABLE public.event_registration_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_registration_waitlist_select ON public.event_registration_waitlist
  FOR SELECT
  USING (
    public.fn_can_manage_event_waitlist(event_id)
    OR profile_id = auth.uid()
  );

-- ============================================================================
-- ROLLBACK (for reference)
-- ============================================================================
-- DROP TRIGGER IF EXISTS tr_events_registration_deleted_settle_waitlist ON public.events_registrations;
-- DROP TRIGGER IF EXISTS tr_events_registration_cancelled_settle_waitlist ON public.events_registrations;
-- DROP FUNCTION IF EXISTS public.fn_event_registration_freed_settle_waitlist();
-- DROP FUNCTION IF EXISTS public.fn_can_manage_event_waitlist(uuid);
-- DROP FUNCTION IF EXISTS public.fn_event_waitlist_settle(uuid);
-- DROP FUNCTION IF EXISTS public.fn_event_waitlist_taken(uuid);
-- DROP TRIGGER IF EXISTS tr_event_registration_waitlist_guard ON public.event_registration_waitlist;
-- DROP FUNCTION IF EXISTS public.fn_event_registration_waitlist_guard();
-- DROP FUNCTION IF EXISTS public.fn_event_waitlist_new_claim_code();
-- DROP TRIGGER IF EXISTS tr_event_registration_waitlist_touch ON public.event_registration_waitlist;
-- DROP FUNCTION IF EXISTS public.fn_event_registration_waitlist_touch();
-- DROP TRIGGER IF EXISTS tr_event_registration_waitlist_seq ON public.event_registration_waitlist;
-- DROP FUNCTION IF EXISTS public.fn_event_registration_waitlist_assign_seq();
-- DROP TABLE IF EXISTS public.event_registration_waitlist;
