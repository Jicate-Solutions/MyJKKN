-- 20260610210000_hostel_category_upgrade_fees.sql
-- Category Upgrade Fee Structure (Phase 1).
-- Explicit from→to upgrade pricing (room + mess), per hostel year, replacing the
-- previously-implicit "new full fee − amount paid" differential. A resident upgrading
-- is now billed the CONFIGURED flat upgrade fee (fallback = full-fee difference when no
-- row is configured). Base per-category fees (hostel_fees) are unchanged — still used to
-- bill the first allocation; this table prices the transitions only.

-- 1) Table -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hostel_category_upgrade_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_year_id uuid NOT NULL REFERENCES public.hostel_years(id) ON DELETE CASCADE,
  -- Exactly one kind per row: a room pair OR a mess pair (see chk_upgrade_one_kind).
  from_hostel_category_id uuid REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  to_hostel_category_id   uuid REFERENCES public.hostel_categories(id) ON DELETE CASCADE,
  from_mess_category_id   uuid REFERENCES public.mess_categories(id)  ON DELETE CASCADE,
  to_mess_category_id     uuid REFERENCES public.mess_categories(id)  ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT chk_upgrade_one_kind CHECK (
    (from_hostel_category_id IS NOT NULL AND to_hostel_category_id IS NOT NULL
       AND from_mess_category_id IS NULL AND to_mess_category_id IS NULL)
    OR
    (from_mess_category_id IS NOT NULL AND to_mess_category_id IS NOT NULL
       AND from_hostel_category_id IS NULL AND to_hostel_category_id IS NULL)
  ),
  -- from ≠ to within the populated pair only (the other pair is NULL/NULL, which
  -- IS DISTINCT FROM would wrongly fail — so guard on the from side being present).
  CONSTRAINT chk_upgrade_distinct CHECK (
    (from_hostel_category_id IS NULL OR from_hostel_category_id <> to_hostel_category_id)
    AND (from_mess_category_id IS NULL OR from_mess_category_id <> to_mess_category_id)
  )
);

