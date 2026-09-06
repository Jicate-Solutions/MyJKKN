-- =============================================================================
-- Upgrade bills → dedicated, self-healing billing categories
--
-- _cl_apply_upgrade_fee_bill resolved the bill's item_category_id by KIND
-- ('hostel'/'mess'), which returns the BASE-fee rows ("Hostel Fee"/"Mess Fee")
-- — so upgrade fees were indistinguishable from base fees, and if that kind's
-- category were ever inactive/missing the insert NULL-violated
-- bsb_hostel_cat_required_chk (silently swallowed on the waitlist auto-confirm
-- path → the bed-hold expires and the booking never confirms).
--
-- Now: dedicated "Hostel Upgrade Fee" / "Mess Upgrade Fee" billing categories
-- are ensured-on-demand (created if missing) and upgrade bills are filed under
-- them. Distinct item_category_id also stops base-vs-upgrade bills from
-- colliding on uq_bill_dedup_category. billing_categories is global (no
-- institution scope). This is the single billing helper every upgrade path
-- funnels through (_cl_execute_room_upgrade direct + auto-confirm,
-- fn_self_upgrade_mess_category), so the one change covers all of them.
-- =============================================================================

-- 1) Ensure (create-if-missing) the dedicated upgrade billing category for a kind
CREATE OR REPLACE FUNCTION public._cl_ensure_upgrade_billing_category(p_kind text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_id uuid;
BEGIN
  v_name := CASE p_kind
              WHEN 'hostel' THEN 'Hostel Upgrade Fee'
              WHEN 'mess'   THEN 'Mess Upgrade Fee'
              ELSE initcap(p_kind) || ' Upgrade Fee'
            END;

  -- category_name is globally UNIQUE (uq_billing_categories_name), so resolve
  -- by name and reactivate if it was toggled off — never insert a duplicate.
  SELECT id INTO v_id FROM billing_categories WHERE category_name = v_name LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE billing_categories SET is_active = true, updated_at = now()
     WHERE id = v_id AND NOT is_active;
    RETURN v_id;
  END IF;

  INSERT INTO billing_categories (category_name, kind, frequency, is_active, description)
  VALUES (v_name, p_kind::billing_category_kind, 'one-time', true,
          'Auto-created for hostel/mess category upgrade fees')
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

REVOKE EXECUTE ON FUNCTION public._cl_ensure_upgrade_billing_category(text) FROM anon, authenticated, PUBLIC;

-- 2) Bill the upgrade against the dedicated upgrade category (rest unchanged
--    from the live body checked 2026-06-12)
CREATE OR REPLACE FUNCTION public._cl_apply_upgrade_fee_bill(
  p_learner_lp uuid, p_hostel_year_id uuid, p_kind text, p_upgrade_amount numeric, p_description text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_bcat uuid;
BEGIN
  IF p_upgrade_amount IS NULL OR p_upgrade_amount <= 0 THEN
    RETURN jsonb_build_object('action','none','new_amount',COALESCE(p_upgrade_amount,0),
                              'billed',0,'old_bill_id',NULL);
  END IF;
  SELECT institution_id INTO v_inst FROM learners_profiles WHERE id = p_learner_lp;
  -- Dedicated upgrade billing category (created if missing) — keeps upgrade
  -- fees separate from base "Hostel Fee"/"Mess Fee" and satisfies
  -- bsb_hostel_cat_required_chk even if the category was deleted.
  v_bcat := public._cl_ensure_upgrade_billing_category(p_kind);
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

-- 3) Seed the two upgrade categories up front (idempotent)
INSERT INTO billing_categories (category_name, kind, frequency, is_active, description)
SELECT 'Hostel Upgrade Fee', 'hostel'::billing_category_kind, 'one-time', true,
       'Auto-created for hostel/mess category upgrade fees'
WHERE NOT EXISTS (
  SELECT 1 FROM billing_categories
   WHERE category_name = 'Hostel Upgrade Fee' AND kind = 'hostel'::billing_category_kind
);

INSERT INTO billing_categories (category_name, kind, frequency, is_active, description)
SELECT 'Mess Upgrade Fee', 'mess'::billing_category_kind, 'one-time', true,
       'Auto-created for hostel/mess category upgrade fees'
WHERE NOT EXISTS (
  SELECT 1 FROM billing_categories
   WHERE category_name = 'Mess Upgrade Fee' AND kind = 'mess'::billing_category_kind
);
