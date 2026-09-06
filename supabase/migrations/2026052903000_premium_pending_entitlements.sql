-- ─── Premium upgrade-accept: pending entitlements + atomic bed-move RPC (PR η) ──
-- Locked decisions (2026-05-28):
--   7.  A mid-year Classic→Premium upgrader is billed the DIFFERENTIAL only:
--       (Premium total pro-rata − Classic total pro-rata) for the remaining
--       months of the hostel year, floored at 0. Computed by δ's
--       computeUpgradeDifferential; the vacancy's current_discount_pct (θ) is
--       applied on top.
--   16. A learner may hold a *pending Premium entitlement* — they paid the
--       Premium package upfront at admission but no Premium bed was free, so
--       they were seated in Classic. The prepaid amount is tracked here.
--   17. When a Premium vacancy opens, holders of a matching pending entitlement
--       are first in line (priority over ordinary Classic upgraders).
--   18. ZERO-FULFILLMENT: when such a holder accepts, they are billed ₹0 — the
--       Premium was already paid for. The entitlement is marked 'fulfilled'
--       and linked to the vacancy that satisfied it.
--   19. PACKAGE-VALUE PRIORITY: among multiple pending holders, the one with
--       the higher package_value_inr is offered first (richer package wins).
--   20. YEAR-END SURPLUS: a pending entitlement never fulfilled by hostel
--       year-end is marked 'expired_surplus' (the prepaid sits as institutional
--       surplus; refund handling is out of scope for this PR).
--
-- Conventions copied from 2026052902000_premium_vacancy_notifications.sql:
--   - RLS: SELECT to authenticated (USING true); write gated to
--     profiles.role IN ('super_admin','admin').
--   - updated_at maintained by the shared update_updated_at_column() trigger.

-- ─── hostel_pending_premium_entitlements ───────────────────────────────────
CREATE TABLE IF NOT EXISTS hostel_pending_premium_entitlements (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id          uuid        NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  learner_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hostel_year_id          uuid        REFERENCES hostel_years(id),
  target_room_category_id uuid        REFERENCES hostel_categories(id),
  amount_prepaid_inr      integer     NOT NULL DEFAULT 0,    -- premium upfront already paid at admission
  package_value_inr       integer     NOT NULL DEFAULT 0,    -- for priority ordering (decision 19)
  status                  text        NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending','fulfilled','expired_surplus','cancelled')),
  fulfilled_by_vacancy_id uuid        REFERENCES hostel_premium_vacancies(id),
  fulfilled_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup of a learner's pending entitlement for a year + category
-- (the zero-fulfillment check in acceptUpgrade), and of the priority queue
-- for a vacancy (decision 19 ordering).
CREATE INDEX IF NOT EXISTS idx_hostel_pending_entitlement_learner
  ON hostel_pending_premium_entitlements (learner_id, hostel_year_id, status);
CREATE INDEX IF NOT EXISTS idx_hostel_pending_entitlement_priority
  ON hostel_pending_premium_entitlements (institution_id, status, package_value_inr DESC);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE hostel_pending_premium_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hostel_pending_premium_entitlements_select"
  ON hostel_pending_premium_entitlements FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "hostel_pending_premium_entitlements_insert"
  ON hostel_pending_premium_entitlements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_pending_premium_entitlements_update"
  ON hostel_pending_premium_entitlements FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

CREATE POLICY "hostel_pending_premium_entitlements_delete"
  ON hostel_pending_premium_entitlements FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin', 'admin'))
  );

-- ─── updated_at trigger ─────────────────────────────────────────────────────
CREATE TRIGGER trg_hostel_pending_premium_entitlements_updated_at
  BEFORE UPDATE ON hostel_pending_premium_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── fn_premium_upgrade_accept ──────────────────────────────────────────────