-- One upgrade fee per (year, from, to) pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_upgrade_fee_pair ON public.hostel_category_upgrade_fees (
  hostel_year_id,
  COALESCE(from_hostel_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(to_hostel_category_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(from_mess_category_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(to_mess_category_id,     '00000000-0000-0000-0000-000000000000'::uuid)
);
CREATE INDEX IF NOT EXISTS idx_upgrade_fee_room ON public.hostel_category_upgrade_fees
  (hostel_year_id, from_hostel_category_id, to_hostel_category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_upgrade_fee_mess ON public.hostel_category_upgrade_fees
  (hostel_year_id, from_mess_category_id, to_mess_category_id) WHERE is_active;

ALTER TABLE public.hostel_category_upgrade_fees ENABLE ROW LEVEL SECURITY;

-- RLS mirrors hostel_fees: read open to authenticated (My Hostel reads it),
-- writes behind campus_living.settings.edit.
DROP POLICY IF EXISTS hostel_category_upgrade_fees_select ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_select ON public.hostel_category_upgrade_fees
  FOR SELECT USING (true);
DROP POLICY IF EXISTS hostel_category_upgrade_fees_insert ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_insert ON public.hostel_category_upgrade_fees
  FOR INSERT WITH CHECK (user_has_permission('campus_living.settings.edit'));
DROP POLICY IF EXISTS hostel_category_upgrade_fees_update ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_update ON public.hostel_category_upgrade_fees
  FOR UPDATE USING (user_has_permission('campus_living.settings.edit'));
DROP POLICY IF EXISTS hostel_category_upgrade_fees_delete ON public.hostel_category_upgrade_fees;
CREATE POLICY hostel_category_upgrade_fees_delete ON public.hostel_category_upgrade_fees
  FOR DELETE USING (user_has_permission('campus_living.settings.edit'));

-- 2) Flat upgrade-fee billing helper -----------------------------------------
-- Bills a single upgrade charge of the configured amount (no supersede of the old
-- category bill — that stays). item_category_id FKs billing_categories (kind
-- 'hostel'/'mess') and is required for hostel_category bills (bsb_hostel_cat_required_chk),
-- so p_kind resolves the matching billing category. Returns UpgradeBillResult shape.
CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text,
  p_upgrade_amount numeric, p_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_inst uuid; v_bcat uuid;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'old_bill_id',NULL);
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;
  SELECT id INTO v_bcat FROM billing_categories
    WHERE kind::text = p_kind AND is_active ORDER BY created_at LIMIT 1;
  INSERT INTO billing_student_bills (
    student_id, institution_id, item_category_id, hostel_year_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
    balance_amount, status
  ) VALUES (
    p_learner_lp, v_inst, v_bcat, p_hostel_year_id, 'hostel_category',
    p_description, now() + interval '30 day', 1, p_upgrade_amount, p_upgrade_amount,
    p_upgrade_amount, p_upgrade_amount, 'unpaid'
  );
  RETURN jsonb_build_object('action','created','new_amount',p_upgrade_amount,
                            'billed',p_upgrade_amount,'old_bill_id',NULL);
END $function$;

REVOKE EXECUTE ON FUNCTION public._cl_apply_upgrade_fee_bill(uuid,uuid,text,numeric,text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public._cl_apply_upgrade_fee_bill(uuid,uuid,text,numeric,text) TO authenticated;

-- 3) Upgrade option loaders — now return the explicit upgrade_fee ------------
DROP FUNCTION IF EXISTS public.fn_my_upgrade_room_categories();
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_room_categories()
RETURNS TABLE(category_id uuid, name text, type text, current_year_fee numeric,
              upgrade_fee numeric, available_beds integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;

  RETURN QUERY
  SELECT mc.id, mc.name, mc.type, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_hostel_category_id = v_cur_cat
              AND uf.to_hostel_category_id = mc.id
            LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee,
         (SELECT count(*)::int FROM fn_my_room_options(mc.id))
  FROM fn_my_manual_categories() mc
  JOIN hostel_fees hf
    ON hf.hostel_category_id = mc.id AND hf.hostel_year_id = v_year AND hf.mess_category_id IS NULL AND hf.is_active
  WHERE mc.id <> COALESCE(v_cur_cat, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $function$;

DROP FUNCTION IF EXISTS public.fn_my_upgrade_mess_categories();
CREATE OR REPLACE FUNCTION public.fn_my_upgrade_mess_categories()
RETURNS TABLE(mess_category_id uuid, name text, current_year_fee numeric, upgrade_fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_allow uuid[];
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RETURN; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RETURN; END IF;
  -- Qualify lp.* — the OUT column `mess_category_id` would otherwise shadow the table column.
  SELECT lp.mess_category_id INTO v_cur_mess FROM learners_profiles lp WHERE lp.id = v_lp;
  SELECT COALESCE(hf.amount,0) INTO v_cur_fee FROM hostel_fees hf
    WHERE hf.mess_category_id = v_cur_mess AND hf.hostel_year_id = v_year AND hf.is_active LIMIT 1;
  SELECT array_agg(category_id) INTO v_allow FROM fn_hostel_learner_mess_categories(v_lp);

  RETURN QUERY
  SELECT m.id, m.name, hf.amount,
         COALESCE(
           (SELECT uf.amount FROM hostel_category_upgrade_fees uf
            WHERE uf.hostel_year_id = v_year AND uf.is_active
              AND uf.from_mess_category_id = v_cur_mess
              AND uf.to_mess_category_id = m.id
            LIMIT 1),
           hf.amount - v_cur_fee
         ) AS upgrade_fee
  FROM mess_categories m
  JOIN hostel_fees hf
    ON hf.mess_category_id = m.id AND hf.hostel_year_id = v_year AND hf.is_active
  WHERE m.is_active
    AND (v_allow IS NULL OR m.id = ANY(v_allow))
    AND m.id <> COALESCE(v_cur_mess, '00000000-0000-0000-0000-000000000000'::uuid)
    AND hf.amount >= v_cur_fee
  ORDER BY hf.amount;
END $function$;

-- 4) Self-upgrade RPCs — bill the flat configured upgrade fee -----------------
CREATE OR REPLACE FUNCTION public.fn_self_upgrade_room_category(p_new_category_id uuid, p_room_id uuid, p_bed_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_profile uuid := auth.uid();
  v_year uuid; v_cur_cat uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric;
  v_bed_status text; v_old RECORD; v_new_alloc uuid; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR v_profile IS NULL OR NOT user_is_hosteler() THEN
    RAISE EXCEPTION 'Only a hostel resident can upgrade';
  END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE hostel_category_id = p_new_category_id AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM hostel_categories WHERE id = p_new_category_id;

  SELECT hostel_category_id INTO v_cur_cat FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM hostel_categories WHERE id = v_cur_cat;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE hostel_category_id = v_cur_cat AND hostel_year_id = v_year AND mess_category_id IS NULL AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM fn_my_room_options(p_new_category_id) o
    WHERE o.bed_id = p_bed_id AND o.room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'That room/bed is not an available option for you';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext(p_bed_id::text)) THEN
    RAISE EXCEPTION 'Another resident is claiming this bed. Try again.';
  END IF;
  SELECT status INTO v_bed_status FROM hostel_beds WHERE id = p_bed_id AND room_id = p_room_id;
  IF v_bed_status IS DISTINCT FROM 'available' THEN RAISE EXCEPTION 'That bed is no longer available'; END IF;

  SELECT id, bed_id, tier_id, academic_year_id, semester_id, institution_id,
         emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    INTO v_old
    FROM hostel_allocations
    WHERE learner_id = v_profile AND status = 'active'
    ORDER BY allocation_date DESC LIMIT 1;
  IF v_old.id IS NULL THEN RAISE EXCEPTION 'You have no active allocation to upgrade from'; END IF;

  UPDATE hostel_allocations SET status='vacated', actual_vacate_date=CURRENT_DATE, updated_at=now()
    WHERE id = v_old.id;
  UPDATE hostel_beds SET status='available', current_occupant_id=NULL WHERE id = v_old.bed_id;

  INSERT INTO hostel_allocations (
    institution_id, learner_id, block_id, room_id, bed_id, academic_year_id, semester_id,
    allocation_type, allocation_date, status,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
    tier_id, allocated_by
  )
  SELECT v_old.institution_id, v_profile, r.block_id, p_room_id, p_bed_id,
         v_old.academic_year_id, v_old.semester_id, 'transfer', CURRENT_DATE, 'active',
         v_old.emergency_contact_name, v_old.emergency_contact_phone, v_old.emergency_contact_relation,
         v_old.tier_id, v_profile
  FROM hostel_rooms r WHERE r.id = p_room_id
  RETURNING id INTO v_new_alloc;
  UPDATE hostel_beds SET status='occupied', current_occupant_id=v_profile WHERE id = p_bed_id;

  UPDATE learners_profiles SET hostel_category_id = p_new_category_id, updated_at=now() WHERE id = v_lp;

  -- Flat upgrade fee: configured (from→to), else fallback to the full-fee difference.
  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_hostel_category_id = v_cur_cat AND to_hostel_category_id = p_new_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'hostel', v_upgrade_fee,
              format('Hostel room upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));

  UPDATE hostel_waitlist
     SET status='allocated', allocated_allocation_id=v_new_alloc, updated_at=now()
   WHERE learner_id = v_profile AND entry_kind='upgrade'
     AND target_hostel_category_id = p_new_category_id AND status='waiting';

  RETURN jsonb_build_object('success', true, 'old_allocation_id', v_old.id,
    'new_allocation_id', v_new_alloc, 'new_bed_id', p_bed_id,
    'old_category_id', v_cur_cat, 'new_category_id', p_new_category_id,
    'old_fee', v_cur_fee, 'new_fee', v_new_fee, 'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_self_upgrade_mess_category(p_new_mess_category_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_lp uuid := get_my_learner_id();
  v_year uuid; v_cur_mess uuid; v_cur_fee numeric := 0; v_new_fee numeric;
  v_new_name text; v_cur_name text; v_upgrade_fee numeric; v_allow uuid[]; v_bill jsonb;
BEGIN
  IF v_lp IS NULL OR NOT user_is_hosteler() THEN RAISE EXCEPTION 'Only a hostel resident can upgrade'; END IF;
  SELECT id INTO v_year FROM hostel_years WHERE is_current LIMIT 1;
  IF v_year IS NULL THEN RAISE EXCEPTION 'No current hostel year configured'; END IF;

  SELECT amount INTO v_new_fee FROM hostel_fees
    WHERE mess_category_id = p_new_mess_category_id AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee IS NULL THEN RAISE EXCEPTION 'Selected mess category has no published fee for the current hostel year'; END IF;
  SELECT name INTO v_new_name FROM mess_categories WHERE id = p_new_mess_category_id;

  SELECT array_agg(category_id) INTO v_allow FROM fn_hostel_learner_mess_categories(v_lp);
  IF v_allow IS NOT NULL AND NOT (p_new_mess_category_id = ANY(v_allow)) THEN
    RAISE EXCEPTION 'You are not eligible for this mess category';
  END IF;

  SELECT mess_category_id INTO v_cur_mess FROM learners_profiles WHERE id = v_lp;
  SELECT name INTO v_cur_name FROM mess_categories WHERE id = v_cur_mess;
  SELECT COALESCE(amount,0) INTO v_cur_fee FROM hostel_fees
    WHERE mess_category_id = v_cur_mess AND hostel_year_id = v_year AND is_active LIMIT 1;
  IF v_new_fee < v_cur_fee THEN RAISE EXCEPTION 'Downgrades are not allowed (new fee < current fee)'; END IF;

  UPDATE learners_profiles SET mess_category_id = p_new_mess_category_id, updated_at=now() WHERE id = v_lp;

  SELECT amount INTO v_upgrade_fee FROM hostel_category_upgrade_fees
    WHERE hostel_year_id = v_year AND is_active
      AND from_mess_category_id = v_cur_mess AND to_mess_category_id = p_new_mess_category_id LIMIT 1;
  v_upgrade_fee := COALESCE(v_upgrade_fee, v_new_fee - v_cur_fee);
  v_bill := public._cl_apply_upgrade_fee_bill(v_lp, v_year, 'mess', v_upgrade_fee,
              format('Mess upgrade: %s → %s', COALESCE(v_cur_name,'—'), v_new_name));

  RETURN jsonb_build_object('success', true, 'old_category_id', v_cur_mess,
    'new_category_id', p_new_mess_category_id, 'old_fee', v_cur_fee, 'new_fee', v_new_fee,
    'upgrade_fee', v_upgrade_fee, 'bill', v_bill);
END $function$;
