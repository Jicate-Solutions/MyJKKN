-- ============================================================================
-- Room buyout — pay for the empty beds and hold the room
-- ============================================================================
-- 2026-08-13.
--
-- Settle-then-bill already charges a learner for the beds nobody is sleeping in
-- when her window closes. What it does NOT do is let her CHOOSE that outcome,
-- and — worse — nothing stops the hostel office or the auto-allocator placing
-- someone into the room the day after she paid to have it to herself. She pays
-- sole-occupancy money and gets a roommate.
--
-- A buyout is that choice made explicit: bill the empty beds now, and LOCK the
-- room so no one else is placed in it for the rest of the hostel year.
--
-- CONSENT. A buyout bills EVERY current resident their settled share
-- immediately and removes everyone's chance of the price dropping later. One
-- resident cannot impose that on another, so every current resident must agree
-- before it activates. For a sole occupant that set is just herself and the
-- buyout activates on request — one mechanism, not two.
--
-- THE AMOUNT IS RE-DERIVED AT ACTIVATION, never trusted from the request. If
-- the room's occupancy moved while consent was being collected the buyout is
-- cancelled rather than silently billing a number nobody agreed to. A room that
-- filled up in the meantime cancels as 'room_filled' — there is nothing left to
-- buy.
--
-- WHERE THE LOCK LIVES. Six functions insert into hostel_allocations
-- (fn_auto_allocate_classic, fn_cl_admin_allocate_bed, fn_premium_reserve_bed,
-- fn_premium_confirm_invite, fn_premium_upgrade_accept) plus direct service
-- writes, and they share no bed-availability predicate to patch. So the lock is
-- a BEFORE trigger on the table itself — the one place every path must pass
-- through. The planner functions are filtered separately, for usability; the
-- trigger is what actually holds.
--
-- STILL SHIPS OFF. Nothing here is reachable while
-- hostel.settle_bill.enabled is false: fn_room_buyout_quote reports
-- 'mechanism_disabled' and the request path refuses.
-- ============================================================================

-- How long every roommate has to agree before the request lapses.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, data_type, description,
   ui_category, is_active, publication_state, is_system)
SELECT
  'hostel.settle_bill.buyout_consent_hours', 'global', NULL, '48'::jsonb, 'number',
  'Hours every current resident has to agree to a room buyout before the request lapses. '
  || 'A sole occupant never waits — her consent set is just herself, so her buyout activates on request.',
  'Hostel Fees — Settle Then Bill', true, 'published', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies
  WHERE policy_key = 'hostel.settle_bill.buyout_consent_hours' AND scope_type = 'global'
);

-- ── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hostel_room_buyouts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                 uuid NOT NULL REFERENCES public.hostel_rooms(id) ON DELETE CASCADE,
  hostel_year_id          uuid NOT NULL REFERENCES public.hostel_years(id),
  institution_id          uuid,
  requested_by_learner_id uuid NOT NULL,   -- profiles.id (= auth.uid())
  capacity_at_request     int  NOT NULL,
  occupants_at_request    int  NOT NULL,
  empty_beds              int  NOT NULL,
  -- What EACH consenting resident is billed: settled share minus the one bed
  -- she already pays for. Re-derived at activation; this is the quoted figure.
  amount_per_resident     numeric NOT NULL,
  status                  text NOT NULL DEFAULT 'pending_consent',
  consent_deadline        timestamptz NOT NULL,
  activated_at            timestamptz,
  cancelled_reason        text,
  released_at             timestamptz,
  released_by             uuid,
  release_reason          text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_room_buyouts_status_chk CHECK (
    status IN ('pending_consent','active','declined','expired','cancelled','released')
  )
);

-- At most ONE live buyout per room. A room already held cannot be bought again,
-- and two pending requests would race each other into billing the same people.
CREATE UNIQUE INDEX IF NOT EXISTS hostel_room_buyouts_one_live_per_room
  ON public.hostel_room_buyouts (room_id)
  WHERE status IN ('pending_consent','active');

CREATE INDEX IF NOT EXISTS hostel_room_buyouts_room_idx
  ON public.hostel_room_buyouts (room_id, status);

CREATE TABLE IF NOT EXISTS public.hostel_room_buyout_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyout_id     uuid NOT NULL REFERENCES public.hostel_room_buyouts(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL REFERENCES public.hostel_allocations(id) ON DELETE CASCADE,
  learner_id    uuid NOT NULL,          -- profiles.id
  decision      text NOT NULL DEFAULT 'pending',
  decided_at    timestamptz,
  bill_id       uuid,                   -- billing_student_bills.id, set at activation
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_room_buyout_consents_decision_chk CHECK (
    decision IN ('pending','agreed','declined')
  ),
  CONSTRAINT hostel_room_buyout_consents_unique UNIQUE (buyout_id, allocation_id)
);

