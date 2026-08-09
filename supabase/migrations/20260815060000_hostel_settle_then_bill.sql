-- ============================================================================
-- 20260815060000_hostel_settle_then_bill.sql
-- Settle-then-bill for hostel rooms — let the room fill, THEN bill what is real.
-- ----------------------------------------------------------------------------
-- 🛑 FILE ONLY — NOT APPLIED. Director-gated. Nothing in this file has been run
--    against production. It also ships OFF: the master switch
--    `hostel.settle_bill.enabled` defaults to FALSE and every entry point in
--    this file refuses to act while it is false, so applying the file alone
--    still bills nobody.
--
-- DIRECTOR'S RULES (interview 2026-08-09, locked — do not redesign):
--   1. A learner is allocated a room → NO bill. A settle window opens: 5 days.
--   2. Each time another learner joins that room, the 5 days RESTART.
--   3. OUTER LIMIT: restarts stop 20 days after the window first opened.
--   4. Room becomes FULL → bill immediately; nothing more can change the price.
--   5. Window closes → bill every resident at the occupancy that exists AT THAT
--      MOMENT, using the existing fractional-occupancy formula. Due in 5 days.
--   6. A learner joining AFTER billing → recalculate each existing resident's
--      share from the month of joining and CREDIT the difference. Never a
--      refund, never a bill rewrite.
--
-- WHY IT EXISTS: today a learner alone in a 4-bed premium room owes 4× the
-- per-bed rate the moment she moves in, and there is no correction when
-- roommates arrive. 77 learners currently sit in under-filled rooms with no
-- hostel bill at all.
--
-- ── MECHANISMS REUSED (nothing parallel is invented here) ───────────────────
--   * Fee maths — lib/services/campus-living/hostel-fee-compute-service.ts
--     `computeFeeBreakdown`. The SQL below MIRRORS it and is bound to it by a
--     parity check in lib/services/campus-living/settle-bill-service.ts (the
--     dry-run returns the primitives; the TS recomputes with the canonical
--     function and flags any divergence). SQL cannot call TS, so the mirror is
--     made a CHECKED invariant rather than an unchecked copy.
--         base_share = round(per_bed_annual × room_capacity / active_occupants)
--         ac_share   = round(tonnage × base_inr_per_month_24h × 12 / occupants)
--     Both terms are rounded SEPARATELY, exactly as computeFeeBreakdown does.
--     (pg round() is half-away-from-zero, JS Math.round is half-up; every value
--     here is positive, where the two agree.)
--   * Mess fee is DELIBERATELY NOT billed here. It is flat per learner and does
--     not divide by occupancy, so it is not settle-sensitive; it stays with
--     campus_living_generate_hostel_year_bills. This file bills only the
--     occupancy-sensitive room share.
--   * Bill shape — identical to the hostel branch of
--     campus_living_generate_hostel_year_bills: billing_student_bills with
--     fee_source='hostel_category' and item_category_id = the hostel category.
--     Matching it is load-bearing: that function's dedup guard reads exactly
--     (student_id, hostel_year_id, item_category_id, fee_source IN
--     ('academic','hostel_category'), status<>'cancelled'), so the two paths
--     see each other and neither can double-bill the room.
--     (Pre-existing oddity, inherited not introduced: item_category_id holds a
--     hostel_categories.id on this path while billing reports LEFT JOIN
--     billing_categories on the same column. Not changed here.)
--   * Credits — public.student_credit_balances (the existing mechanism), with
--     source='fee_structure_change'. No new credit table, no refund path.
--   * Policy rows — platform_policies + fn_get_policy_bool / fn_get_policy_int,
--     alongside the existing fractional_occupancy.* family.
--   * Occupancy — "active" is `check_out_date IS NULL`, counted at ROOM level
--     via hostel_allocations.room_id: the exact semantics of the canonical view
--     public.v_hostel_room_occupancy, which fn_settle_window_due reads directly
--     rather than recounting.
--
-- ── HAZARDS FOUND WHILE BUILDING (each one is handled below) ────────────────
--   * IDENTITY MISMATCH. hostel_allocations.learner_id FKs profiles(id), while
--     billing_student_bills.student_id and student_credit_balances.student_id
--     FK learners_profiles(id). Every resident is therefore resolved through
--     profiles.learner_id → learners_profiles.id, and a resident with no
--     learner profile (staff / guest residents, hostel_allocations.resident_id
--     without learner_id) is SKIPPED with a reason instead of being billed.
--   * TWO "HAS LEFT" DATES. hostel_allocations carries both check_out_date and
--     actual_vacate_date. The canonical view counts only check_out_date, and so
--     does this file — deliberately, so occupancy here can never disagree with
--     the view the rest of campus living bills and displays from. A resident
--     with actual_vacate_date set but check_out_date NULL is still an occupant
--     to both. That inconsistency is real and pre-existing; it is NOT silently
--     patched here, because changing it would change every other reader too.
--   * RE-OPENING A BILLED ROOM WOULD DOUBLE-BILL. The partial unique index
--     covers only status='open', so nothing at the schema level stops a second
--     window opening on an already-billed room. fn_settle_window_open therefore
--     refuses explicitly and routes the caller to the late-join credit path.
--
-- Idempotent and safe to re-apply.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: hostel_room_settle_windows
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostel_room_settle_windows (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id              uuid NOT NULL REFERENCES public.hostel_rooms(id),
    hostel_year_id       uuid REFERENCES public.hostel_years(id),
    opened_at            timestamptz NOT NULL DEFAULT now(),
    restart_count        int NOT NULL DEFAULT 0,
    current_deadline     timestamptz NOT NULL,
    hard_deadline        timestamptz NOT NULL,
    status               text NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','billed','cancelled')),
    billed_at            timestamptz,
    occupants_at_billing int,
    -- Joiner allocation ids whose late-join credit round has been PROCESSED.
    -- Marked whether or not any credit row was written, so a round that credits
    -- nobody (rounds to 0, co-residents unbilled) is still never re-processed.
    credited_allocation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Re-apply safety: the column was added after the table's first draft.
ALTER TABLE public.hostel_room_settle_windows
  ADD COLUMN IF NOT EXISTS credited_allocation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- One OPEN window per room per hostel year.
-- COALESCE is load-bearing: Postgres treats NULLs as DISTINCT in a plain unique
-- index, so a bare (room_id, hostel_year_id) would allow unlimited open windows
-- on any room whose year is not yet set.
CREATE UNIQUE INDEX IF NOT EXISTS hostel_room_settle_windows_open_uq
    ON public.hostel_room_settle_windows (
        room_id,
        COALESCE(hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
    )
    WHERE status = 'open';

-- The due-sweep predicate.
CREATE INDEX IF NOT EXISTS hostel_room_settle_windows_due
    ON public.hostel_room_settle_windows (current_deadline, hard_deadline)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS hostel_room_settle_windows_room
    ON public.hostel_room_settle_windows (room_id, status);

DROP TRIGGER IF EXISTS trg_hostel_room_settle_windows_touch
    ON public.hostel_room_settle_windows;
CREATE TRIGGER trg_hostel_room_settle_windows_touch
    BEFORE UPDATE ON public.hostel_room_settle_windows
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

COMMENT ON TABLE public.hostel_room_settle_windows IS
  'Settle-then-bill window per hostel room per hostel year (Director 2026-08-09). '
  'A room is NOT billed at move-in; the window lets the room fill, restarts on '
  'each new joiner up to hard_deadline, then bills everyone at the occupancy '
  'that exists at close. Gated by platform policy hostel.settle_bill.enabled.';

COMMENT ON COLUMN public.hostel_room_settle_windows.hard_deadline IS
  'opened_at + hostel.settle_bill.outer_limit_days. Restarts may never push '
  'current_deadline past this instant.';

COMMENT ON COLUMN public.hostel_room_settle_windows.occupants_at_billing IS
  'Active occupants at the moment the window closed. The denominator every '
  'later late-join credit is measured against.';

-- ----------------------------------------------------------------------------
-- 2. RLS — locked from anon, admin write, resident self-read.
-- ----------------------------------------------------------------------------
ALTER TABLE public.hostel_room_settle_windows ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hostel_room_settle_windows FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.hostel_room_settle_windows TO authenticated;

DROP POLICY IF EXISTS settle_windows_select_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_select_admin ON public.hostel_room_settle_windows
    FOR SELECT USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.view')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

-- A resident may read the window of the room she actually lives in — that is
-- the "why am I not billed yet / when will I be" answer, and nothing more.
-- hostel_allocations.learner_id FKs profiles(id), and profiles.id = auth.uid().
DROP POLICY IF EXISTS settle_windows_select_own_room ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_select_own_room ON public.hostel_room_settle_windows
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.hostel_allocations a
            WHERE a.room_id = hostel_room_settle_windows.room_id
              AND a.learner_id = auth.uid()
              AND a.check_out_date IS NULL
        )
    );

