-- =============================================================================
-- Billing Apportionment — RPCs (operational lifecycle), lean v2
-- Spec: specs/billing-apportionment-spec-2026-06-09.md §8
-- Created: 2026-06-09
--
-- Heads = billing_categories rows (Hostel/Transport/Mess Fee). 5 RPCs:
--   preview_rule, apply_rule, submit, approve, reject.
-- Dual-control: .create/.edit make; .approve checks.
-- Dashboard read RPC DEFERRED to downstream dashboard-wiring task (spec §9).
--
-- Every function: SECURITY DEFINER + explicit permission gate (RLS is bypassed
-- by DEFINER, so the gate is in-body) + REVOKE anon/PUBLIC. Idempotent.
-- =============================================================================

-- 1. preview_rule — resolve a rule against a bill → rupee amount (read-only)
CREATE OR REPLACE FUNCTION public.fn_apportionment_preview_rule(p_rule_id UUID, p_bill_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_method TEXT; v_value NUMERIC(12,2); v_bill_total NUMERIC(12,2);
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('billing.apportionment.view')) THEN
    RAISE EXCEPTION 'permission denied: billing.apportionment.view';
  END IF;

  SELECT split_method, split_value INTO v_method, v_value
    FROM billing_apportionment_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rule % not found', p_rule_id; END IF;

  SELECT final_amount INTO v_bill_total FROM billing_student_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'bill % not found', p_bill_id; END IF;

  IF v_method = 'fixed' THEN
    RETURN v_value;
  ELSE
    RETURN ROUND(COALESCE(v_bill_total,0) * v_value / 100.0, 2);
  END IF;
END $$;

-- 2. apply_rule — draft per-bill rows from an APPROVED rule (forward or backfill)
CREATE OR REPLACE FUNCTION public.fn_apportionment_apply_rule(
  p_rule_id UUID, p_bill_ids UUID[], p_source TEXT DEFAULT 'rule')
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_method TEXT; v_value NUMERIC(12,2); v_cat UUID; v_status TEXT; v_active BOOLEAN;
  v_bill UUID; v_total NUMERIC(12,2); v_inst UUID; v_amount NUMERIC(12,2); v_n INTEGER := 0;
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('billing.apportionment.create')) THEN
    RAISE EXCEPTION 'permission denied: billing.apportionment.create';
  END IF;
  IF p_source NOT IN ('rule','backfill') THEN
    RAISE EXCEPTION 'invalid source %', p_source;
  END IF;

  SELECT split_method, split_value, billing_category_id, status, is_active
    INTO v_method, v_value, v_cat, v_status, v_active
    FROM billing_apportionment_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'rule % not found', p_rule_id; END IF;
  IF v_status <> 'approved' OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'rule % is not approved/active (status=%)', p_rule_id, v_status;
  END IF;

  FOREACH v_bill IN ARRAY p_bill_ids LOOP
    SELECT final_amount, institution_id INTO v_total, v_inst
      FROM billing_student_bills WHERE id = v_bill;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF EXISTS (SELECT 1 FROM billing_bill_apportionments
               WHERE bill_id = v_bill AND billing_category_id = v_cat AND status <> 'rejected') THEN
      CONTINUE;
    END IF;

    v_amount := CASE WHEN v_method = 'fixed' THEN v_value
                     ELSE ROUND(COALESCE(v_total,0) * v_value / 100.0, 2) END;

    INSERT INTO billing_bill_apportionments
      (bill_id, institution_id, billing_category_id, amount, source, source_rule_id,
       source_method, source_value, status, created_by, change_reason)
    VALUES
      (v_bill, v_inst, v_cat, v_amount, p_source, p_rule_id,
       v_method, v_value, 'draft', auth.uid(), 'apply_rule ' || p_rule_id::text);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END $$;

-- 3. submit — draft → pending_approval
CREATE OR REPLACE FUNCTION public.fn_apportionment_submit(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('billing.apportionment.create')
          OR user_has_permission('billing.apportionment.edit')) THEN
    RAISE EXCEPTION 'permission denied: billing.apportionment.create/edit';
  END IF;
  UPDATE billing_bill_apportionments
     SET status = 'pending_approval', updated_by = auth.uid()
   WHERE id = ANY(p_ids) AND status = 'draft';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- 4. approve — pending_approval → approved (CHECKER permission)
CREATE OR REPLACE FUNCTION public.fn_apportionment_approve(p_ids UUID[], p_reason TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('billing.apportionment.approve')) THEN
    RAISE EXCEPTION 'permission denied: billing.apportionment.approve';
  END IF;
  UPDATE billing_bill_apportionments
     SET status = 'approved', approved_by = auth.uid(), approved_at = NOW(),
         updated_by = auth.uid(), change_reason = COALESCE(p_reason, change_reason)
   WHERE id = ANY(p_ids) AND status = 'pending_approval';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- 5. reject — pending_approval → rejected (CHECKER permission)
CREATE OR REPLACE FUNCTION public.fn_apportionment_reject(p_ids UUID[], p_reason TEXT DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INTEGER;
BEGIN
  IF NOT (is_super_admin() OR user_has_permission('billing.apportionment.approve')) THEN
    RAISE EXCEPTION 'permission denied: billing.apportionment.approve';
  END IF;
  UPDATE billing_bill_apportionments
     SET status = 'rejected', updated_by = auth.uid(),
         change_reason = COALESCE(p_reason, change_reason)
   WHERE id = ANY(p_ids) AND status = 'pending_approval';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Anon lockdown (CLAUDE.md mandate)
REVOKE EXECUTE ON FUNCTION public.fn_apportionment_preview_rule(UUID, UUID)        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_apportionment_apply_rule(UUID, UUID[], TEXT)  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_apportionment_submit(UUID[])                  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_apportionment_approve(UUID[], TEXT)           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_apportionment_reject(UUID[], TEXT)            FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_apportionment_preview_rule(UUID, UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apportionment_apply_rule(UUID, UUID[], TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apportionment_submit(UUID[])                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apportionment_approve(UUID[], TEXT)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apportionment_reject(UUID[], TEXT)             TO authenticated;

-- =============================================================================
-- END RPCs.
-- =============================================================================