CREATE INDEX IF NOT EXISTS hostel_room_buyout_consents_learner_idx
  ON public.hostel_room_buyout_consents (learner_id, decision);

DROP TRIGGER IF EXISTS trg_hostel_room_buyouts_touch ON public.hostel_room_buyouts;
CREATE TRIGGER trg_hostel_room_buyouts_touch
  BEFORE UPDATE ON public.hostel_room_buyouts
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ── RLS: read-only to the people it concerns; every write goes via an RPC ────
ALTER TABLE public.hostel_room_buyouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hostel_room_buyout_consents  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_room_buyouts_select ON public.hostel_room_buyouts;
CREATE POLICY hostel_room_buyouts_select ON public.hostel_room_buyouts
  FOR SELECT TO authenticated
  USING (
    -- A current resident of the room may see her own room's buyout.
    EXISTS (
      SELECT 1 FROM public.hostel_allocations a
      WHERE a.room_id = hostel_room_buyouts.room_id
        AND a.check_out_date IS NULL
        AND a.learner_id = (SELECT auth.uid())
    )
    OR public.fn_settle_can_manage(hostel_room_buyouts.room_id, 'campus_living.fees.view')
  );

DROP POLICY IF EXISTS hostel_room_buyout_consents_select ON public.hostel_room_buyout_consents;
CREATE POLICY hostel_room_buyout_consents_select ON public.hostel_room_buyout_consents
  FOR SELECT TO authenticated
  USING (
    learner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.hostel_room_buyouts b
      JOIN public.hostel_allocations a ON a.room_id = b.room_id
      WHERE b.id = hostel_room_buyout_consents.buyout_id
        AND a.check_out_date IS NULL
        AND a.learner_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.hostel_room_buyouts b
      WHERE b.id = hostel_room_buyout_consents.buyout_id
        AND public.fn_settle_can_manage(b.room_id, 'campus_living.fees.view')
    )
  );

REVOKE ALL ON public.hostel_room_buyouts         FROM anon;
REVOKE ALL ON public.hostel_room_buyout_consents FROM anon;
GRANT SELECT ON public.hostel_room_buyouts         TO authenticated;
GRANT SELECT ON public.hostel_room_buyout_consents TO authenticated;

-- ── The lock ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._enforce_room_buyout_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_buyout uuid;
BEGIN
  -- Only an ACTIVE occupancy takes a bed. A row being checked out frees one, so
  -- a resident may always leave a bought-out room.
  IF NEW.check_out_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT b.id INTO v_buyout
  FROM hostel_room_buyouts b
  WHERE b.room_id = NEW.room_id
    AND b.status = 'active'
  LIMIT 1;

  IF v_buyout IS NULL THEN
    RETURN NEW;
  END IF;

  -- The residents who bought the room may still be edited in place — a bed swap
  -- within the room, a status change, a correction. Only a NEW body is refused.
  IF EXISTS (
    SELECT 1 FROM hostel_room_buyout_consents c
    WHERE c.buyout_id = v_buyout
      AND c.allocation_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'This room is held under an active empty-bed buyout — its residents have paid for the empty beds. Release the buyout before allocating anyone into it.'
    USING ERRCODE = '23514',
          DETAIL  = format('room_id=%s buyout_id=%s allocation_id=%s', NEW.room_id, v_buyout, NEW.id);
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_room_buyout_lock_insert ON public.hostel_allocations;
CREATE TRIGGER trg_enforce_room_buyout_lock_insert
  BEFORE INSERT ON public.hostel_allocations
  FOR EACH ROW EXECUTE FUNCTION public._enforce_room_buyout_lock();

-- UPDATE is guarded too: moving an existing allocation INTO a held room is the
-- same act as inserting one, and fn_cl_admin_allocate_bed / the room-change
-- paths do exactly that.
DROP TRIGGER IF EXISTS trg_enforce_room_buyout_lock_update ON public.hostel_allocations;
CREATE TRIGGER trg_enforce_room_buyout_lock_update
  BEFORE UPDATE OF room_id, check_out_date ON public.hostel_allocations
  FOR EACH ROW
  WHEN (NEW.room_id IS DISTINCT FROM OLD.room_id OR OLD.check_out_date IS NOT NULL)
  EXECUTE FUNCTION public._enforce_room_buyout_lock();

-- Trigger function: PostgreSQL does not check EXECUTE when a trigger fires, and
-- a RETURNS trigger function cannot be meaningfully invoked over PostgREST. The
-- revoke is belt-and-braces so the security advisor stays quiet.
REVOKE EXECUTE ON FUNCTION public._enforce_room_buyout_lock() FROM anon, PUBLIC;
