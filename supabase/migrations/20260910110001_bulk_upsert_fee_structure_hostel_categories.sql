-- ============================================================================
-- admission_bulk_upsert_fee_structure: carry the hostel room/mess tier
-- ----------------------------------------------------------------------------
-- Follow-up to 20260910110000, which added
-- admission_fee_structures.hostel_category_id / mess_category_id plus
-- trg_fee_structure_hostel_categories_guard.
--
-- The bulk-import RPC built its INSERT/UPDATE column lists explicitly, so it
-- silently dropped the two new keys. A spreadsheet row for an ACTIVE hostel
-- structure would therefore always fail the guard ("must declare both a room
-- category and a mess category") no matter what the sheet said.
--
-- CREATE OR REPLACE (never DROP + CREATE): dropping the function would discard
-- its EXECUTE grants and revert them to PUBLIC.
-- ============================================================================

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

  DELETE FROM admission_fee_structure_items WHERE fee_structure_id = v_structure_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
    INSERT INTO admission_fee_structure_items (
      fee_structure_id, billing_category_id, amount, is_optional, sort_order
    ) VALUES (
      v_structure_id,
      (v_item->>'billing_category_id')::uuid,
      (v_item->>'amount')::numeric,
      COALESCE((v_item->>'is_optional')::boolean, false),
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'structure_id', v_structure_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;
