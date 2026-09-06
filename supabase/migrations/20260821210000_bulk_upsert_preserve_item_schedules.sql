-- =============================================================================
-- 20260821210000_bulk_upsert_preserve_item_schedules.sql
--
-- PHASE 6 of "Fee Structure — per-item due dates, split thresholds & status
-- rules". Stops the Bulk Import / Export-for-Edit flow from silently erasing
-- everything phases 1-4 added.
--
-- THE BUG
-- -------
-- admission_bulk_upsert_fee_structure rebuilds a structure's items wholesale:
--
--     DELETE FROM admission_fee_structure_items WHERE fee_structure_id = ...;
--     FOR v_item IN ... INSERT INTO admission_fee_structure_items
--       (fee_structure_id, billing_category_id, amount, is_optional, sort_order)
--
-- The re-INSERT names five columns. Every other column on that table therefore
-- comes back as its DEFAULT. As of phase 1 that includes schedule_mode
-- ('single'), due_anchor, due_offset_days, due_date and promotes_to_status_code
-- — and because admission_fee_structure_item_schedules is ON DELETE CASCADE
-- from the item, the DELETE also takes every instalment line with it.
--
-- Net effect without this file: an accounts operator who bulk-edits amounts on
-- a structure — the ordinary way amounts are revised — silently reverts its
-- fees to one bill at +30 days with no status rules. Nothing errors. The list
-- page looks identical. The next learner onboarded is simply billed wrong.
--
-- ALSO FIXED: THE SAME DEFECT, ALREADY LIVE
-- -----------------------------------------
-- applies_to and applies_year_of_study (20260313) are not in the re-INSERT
-- either, so bulk import has ALWAYS reset them to 'every_year' / NULL. A
-- first_year_only fee silently became an every-year fee. That is the same bug
-- in the same three lines this file is rewriting; fixing only the new columns
-- would leave a trap of identical shape immediately beside the one being
-- closed. Restoring it costs two entries in the same snapshot.
--
-- HOW: SNAPSHOT, DELETE, RESTORE
-- ------------------------------
-- Keyed on billing_category_id, which is what identifies an item across the
-- rebuild — item ids do not survive it, and (fee_structure_id,
-- billing_category_id) is already the table's UNIQUE key.
--
-- A category present in the payload but absent from the snapshot is genuinely
-- new and takes the defaults. A category in the snapshot but not the payload
-- has been removed by the operator and its schedule goes with it — that is a
-- deletion they asked for.
--
-- The payload carries no schedule keys today (the xlsx has no columns for
-- them; schedules are authored in the fee structure UI). Should it ever grow
-- them, the payload must win over the snapshot — see the COALESCE order.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='admission_fee_structure_items' AND column_name='schedule_mode') THEN
    RAISE EXCEPTION 'REFUSING: phase 1 (20260821180000) has not been applied.';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.admission_bulk_upsert_fee_structure(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_structure_id   uuid := NULLIF(p_payload->>'structure_id','')::uuid;
  v_institution_id uuid := (p_payload->>'institution_id')::uuid;
  v_existing       record;
  v_item           jsonb;
  v_comm           uuid;
  v_idx            int := 0;
  v_snapshot       jsonb := '{}'::jsonb;
  v_prev           jsonb;
  v_new_item_id    uuid;
  v_line           jsonb;
BEGIN
  IF NOT (user_has_permission('admission_fees.manage')
          AND role_has_institution_access(v_institution_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF v_structure_id IS NULL THEN
    INSERT INTO admission_fee_structures (
      institution_id, degree_id, department_id, programme_id,
      quota_id, admission_year_id, gender, accommodation_type_id,
      hostel_category_id, mess_category_id,
      name, status, notes, effective_from, effective_to
    ) VALUES (
      v_institution_id,
      (p_payload->>'degree_id')::uuid,
      (p_payload->>'department_id')::uuid,
      (p_payload->>'programme_id')::uuid,
      (p_payload->>'quota_id')::uuid,
      (p_payload->>'admission_year_id')::uuid,
      NULLIF(p_payload->>'gender','')::text,
      NULLIF(p_payload->>'accommodation_type_id','')::uuid,
      NULLIF(p_payload->>'hostel_category_id','')::uuid,
      NULLIF(p_payload->>'mess_category_id','')::uuid,
      p_payload->>'name',
      COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      NULLIF(p_payload->>'notes',''),
      NULLIF(p_payload->>'effective_from','')::date,
      NULLIF(p_payload->>'effective_to','')::date
    ) RETURNING id INTO v_structure_id;
  ELSE
    SELECT * INTO v_existing FROM admission_fee_structures WHERE id = v_structure_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'structure_not_found');
    END IF;
    IF v_existing.institution_id <> v_institution_id
       OR v_existing.degree_id        <> (p_payload->>'degree_id')::uuid
       OR v_existing.department_id     <> (p_payload->>'department_id')::uuid
       OR v_existing.programme_id      <> (p_payload->>'programme_id')::uuid
       OR v_existing.quota_id          <> (p_payload->>'quota_id')::uuid
       OR v_existing.admission_year_id <> (p_payload->>'admission_year_id')::uuid THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'dimension_mismatch: dimensions are immutable on edit and no longer match this Fee Structure ID');
    END IF;
    UPDATE admission_fee_structures SET
      gender                = NULLIF(p_payload->>'gender','')::text,
      -- Key absent (older client / partial payload) = preserve current value;
      -- key present with null/'' = explicit "Any accommodation".
      accommodation_type_id = CASE WHEN p_payload ? 'accommodation_type_id'
                                   THEN NULLIF(p_payload->>'accommodation_type_id','')::uuid
                                   ELSE v_existing.accommodation_type_id END,
      -- Same absent-vs-null contract for the hostel tier. Present-and-empty
      -- means "clear it", which is what a retarget away from Hostel sends.
      hostel_category_id    = CASE WHEN p_payload ? 'hostel_category_id'
                                   THEN NULLIF(p_payload->>'hostel_category_id','')::uuid
                                   ELSE v_existing.hostel_category_id END,
      mess_category_id      = CASE WHEN p_payload ? 'mess_category_id'
                                   THEN NULLIF(p_payload->>'mess_category_id','')::uuid
                                   ELSE v_existing.mess_category_id END,
      name                  = p_payload->>'name',
      status                = COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      notes                 = NULLIF(p_payload->>'notes',''),
      effective_from        = NULLIF(p_payload->>'effective_from','')::date,
      effective_to          = NULLIF(p_payload->>'effective_to','')::date,
      updated_at            = now()
    WHERE id = v_structure_id;
  END IF;

  DELETE FROM admission_fee_structure_communities WHERE fee_structure_id = v_structure_id;
  FOR v_comm IN SELECT jsonb_array_elements_text(p_payload->'community_category_ids')::uuid LOOP
    INSERT INTO admission_fee_structure_communities (fee_structure_id, community_category_id)
    VALUES (v_structure_id, v_comm);
  END LOOP;

  -- ── SNAPSHOT, before the wholesale delete ────────────────────────────────
  -- Everything the re-INSERT below does not carry, keyed by category. The
  -- schedule lines have to come along too: they are ON DELETE CASCADE from the
  -- item, so the DELETE takes them whether or not anyone intended it.
  SELECT COALESCE(jsonb_object_agg(fsi.billing_category_id::text, jsonb_build_object(
           'applies_to',              fsi.applies_to,
           'applies_year_of_study',   fsi.applies_year_of_study,
           'schedule_mode',           fsi.schedule_mode,
           'due_anchor',              fsi.due_anchor,
           'due_offset_days',         fsi.due_offset_days,
           'due_date',                fsi.due_date,
           'promotes_to_status_code', fsi.promotes_to_status_code,
           'schedules', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'sequence_no',             s.sequence_no,
                      'share_percent',           s.share_percent,
                      'fixed_amount',            s.fixed_amount,
                      'due_offset_days',         s.due_offset_days,
                      'due_date',                s.due_date,
                      'promotes_to_status_code', s.promotes_to_status_code,
                      'label',                   s.label
                    ) ORDER BY s.sequence_no)
             FROM admission_fee_structure_item_schedules s
             WHERE s.fee_structure_item_id = fsi.id
           ), '[]'::jsonb)
         )), '{}'::jsonb)
    INTO v_snapshot
    FROM admission_fee_structure_items fsi
   WHERE fsi.fee_structure_id = v_structure_id;

  DELETE FROM admission_fee_structure_items WHERE fee_structure_id = v_structure_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    -- '{}' rather than NULL so every ->> below is a miss, not a NULL-propagating
    -- expression: a brand-new category simply takes the column defaults.
    v_prev := COALESCE(v_snapshot -> (v_item->>'billing_category_id'), '{}'::jsonb);

    INSERT INTO admission_fee_structure_items (
      fee_structure_id, billing_category_id, amount, is_optional, sort_order,
      applies_to, applies_year_of_study,
      schedule_mode, due_anchor, due_offset_days, due_date, promotes_to_status_code
    ) VALUES (
      v_structure_id,
      (v_item->>'billing_category_id')::uuid,
      (v_item->>'amount')::numeric,
      COALESCE((v_item->>'is_optional')::boolean, false),
      v_idx,
      -- Payload first, snapshot second, column default last. The payload has no
      -- schedule keys today; this ordering is what makes adding them later a
      -- pure addition rather than a behaviour change.
      COALESCE(NULLIF(v_item->>'applies_to',''), NULLIF(v_prev->>'applies_to',''), 'every_year'),
      COALESCE(NULLIF(v_item->>'applies_year_of_study','')::int,
               NULLIF(v_prev->>'applies_year_of_study','')::int),
      COALESCE(NULLIF(v_item->>'schedule_mode',''), NULLIF(v_prev->>'schedule_mode',''), 'single'),
      COALESCE(NULLIF(v_item->>'due_anchor',''), NULLIF(v_prev->>'due_anchor',''), 'generation_date'),
      COALESCE(NULLIF(v_item->>'due_offset_days','')::int, NULLIF(v_prev->>'due_offset_days','')::int),
      COALESCE(NULLIF(v_item->>'due_date','')::date, NULLIF(v_prev->>'due_date','')::date),
      COALESCE(NULLIF(v_item->>'promotes_to_status_code',''),
               NULLIF(v_prev->>'promotes_to_status_code',''))
    )
    RETURNING id INTO v_new_item_id;

    -- Restore the instalment lines under the newly-minted item id.
    FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(v_prev->'schedules', '[]'::jsonb)) LOOP
      INSERT INTO admission_fee_structure_item_schedules (
        fee_structure_item_id, sequence_no, share_percent, fixed_amount,
        due_offset_days, due_date, promotes_to_status_code, label
      ) VALUES (
        v_new_item_id,
        (v_line->>'sequence_no')::int,
        NULLIF(v_line->>'share_percent','')::numeric,
        NULLIF(v_line->>'fixed_amount','')::numeric,
        NULLIF(v_line->>'due_offset_days','')::int,
        NULLIF(v_line->>'due_date','')::date,
        NULLIF(v_line->>'promotes_to_status_code',''),
        NULLIF(v_line->>'label','')
      );
    END LOOP;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'structure_id', v_structure_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.admission_bulk_upsert_fee_structure(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admission_bulk_upsert_fee_structure(jsonb)
  TO authenticated, service_role;
