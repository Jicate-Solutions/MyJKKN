-- Fee-structure sync: permanent function changes, security lockdown, and auto-reconcile cron.
-- Consolidates changes applied 2026-06-21 (campus-living academic-branch removal, the
-- pending-event auto-reconciler, SECURITY DEFINER lockdown, and the hourly pg_cron job).
-- The reconcile ENGINE (admission_fix_fee_mismatch_2026) is created in 20260621100000_*.

-- 1) campus_living_generate_hostel_year_bills: bill HOSTEL/MESS ONLY (academic fees come from
--    the admission fee structure for everyone; the old academic branch double-billed).
CREATE OR REPLACE FUNCTION public.campus_living_generate_hostel_year_bills(p_hostel_year_id uuid, p_learner_ids uuid[], p_dry_run boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_learner uuid;
  lp learners_profiles%ROWTYPE;
  v_hostel jsonb;
  v_item jsonb;
  v_proposed jsonb;
  v_skipped jsonb;
  v_new int;
  v_exists boolean;
  v_cat uuid;
  v_pkg uuid;
  v_src text;
BEGIN
  IF NOT public.user_has_permission('campus_living.fees.config') THEN
    RAISE EXCEPTION 'permission denied: campus_living.fees.config' USING ERRCODE = '42501';
  END IF;

  FOREACH v_learner IN ARRAY p_learner_ids LOOP
    SELECT * INTO lp FROM learners_profiles WHERE id = v_learner;
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM accommodation_types a WHERE a.id = lp.accommodation_type_id AND a.code = 'hostel');

    v_hostel   := public.campus_living_resolve_hostel_fee(v_learner, p_hostel_year_id);
    v_proposed := '[]'::jsonb; v_skipped := '[]'::jsonb; v_new := 0;

    FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_hostel,'[]'::jsonb)) LOOP
      v_src := v_item->>'fee_source'; v_cat := NULLIF(v_item->>'category_id','')::uuid;
      v_pkg := NULLIF(v_item->>'package_id','')::uuid;
      IF v_src = 'hostel_package' THEN
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.package_id=v_pkg
          AND b.fee_source='hostel_package' AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      ELSE
        SELECT EXISTS(SELECT 1 FROM billing_student_bills b WHERE b.student_id=v_learner
          AND b.hostel_year_id=p_hostel_year_id AND b.item_category_id=v_cat
          AND b.fee_source IN ('academic','hostel_category') AND b.status NOT IN ('cancelled','superseded')) INTO v_exists;
      END IF;
      IF v_exists THEN v_skipped := v_skipped || v_item;
      ELSE
        v_proposed := v_proposed || v_item;
        IF NOT p_dry_run THEN
          INSERT INTO billing_student_bills (student_id, institution_id, item_category_id,
            hostel_year_id, package_id, fee_source, academic_year_id, bill_description, due_date,
            quantity, unit_amount, total_amount, final_amount, balance_amount, status)
          VALUES (v_learner, lp.institution_id, v_cat, p_hostel_year_id, v_pkg, v_src, lp.academic_year_id,
            v_item->>'category_name', now()+interval '30 day', 1,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric,
            (v_item->>'amount')::numeric, (v_item->>'amount')::numeric, 'unpaid')
          ON CONFLICT DO NOTHING;
        END IF;
        v_new := v_new + 1;
      END IF;
    END LOOP;

    v_result := v_result || jsonb_build_object(
      'learner_id', v_learner, 'proposed', v_proposed, 'skipped', v_skipped, 'new_count', v_new);
  END LOOP;

  RETURN v_result;
END $function$;

-- 2) Auto-reconciler for pending admission_fee_change_events (per-learner isolated, payment-safe,
--    structure-gated, with a permission guard that still allows the null-uid cron path).
CREATE OR REPLACE FUNCTION public.admission_reconcile_pending_fee_events(p_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $rfn$
DECLARE
  v_ids uuid[]; v_lid uuid;
  v_ok int:=0; v_failed int:=0; v_closed int:=0; v_nostruct int:=0;
  v_dry jsonb; v_has_struct boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.user_has_permission('admission_fees.approve_change_event') THEN
    RAISE EXCEPTION 'permission_denied: admission_fees.approve_change_event required' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(array_agg(distinct learner_id),'{}'::uuid[]) INTO v_ids
    FROM admission_fee_change_events WHERE status='pending_review';
  IF coalesce(array_length(v_ids,1),0)=0 THEN
    RETURN jsonb_build_object('pending_learners',0,'note','no pending events');
  END IF;

  IF p_dry_run THEN
    v_dry := public.admission_fix_fee_mismatch_2026(v_ids, true, false);
    RETURN jsonb_build_object('pending_learners',array_length(v_ids,1),'dry_run',v_dry);
  END IF;

  FOREACH v_lid IN ARRAY v_ids LOOP
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM learners_profiles lp
        JOIN admission_fee_structures afs
          ON afs.institution_id=lp.institution_id AND afs.degree_id=lp.degree_id AND afs.department_id=lp.department_id
         AND afs.programme_id=lp.program_id AND afs.quota_id=lp.quota_id AND afs.admission_year_id=lp.admission_year_id
         AND afs.status='active'
         AND (afs.gender=upper(lp.gender) OR afs.gender IS NULL)
         AND (afs.accommodation_type_id=lp.accommodation_type_id OR afs.accommodation_type_id IS NULL)
        WHERE lp.id=v_lid
          AND EXISTS (SELECT 1 FROM admission_fee_structure_communities j WHERE j.fee_structure_id=afs.id AND j.community_category_id=lp.community_category_id)
      ) INTO v_has_struct;

      IF v_has_struct THEN
        PERFORM public.admission_fix_fee_mismatch_2026(array[v_lid]::uuid[], false, false);
        UPDATE admission_fee_change_events
           SET status='approved', decided_at=now(),
               reason_notes=coalesce(reason_notes,'')||' | Auto-reconciled by admission_reconcile_pending_fee_events'
         WHERE status='pending_review' AND learner_id=v_lid;
        v_ok:=v_ok+1; v_closed:=v_closed+1;
      ELSE
        v_nostruct:=v_nostruct+1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed:=v_failed+1;
    END;
  END LOOP;

  RETURN jsonb_build_object('pending_learners',array_length(v_ids,1),'reconciled',v_ok,
                            'no_structure_left_pending',v_nostruct,'failed',v_failed,'events_closed',v_closed);
END $rfn$;

-- 3) SECURITY: both fns perform financial mutations under SECURITY DEFINER. Owner/cron only.
REVOKE ALL ON FUNCTION public.admission_fix_fee_mismatch_2026(uuid[], boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admission_reconcile_pending_fee_events(boolean) FROM PUBLIC, anon, authenticated;

-- 4) Hourly auto-reconcile job (guarded for environments without pg_cron).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.schedule('admission-reconcile-fee-events', '0 * * * *',
      'select public.admission_reconcile_pending_fee_events(false)');
  END IF;
END $cron$;