-- Atomic Classic→Premium bed move + vacancy fill, mirroring the advisory-lock
-- + SECURITY DEFINER pattern of fn_premium_reserve_bed (PR δ/premium-allocation).
--
-- Unlike fn_premium_reserve_bed this does NOT run the premium-eligibility
-- evaluate gate (the learner is already a resident accepting an upgrade offer;
-- pool eligibility is checked in the service layer before this RPC).
--
-- Steps (all in one transaction):
--   1. Advisory-lock the target premium bed (first writer wins).
--   2. Re-check the vacancy is still 'open' (idempotent double-accept guard).
--   3. Re-check the target bed is still 'available'.
--   4. Close the learner's current active Classic allocation (status='vacated',
--      actual_vacate_date=today) and free its bed.
--   5. Insert the new Premium allocation, carrying the old allocation's tier_id,
--      academic_year_id, institution_id and emergency-contact fields (a MOVE,
--      not a fresh grant), stamping the billed differential on
--      monthly_fee_at_allocation_inr and the upgrade context in metadata.
--   6. Occupy the premium bed.
--   7. Mark the vacancy 'filled' (filled_by_learner_id, filled_at).
-- Returns: { success, new_allocation_id, old_allocation_id, reason, detail }.
CREATE OR REPLACE FUNCTION public.fn_premium_upgrade_accept(
  p_vacancy_id  uuid,
  p_learner_id  uuid,
  p_billed_inr  integer,
  p_was_free    boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vacancy        RECORD;
  v_old_alloc      RECORD;
  v_bed_status     text;
  v_new_alloc_id   uuid;
BEGIN
  -- 1. Load + lock the vacancy row (FOR UPDATE serialises concurrent accepts).
  SELECT id, institution_id, room_id, bed_id, block_id, room_category_id, status
    INTO v_vacancy
    FROM public.hostel_premium_vacancies
    WHERE id = p_vacancy_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'vacancy_not_found',
      'detail', 'Upgrade vacancy not found.');
  END IF;
  IF v_vacancy.status <> 'open' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'vacancy_not_open',
      'detail', 'This upgrade vacancy is no longer open (status: ' || v_vacancy.status || ').');
  END IF;
  IF v_vacancy.bed_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'vacancy_no_bed',
      'detail', 'This vacancy has no target bed to assign.');
  END IF;

  -- 2. Advisory-lock the target bed (consistent with fn_premium_reserve_bed).
  IF NOT pg_try_advisory_xact_lock(hashtext(v_vacancy.bed_id::text)) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bed_locked_by_other',
      'detail', 'Another learner is currently claiming this bed. Try again.');
  END IF;

  -- 3. Target bed must still be available.
  SELECT status INTO v_bed_status FROM public.hostel_beds
    WHERE id = v_vacancy.bed_id AND room_id = v_vacancy.room_id;
  IF v_bed_status IS NULL OR v_bed_status <> 'available' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'bed_unavailable',
      'detail', 'The premium bed is no longer available.');
  END IF;

  -- 4. The learner's current active allocation (the Classic seat being moved).
  SELECT id, bed_id, tier_id, academic_year_id, institution_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old_alloc
    FROM public.hostel_allocations
    WHERE learner_id = p_learner_id AND status = 'active'
    ORDER BY allocation_date DESC
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_active_allocation',
      'detail', 'Learner has no active allocation to upgrade from.');
  END IF;

  -- 5. Close the old allocation + free its bed.
  UPDATE public.hostel_allocations
    SET status = 'vacated', actual_vacate_date = CURRENT_DATE, updated_at = now()
    WHERE id = v_old_alloc.id;
  IF v_old_alloc.bed_id IS NOT NULL THEN
    UPDATE public.hostel_beds
      SET status = 'available', current_occupant_id = NULL, updated_at = now()
      WHERE id = v_old_alloc.bed_id;
  END IF;

  -- 6. Insert the new Premium allocation (a MOVE — carries old context).
  INSERT INTO public.hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id,
    allocation_type, allocation_date, status, fee_status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by, monthly_fee_at_allocation_inr, metadata
  ) VALUES (
    v_vacancy.institution_id, p_learner_id, v_vacancy.block_id, v_vacancy.room_id,
    v_vacancy.bed_id, v_old_alloc.academic_year_id,
    'regular', CURRENT_DATE, 'active',
    CASE WHEN p_was_free THEN 'paid' ELSE 'pending' END,
    v_old_alloc.emergency_contact_name, v_old_alloc.emergency_contact_phone,
    v_old_alloc.emergency_contact_relation,
    v_old_alloc.tier_id, p_learner_id, p_billed_inr,
    jsonb_build_object(
      'upgrade_from_allocation_id', v_old_alloc.id,
      'upgrade_vacancy_id', p_vacancy_id,
      'upgrade_billed_inr', p_billed_inr,
      'upgrade_was_free', p_was_free
    )
  ) RETURNING id INTO v_new_alloc_id;

  -- 7. Occupy the premium bed.
  UPDATE public.hostel_beds
    SET status = 'occupied', current_occupant_id = p_learner_id, updated_at = now()
    WHERE id = v_vacancy.bed_id;

  -- 8. Mark the vacancy filled.
  UPDATE public.hostel_premium_vacancies
    SET status = 'filled', filled_by_learner_id = p_learner_id, filled_at = now(),
        updated_at = now()
    WHERE id = p_vacancy_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_allocation_id', v_new_alloc_id,
    'old_allocation_id', v_old_alloc.id,
    'new_bed_id', v_vacancy.bed_id,
    'reason', 'ok'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'reason', 'unknown', 'detail', SQLERRM);
END;
$function$;