DROP POLICY IF EXISTS settle_windows_insert_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_insert_admin ON public.hostel_room_settle_windows
    FOR INSERT WITH CHECK (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

-- WITH CHECK is NOT optional here. Without it the post-image is never
-- re-validated, so a tenant-scoped holder of campus_living.fees.config could
-- UPDATE a window they can see and move its room_id to another institution's
-- room — or flip status from 'billed' back to 'open' and clear the guard that
-- stops a room being billed twice.
DROP POLICY IF EXISTS settle_windows_update_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_update_admin ON public.hostel_room_settle_windows
    FOR UPDATE USING (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    )
    WITH CHECK (
        (SELECT is_super_admin() OR is_admin())
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

DROP POLICY IF EXISTS settle_windows_delete_admin ON public.hostel_room_settle_windows;
CREATE POLICY settle_windows_delete_admin ON public.hostel_room_settle_windows
    FOR DELETE USING (
        is_super_admin()
        OR (user_has_permission('campus_living.fees.config')
            AND EXISTS (
                SELECT 1 FROM public.hostel_rooms r
                WHERE r.id = hostel_room_settle_windows.room_id
                  AND role_has_institution_access(r.institution_id)))
    );

-- ----------------------------------------------------------------------------
-- 3. Policy rows — global, idempotent. THE MECHANISM SHIPS OFF.
-- ----------------------------------------------------------------------------
INSERT INTO platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   is_system, is_active, classification, publication_state, ui_category)
VALUES

('hostel.settle_bill.enabled', 'global', NULL,
  'false'::jsonb,
  'MASTER SWITCH for settle-then-bill. While false NOTHING runs: no settle '
  'window opens, no room is billed at close, no late-join credit is issued. '
  'Turning this on is the Director''s decision and starts billing hostel rooms '
  'at settled occupancy instead of at move-in.',
  'boolean', true, true, 'major', 'published',
  'Hostel Fees — Settle Then Bill'),

('hostel.settle_bill.window_days', 'global', NULL,
  '5'::jsonb,
  'Days a settle window stays open after the last learner joined the room. '
  'Each new joiner RESTARTS this countdown (bounded by outer_limit_days).',
  'number', true, true, 'major', 'published',
  'Hostel Fees — Settle Then Bill'),

('hostel.settle_bill.outer_limit_days', 'global', NULL,
  '20'::jsonb,
  'Hard outer limit measured from when the window FIRST opened. Restarts may '
  'not push the deadline past it, so a slowly-filling room still gets billed. '
  'Proposed default — changeable here without a deploy.',
  'number', true, true, 'major', 'published',
  'Hostel Fees — Settle Then Bill'),

('hostel.settle_bill.bill_due_days', 'global', NULL,
  '5'::jsonb,
  'Days from window close to the due date on the hostel bills it raises.',
  'number', true, true, 'major', 'published',
  'Hostel Fees — Settle Then Bill')

ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3b. fn_settle_can_manage — the authorization gate for everything below.
--
--     A SECURITY DEFINER function bypasses RLS, so the table policies above
--     protect nothing once these functions are granted. Without an explicit
--     guard inside each one, any logged-in learner in any tenant could call
--     fn_settle_bill_close('<any room uuid>', false) and bill a whole room, or
--     fn_settle_late_join_credit and mint credit rows. Each writer therefore
--     re-checks permission AND institution access for itself.
--
--     auth.uid() IS NULL means there is no user session — that is the cron on
--     the service-role client. It cannot be anon: anon holds EXECUTE on nothing
--     in this file and is revoked explicitly, with an apply-time assert.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_can_manage(
  p_room_id    uuid,
  p_permission text DEFAULT 'campus_living.fees.config'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN true;  -- service-role cron
  END IF;

  IF is_super_admin() OR is_admin() THEN
    RETURN true;
  END IF;

  SELECT r.institution_id INTO v_institution_id
  FROM hostel_rooms r WHERE r.id = p_room_id;

  IF v_institution_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN user_has_permission(p_permission)
     AND role_has_institution_access(v_institution_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_can_manage(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_can_manage(uuid, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3c. fn_settle_current_hostel_year — deterministic, and refuses rather than
--     guessing. A NULL hostel_year_id on a bill would make the dedup key
--     against campus_living_generate_hostel_year_bills never match (NULL = NULL
--     is not true), which is a DOUBLE-BILL, so callers must refuse instead.
--     ORDER BY is load-bearing: LIMIT 1 with no ordering is whatever the
--     planner returns first.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_current_hostel_year()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT hy.id
  FROM hostel_years hy
  WHERE hy.is_current AND hy.is_active
  ORDER BY hy.start_date DESC, hy.id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_current_hostel_year() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_current_hostel_year() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. fn_settle_room_annual_cost — the one place the room's annual cost is read.
--    Private helper. It exists so the rate lookup is not written three times
--    across open/close/credit and cannot drift between them.
--    Mirrors computeFeeBreakdown's inputs: per-bed annual rate × capacity, plus
--    the room's AC annual cost. Splitting by occupants is the caller's job.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_room_annual_cost(
  p_room_id        uuid,
  p_hostel_year_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity    int;
  v_category_id uuid;
  v_per_bed     numeric := 0;
  v_amount      numeric;
  v_frequency   text;
  v_ac_annual   numeric := 0;
  v_ac_tonnage  numeric := 0;
  v_ac_permonth numeric := 0;
  v_ac_config   jsonb;
BEGIN
  SELECT r.capacity, r.category_id INTO v_capacity, v_category_id
  FROM hostel_rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false, 'reason', 'room_not_found');
  END IF;

  IF v_category_id IS NULL THEN
    -- No category = no per-bed rate. Refuse rather than bill ₹0 silently.
    RETURN jsonb_build_object('found', false, 'reason', 'room_has_no_category',
                              'capacity', v_capacity);
  END IF;

  SELECT hf.amount, hf.frequency INTO v_amount, v_frequency
  FROM hostel_fees hf
  WHERE hf.hostel_category_id = v_category_id
    AND hf.hostel_year_id     = p_hostel_year_id
    AND hf.is_active
  LIMIT 1;

  IF v_amount IS NULL THEN
    RETURN jsonb_build_object('found', false, 'reason', 'no_active_fee_row',
                              'capacity', v_capacity, 'category_id', v_category_id);
  END IF;

  -- annualize() from hostel-fee-compute-service.ts.
  v_per_bed := CASE v_frequency
                 WHEN 'monthly'  THEN v_amount * 12
                 WHEN 'semester' THEN v_amount * 2
                 ELSE v_amount
               END;

  SELECT v.effective_config INTO v_ac_config
  FROM v_room_effective_billable_amenities v
  WHERE v.room_id = p_room_id AND v.code = 'air_conditioner'
  LIMIT 1;

  IF v_ac_config IS NOT NULL THEN
    v_ac_tonnage  := GREATEST(0, COALESCE((v_ac_config->>'tonnage')::numeric, 0));
    v_ac_permonth := GREATEST(0, COALESCE((v_ac_config->>'base_inr_per_month_24h')::numeric, 0));
    v_ac_annual   := v_ac_tonnage * v_ac_permonth * 12;
  END IF;

  -- The two AC primitives are returned alongside the product so the TS caller
  -- can feed computeFeeBreakdown its REAL inputs and check parity, rather than
  -- reverse-engineering them from the product.
  RETURN jsonb_build_object(
    'found',                true,
    'capacity',             GREATEST(1, COALESCE(v_capacity, 1)),
    'category_id',          v_category_id,
    'per_bed_annual_rate',  v_per_bed,
    'base_room_annual',     v_per_bed * GREATEST(1, COALESCE(v_capacity, 1)),
    'ac_room_annual',       v_ac_annual,
    'ac_tonnage',           v_ac_tonnage,
    'ac_base_inr_per_month_24h', v_ac_permonth
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_room_annual_cost(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_room_annual_cost(uuid, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. fn_settle_window_open — open, or restart, the room's settle window.
--    Rule 1 + 2 + 3. Called when a learner is allocated to the room.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_window_open(
  p_room_id        uuid,
  p_hostel_year_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year_id  uuid;
  v_window   public.hostel_room_settle_windows%ROWTYPE;
  v_win_days int;
  v_outer    int;
  v_deadline timestamptz;
BEGIN
  -- Master switch. While off, no window is ever created, so switching it on
  -- later starts from a clean slate rather than a backlog of stale deadlines.
  IF NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RETURN jsonb_build_object('action', 'disabled', 'room_id', p_room_id);
  END IF;

  -- Opening/restarting a window delays billing, so it is gated too — but on the
  -- permission the people who actually allocate rooms hold, not the fees one.
  IF NOT (fn_settle_can_manage(p_room_id, 'campus_living.allocations.create')
          OR fn_settle_can_manage(p_room_id, 'campus_living.fees.config')) THEN
    RAISE EXCEPTION 'permission denied: campus_living.allocations.create or campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

  v_year_id := COALESCE(p_hostel_year_id, fn_settle_current_hostel_year());

  -- A room already billed for this year must NOT get a second window — that
  -- would bill everyone twice. This is the late-join credit path instead.
  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND COALESCE(w.hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND w.status = 'billed'
  ORDER BY w.billed_at DESC NULLS LAST
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'action',    'already_billed_late_join',
      'room_id',   p_room_id,
      'window_id', v_window.id,
      'note',      'Room already billed — run fn_settle_late_join_credit.');
  END IF;

  v_win_days := GREATEST(0, fn_get_policy_int('hostel.settle_bill.window_days', 5));
  v_outer    := GREATEST(0, fn_get_policy_int('hostel.settle_bill.outer_limit_days', 20));

  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND COALESCE(w.hostel_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(v_year_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND w.status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO hostel_room_settle_windows
      (room_id, hostel_year_id, opened_at, restart_count,
       current_deadline, hard_deadline, status)
    VALUES
      (p_room_id, v_year_id, now(), 0,
       now() + make_interval(days => v_win_days),
       now() + make_interval(days => v_outer),
       'open')
    RETURNING * INTO v_window;

    RETURN jsonb_build_object(
      'action',           'opened',
      'room_id',          p_room_id,
      'window_id',        v_window.id,
      'restart_count',    v_window.restart_count,
      'current_deadline', v_window.current_deadline,
      'hard_deadline',    v_window.hard_deadline);
  END IF;

  -- Restart: push the deadline out, but never past the hard limit.
  v_deadline := LEAST(now() + make_interval(days => v_win_days), v_window.hard_deadline);

  UPDATE hostel_room_settle_windows
     SET restart_count    = restart_count + 1,
         current_deadline = v_deadline
   WHERE id = v_window.id
  RETURNING * INTO v_window;

  RETURN jsonb_build_object(
    'action',           'restarted',
    'room_id',          p_room_id,
    'window_id',        v_window.id,
    'restart_count',    v_window.restart_count,
    'current_deadline', v_window.current_deadline,
    'hard_deadline',    v_window.hard_deadline,
    'capped_at_hard_deadline', v_deadline = v_window.hard_deadline);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_window_open(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_window_open(uuid, uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. fn_settle_window_due — read-only. Which windows should close right now?
--    Rule 3 + 4 + 5. Occupancy comes from the canonical view, not a recount.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_window_due()
RETURNS TABLE (
  window_id        uuid,
  room_id          uuid,
  hostel_year_id   uuid,
  reason           text,
  active_occupants int,
  capacity         int,
  opened_at        timestamptz,
  current_deadline timestamptz,
  hard_deadline    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    w.id,
    w.room_id,
    w.hostel_year_id,
    -- 'room_full' is tested FIRST: rule 4 says a full room bills immediately
    -- because nothing more can change the price.
    CASE
      WHEN occ.capacity > 0 AND occ.active_residents >= occ.capacity THEN 'room_full'
      WHEN now() >= w.hard_deadline                                  THEN 'outer_limit'
      ELSE                                                                'window_elapsed'
    END,
    occ.active_residents,
    occ.capacity,
    w.opened_at,
    w.current_deadline,
    w.hard_deadline
  FROM hostel_room_settle_windows w
  JOIN v_hostel_room_occupancy occ ON occ.room_id = w.room_id
  WHERE w.status = 'open'
    AND (
      now() >= w.current_deadline
      OR now() >= w.hard_deadline
      OR (occ.capacity > 0 AND occ.active_residents >= occ.capacity)
    )
    -- Scoped: SECURITY DEFINER bypasses RLS, so without this the list would
    -- leak every institution's rooms to any authenticated caller.
    AND fn_settle_can_manage(w.room_id, 'campus_living.fees.view')
  ORDER BY w.current_deadline;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_window_due() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_window_due() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6b. fn_settle_late_join_due — read-only. Which BILLED rooms owe a credit?
--
--     Rule 6 lives in a state fn_settle_window_due can never return: that
--     function filters status='open', but a late join only matters once the
--     window is 'billed'. Driving the credit pass off the close list would mean
--     no sweep ever issues a credit. This is that missing list.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_late_join_due()
RETURNS TABLE (
  window_id            uuid,
  room_id              uuid,
  hostel_year_id       uuid,
  billed_at            timestamptz,
  occupants_at_billing int,
  uncredited_joiners   int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.room_id, w.hostel_year_id, w.billed_at, w.occupants_at_billing,
         COUNT(al.id)::int
  FROM hostel_room_settle_windows w
  JOIN hostel_allocations al
    ON al.room_id = w.room_id
   AND al.check_out_date IS NULL
   AND al.created_at > w.billed_at
   AND NOT (al.id = ANY (w.credited_allocation_ids))
  WHERE w.status = 'billed'
    AND fn_settle_can_manage(w.room_id, 'campus_living.fees.view')
  GROUP BY w.id, w.room_id, w.hostel_year_id, w.billed_at, w.occupants_at_billing
  ORDER BY w.billed_at;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_late_join_due() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_late_join_due() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 7. fn_settle_bill_close — the biller. Rule 5.
--    Dry-run returns what WOULD be billed and writes nothing.
--    Live path bills every resident at the occupancy that exists right now.
--    Idempotent: a window already 'billed' is skipped, never billed twice.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_bill_close(
  p_room_id   uuid,
  p_dry_run   boolean DEFAULT true,
  p_window_id uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window     public.hostel_room_settle_windows%ROWTYPE;
  v_year_id    uuid;
  v_cost       jsonb;
  v_capacity   int;
  v_occupants  int;
  v_due_days   int;
  v_base_share numeric;
  v_ac_share   numeric;
  v_share      numeric;
  v_category   uuid;
  v_lines      jsonb := '[]'::jsonb;
  v_billed     int := 0;
  v_skipped    int := 0;
  a            record;
  v_lp_id      uuid;
  v_inst_id    uuid;
  v_exists     boolean;
BEGIN
  -- Defense in depth: even a hand-made live call is refused while the master
  -- switch is off. This RAISEs rather than returning, so a caller that ignores
  -- return values still cannot bill anyone.
  IF NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'settle-then-bill is disabled (platform policy hostel.settle_bill.enabled = false)'
      USING ERRCODE = '42501';
  END IF;

  IF NOT fn_settle_can_manage(p_room_id, 'campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config on this room'
      USING ERRCODE = '42501';
  END IF;

  -- Bill the window the caller was handed, not "the oldest open one on this
  -- room". The unique index is per (room, hostel year), so a room with open
  -- windows in two hostel years would otherwise be billed against the wrong
  -- year — wrong rate, wrong dedup key — and the window that actually came due
  -- would be left open.
  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id
    AND w.status = 'open'
    AND (p_window_id IS NULL OR w.id = p_window_id)
  ORDER BY w.opened_at
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_window
    FROM hostel_room_settle_windows w
    WHERE w.room_id = p_room_id AND w.status = 'billed'
    ORDER BY w.billed_at DESC NULLS LAST
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('status', 'already_billed', 'room_id', p_room_id,
                                'window_id', v_window.id, 'billed_at', v_window.billed_at,
                                'occupants_at_billing', v_window.occupants_at_billing);
    END IF;
    RETURN jsonb_build_object('status', 'no_open_window', 'room_id', p_room_id);
  END IF;

  v_year_id := COALESCE(
    v_window.hostel_year_id,
    (SELECT hy.id FROM hostel_years hy WHERE hy.is_current AND hy.is_active LIMIT 1)
  );

  v_cost := fn_settle_room_annual_cost(p_room_id, v_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    -- Missing rate config: leave the window OPEN so an admin can fix the
    -- configuration and the room bills on the next sweep. Never bill ₹0.
    RETURN jsonb_build_object('status', 'no_rate', 'room_id', p_room_id,
                              'window_id', v_window.id, 'reason', v_cost->>'reason');
  END IF;

  v_capacity := (v_cost->>'capacity')::int;
  v_category := (v_cost->>'category_id')::uuid;

  -- Occupancy exactly as v_hostel_room_occupancy defines it.
  SELECT COUNT(*)::int INTO v_occupants
  FROM hostel_allocations al
  WHERE al.room_id = p_room_id AND al.check_out_date IS NULL;

  IF v_occupants = 0 THEN
    -- Everyone left before the window closed. There is nobody to bill; close it
    -- as cancelled so the sweep stops returning it forever.
    IF NOT p_dry_run THEN
      UPDATE hostel_room_settle_windows SET status = 'cancelled' WHERE id = v_window.id;
    END IF;
    RETURN jsonb_build_object('status', 'no_occupants', 'room_id', p_room_id,
                              'window_id', v_window.id, 'dry_run', p_dry_run);
  END IF;

  -- computeFeeBreakdown parity: each term rounded separately, then summed.
  v_base_share := round((v_cost->>'base_room_annual')::numeric / v_occupants);
  v_ac_share   := round((v_cost->>'ac_room_annual')::numeric   / v_occupants);
  v_share      := v_base_share + v_ac_share;

  v_due_days := GREATEST(0, fn_get_policy_int('hostel.settle_bill.bill_due_days', 5));

  FOR a IN
    SELECT al.id AS allocation_id, al.learner_id
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id AND al.check_out_date IS NULL
    ORDER BY al.check_in_date, al.id
  LOOP
    -- profiles(id) → learners_profiles(id). Non-learner residents cannot be
    -- billed through the learner billing tables; they are reported, not billed.
    v_lp_id := NULL;
    IF a.learner_id IS NOT NULL THEN
      SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = a.learner_id;
    END IF;

    IF v_lp_id IS NULL THEN
      v_skipped := v_skipped + 1;
      v_lines := v_lines || jsonb_build_object(
        'allocation_id', a.allocation_id, 'profile_id', a.learner_id,
        'action', 'skipped', 'reason', 'not_a_learner', 'amount', 0);
      CONTINUE;
    END IF;

    SELECT lp.institution_id INTO v_inst_id
    FROM learners_profiles lp WHERE lp.id = v_lp_id;

    -- Same dedup key campus_living_generate_hostel_year_bills uses, so the two
    -- paths cannot both bill this room to this learner.
    SELECT EXISTS (
      SELECT 1 FROM billing_student_bills b
      WHERE b.student_id      = v_lp_id
        AND b.hostel_year_id  = v_year_id
        AND b.item_category_id = v_category
        AND b.fee_source IN ('academic','hostel_category')
        AND b.status <> 'cancelled'
    ) INTO v_exists;

    IF v_exists THEN
      v_skipped := v_skipped + 1;
      v_lines := v_lines || jsonb_build_object(
        'allocation_id', a.allocation_id, 'learner_id', v_lp_id,
        'action', 'skipped', 'reason', 'already_billed', 'amount', 0);
      CONTINUE;
    END IF;

    IF NOT p_dry_run THEN
      INSERT INTO billing_student_bills
        (student_id, institution_id, item_category_id, hostel_year_id, fee_source,
         bill_description, due_date, quantity, unit_amount, total_amount,
         final_amount, balance_amount, status)
      VALUES
        (v_lp_id, v_inst_id, v_category, v_year_id, 'hostel_category',
         'Hostel room share (settled at ' || v_occupants || ' of ' || v_capacity || ' occupants)',
         (now() + make_interval(days => v_due_days))::date,
         1, v_share, v_share, v_share, v_share, 'unpaid');
    END IF;

    v_billed := v_billed + 1;
    v_lines := v_lines || jsonb_build_object(
      'allocation_id', a.allocation_id, 'learner_id', v_lp_id,
      'action', CASE WHEN p_dry_run THEN 'would_bill' ELSE 'billed' END,
      'amount', v_share);
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE hostel_room_settle_windows
       SET status = 'billed', billed_at = now(), occupants_at_billing = v_occupants
     WHERE id = v_window.id;
  END IF;

  RETURN jsonb_build_object(
    'status',              'closed',
    'dry_run',             p_dry_run,
    'room_id',             p_room_id,
    'window_id',           v_window.id,
    'hostel_year_id',      v_year_id,
    'capacity',            v_capacity,
    'active_occupants',    v_occupants,
    'per_bed_annual_rate', (v_cost->>'per_bed_annual_rate')::numeric,
    'base_room_annual',    (v_cost->>'base_room_annual')::numeric,
    'ac_room_annual',      (v_cost->>'ac_room_annual')::numeric,
    'ac_tonnage',          (v_cost->>'ac_tonnage')::numeric,
    'ac_base_inr_per_month_24h', (v_cost->>'ac_base_inr_per_month_24h')::numeric,
    'base_share',          v_base_share,
    'ac_share',            v_ac_share,
    'share_per_resident',  v_share,
    'due_date',            (now() + make_interval(days => v_due_days))::date,
    'billed_count',        v_billed,
    'skipped_count',       v_skipped,
    'lines',               v_lines);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_bill_close(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_bill_close(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. fn_settle_late_join_credit — rule 6.
--    A learner joined a room that was ALREADY billed. Every resident who was
--    billed gets the difference between the old share and the new share, for
--    the months remaining from the month of joining, as a CREDIT. Never a
--    refund, never a bill rewrite.
--
--    IDEMPOTENCY: each joining event is identified by the joiner's
--    hostel_allocations.id, written to student_credit_balances.source_event_id.
--    A joiner with any credit row already carrying that id is skipped, so a
--    re-run cannot double-credit. That id is only ever used as an event id by
--    this function, so the guard cannot collide with the admission
--    fee-change-event writer that shares source='fee_structure_change'.
--    (A partial unique index was considered and rejected: that writer can emit
--    more than one row per (learner, event) and an index would break it.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_settle_late_join_credit(
  p_room_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window       public.hostel_room_settle_windows%ROWTYPE;
  v_year_id      uuid;
  v_year_end     date;
  v_cost         jsonb;
  v_category     uuid;
  v_base         numeric;
  v_ac           numeric;
  v_n_before     int;
  v_n_after      int;
  v_already_credited int;
  v_share_before numeric;
  v_share_after  numeric;
  v_delta        numeric;
  v_remaining    int;
  v_credit       numeric;
  v_events       jsonb := '[]'::jsonb;
  v_credits      jsonb;
  v_written      int := 0;
  j              record;
  r              record;
  v_lp_id        uuid;
BEGIN
  IF NOT fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'settle-then-bill is disabled (platform policy hostel.settle_bill.enabled = false)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_window
  FROM hostel_room_settle_windows w
  WHERE w.room_id = p_room_id AND w.status = 'billed'
  ORDER BY w.billed_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_billed_window', 'room_id', p_room_id);
  END IF;

  v_year_id := COALESCE(
    v_window.hostel_year_id,
    (SELECT hy.id FROM hostel_years hy WHERE hy.is_current AND hy.is_active LIMIT 1)
  );
  SELECT hy.end_date INTO v_year_end FROM hostel_years hy WHERE hy.id = v_year_id;
  IF v_year_end IS NULL THEN
    RETURN jsonb_build_object('status', 'no_hostel_year', 'room_id', p_room_id,
                              'window_id', v_window.id);
  END IF;

  v_cost := fn_settle_room_annual_cost(p_room_id, v_year_id);
  IF NOT (v_cost->>'found')::boolean THEN
    RETURN jsonb_build_object('status', 'no_rate', 'room_id', p_room_id,
                              'window_id', v_window.id, 'reason', v_cost->>'reason');
  END IF;
  v_category := (v_cost->>'category_id')::uuid;
  v_base     := (v_cost->>'base_room_annual')::numeric;
  v_ac       := (v_cost->>'ac_room_annual')::numeric;

  -- The denominator the last issued credit round left behind: the occupancy at
  -- billing, plus every joiner already credited since.
  SELECT COUNT(*)::int INTO v_already_credited
  FROM hostel_allocations al
  WHERE al.room_id = p_room_id
    AND al.check_out_date IS NULL
    AND al.created_at > v_window.billed_at
    AND EXISTS (SELECT 1 FROM student_credit_balances scb WHERE scb.source_event_id = al.id);

  v_n_before := GREATEST(1, COALESCE(v_window.occupants_at_billing, 1)) + v_already_credited;

  FOR j IN
    SELECT al.id AS allocation_id, al.learner_id, al.check_in_date, al.created_at
    FROM hostel_allocations al
    WHERE al.room_id = p_room_id
      AND al.check_out_date IS NULL
      AND al.created_at > v_window.billed_at
      AND NOT EXISTS (SELECT 1 FROM student_credit_balances scb WHERE scb.source_event_id = al.id)
    ORDER BY al.created_at, al.id
  LOOP
    v_n_after := v_n_before + 1;

    -- Same two-term, separately-rounded shape as computeFeeBreakdown.
    v_share_before := round(v_base / v_n_before) + round(v_ac / v_n_before);
    v_share_after  := round(v_base / v_n_after)  + round(v_ac / v_n_after);
    v_delta        := GREATEST(0, v_share_before - v_share_after);

    -- remainingWholeMonths(joinDate, hostelYear) from hostel-fee-compute-service.ts:
    -- whole months from the month of joining through the hostel-year end,
    -- inclusive, clamped to [0, 12].
    v_remaining := (
      (EXTRACT(YEAR FROM v_year_end)::int * 12 + EXTRACT(MONTH FROM v_year_end)::int)
      - (EXTRACT(YEAR FROM j.check_in_date)::int * 12 + EXTRACT(MONTH FROM j.check_in_date)::int)
    ) + 1;
    v_remaining := GREATEST(0, LEAST(12, v_remaining));

    v_credit  := round(v_delta * v_remaining / 12.0);
    v_credits := '[]'::jsonb;

    IF v_credit > 0 THEN
      FOR r IN
        SELECT al.id AS allocation_id, al.learner_id
        FROM hostel_allocations al
        WHERE al.room_id = p_room_id
          AND al.check_out_date IS NULL
          AND al.id <> j.allocation_id
        ORDER BY al.check_in_date, al.id
      LOOP
        v_lp_id := NULL;
        IF r.learner_id IS NOT NULL THEN
          SELECT p.learner_id INTO v_lp_id FROM profiles p WHERE p.id = r.learner_id;
        END IF;
        CONTINUE WHEN v_lp_id IS NULL;

        -- Only residents who were ACTUALLY billed for this room can be credited
        -- against it. A resident with no hostel bill has nothing to reduce.
        CONTINUE WHEN NOT EXISTS (
          SELECT 1 FROM billing_student_bills b
          WHERE b.student_id       = v_lp_id
            AND b.hostel_year_id   = v_year_id
            AND b.item_category_id = v_category
            AND b.fee_source IN ('academic','hostel_category')
            AND b.status <> 'cancelled'
        );

        IF NOT p_dry_run THEN
          INSERT INTO student_credit_balances
            (student_id, amount, source, source_event_id, is_consumed, notes)
          VALUES
            (v_lp_id, v_credit, 'fee_structure_change', j.allocation_id, false,
             'Campus living settle-then-bill late join: room occupancy '
             || v_n_before || ' → ' || v_n_after || ' from ' || j.check_in_date
             || '. Share ₹' || v_share_before || ' → ₹' || v_share_after
             || ', credited ' || v_remaining || '/12 months.');
          v_written := v_written + 1;
        END IF;

        v_credits := v_credits || jsonb_build_object(
          'learner_id', v_lp_id, 'allocation_id', r.allocation_id, 'amount', v_credit);
      END LOOP;
    END IF;

    v_events := v_events || jsonb_build_object(
      'joiner_allocation_id', j.allocation_id,
      'joined_on',            j.check_in_date,
      'occupants_before',     v_n_before,
      'occupants_after',      v_n_after,
      'share_before',         v_share_before,
      'share_after',          v_share_after,
      'delta_annual',         v_delta,
      'remaining_months',     v_remaining,
      'credit_per_resident',  v_credit,
      'credits',              v_credits);

    v_n_before := v_n_after;
  END LOOP;

  RETURN jsonb_build_object(
    'status',         'ok',
    'dry_run',        p_dry_run,
    'room_id',        p_room_id,
    'window_id',      v_window.id,
    'hostel_year_id', v_year_id,
    'billed_at',      v_window.billed_at,
    'occupants_at_billing', v_window.occupants_at_billing,
    'events',         v_events,
    'credits_written', v_written);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_settle_late_join_credit(uuid, boolean) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_settle_late_join_credit(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Apply-time asserts — the switch must be OFF and anon must be locked out.
--    A revoke that silently did nothing is the failure mode worth catching.
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_open text;
BEGIN
  IF fn_get_policy_bool('hostel.settle_bill.enabled', false) THEN
    RAISE EXCEPTION 'hostel.settle_bill.enabled must ship FALSE — it reads true';
  END IF;

  SELECT string_agg(p.proname, ', ')
    INTO v_open
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_settle_room_annual_cost','fn_settle_window_open',
                      'fn_settle_window_due','fn_settle_bill_close',
                      'fn_settle_late_join_credit')
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'anon still holds EXECUTE on: %', v_open;
  END IF;

  IF has_table_privilege('anon', 'public.hostel_room_settle_windows', 'SELECT') THEN
    RAISE EXCEPTION 'anon still holds SELECT on hostel_room_settle_windows';
  END IF;
END
$assert$;

COMMIT;
