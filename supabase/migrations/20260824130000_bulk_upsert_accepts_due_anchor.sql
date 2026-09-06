-- =============================================================================
-- 20260824130000_bulk_upsert_accepts_due_anchor.sql
--
-- admission_bulk_upsert_fee_structure learns about due_anchor -- the field that
-- decides whether a due date the bulk sheet writes is ever READ.
--
-- WHAT WAS WRONG
-- --------------
-- The RPC hardcoded the anchor to whatever the item already had:
--
--     COALESCE(NULLIF(v_prev->>'due_anchor',''), 'generation_date')
--
-- and every one of the 949 fee items in this database is 'generation_date'.
-- Meanwhile the generation engine (20260821190000) resolves an UNSPLIT item's
-- due date as:
--
--     instalment_due_date := CASE
--       WHEN v_anchor = 'fixed_date' AND v_item_due IS NOT NULL THEN v_item_due
--       ELSE v_anchor_base + COALESCE(v_item_offset, v_default_offset, 30) END
--
-- So a hard Due Date typed into the "Fee Schedules" tab was accepted by the
-- importer, stored on the row, reported as a success -- and then ignored at
-- billing time, forever. The template's own instructions (step S10) advertised
-- that exact path. It was a silent no-op, which is the worst shape a bug can
-- take in a bulk tool: nothing to see in the preview, nothing in the logs, and
-- a due date in the table that the generated bills disagree with.
--
-- It also meant 'academic_year_start' -- offered by the on-screen editor since
-- 20260821180000 -- was unreachable from the sheet at any scale.
--
-- WHAT CHANGES
-- ------------
-- 1. The sheet's per-item due_anchor wins when given. Same three-state contract
--    as package_type and the tier columns: absent/blank leaves the stored
--    anchor alone, so an older workbook (or a blank column) changes nothing.
-- 2. A stale 'fixed_date' SELF-HEALS to 'generation_date' when the thing it
--    pointed at is gone -- the operator cleared the Due Date, or split the fee
--    so the instalments carry their own dates. Without this, clearing a date
--    would trip chk_afsi_due_date_required_for_fixed and fail the row with a
--    raw Postgres message halfway through a batch.
--
-- The importer derives 'fixed_date' whenever a whole-fee row carries a Due Date
-- (see DUE_ANCHOR_LABELS in fee-structure-excel-mappings.ts), so the common
-- case needs no new column-filling from the operator; the column is there for
-- 'academic_year_start' and for reading back what is already set.
--
-- NO BEGIN/COMMIT: the apply path wraps this file in one transaction.
-- =============================================================================

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
  v_sheet          jsonb := '{}'::jsonb;
  v_cfg            jsonb;
  v_new_item_id    uuid;
  v_line           jsonb;
  v_seq            int;
  v_has_sheet      boolean := (p_payload ? 'item_schedules');
  v_mode           text;
  v_anchor         text;
  v_due_date       date;
BEGIN
  IF NOT (user_has_permission('admission_fees.manage')
          AND role_has_institution_access(v_institution_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  -- Sheet-supplied schedules, re-keyed by category for O(1) lookup in the loop.
  IF v_has_sheet THEN
    SELECT COALESCE(jsonb_object_agg(e->>'billing_category_id', e), '{}'::jsonb)
      INTO v_sheet
    FROM jsonb_array_elements(COALESCE(p_payload->'item_schedules','[]'::jsonb)) e
    WHERE NULLIF(e->>'billing_category_id','') IS NOT NULL;
  END IF;

  IF v_structure_id IS NULL THEN
    INSERT INTO admission_fee_structures (
      institution_id, degree_id, department_id, programme_id,
      quota_id, admission_year_id, gender, accommodation_type_id,
      hostel_category_id, mess_category_id, package_type,
      name, status, notes, effective_from, effective_to,
      default_due_offset_days
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
      NULLIF(p_payload->>'package_type','')::text,
      p_payload->>'name',
      COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      NULLIF(p_payload->>'notes',''),
      NULLIF(p_payload->>'effective_from','')::date,
      NULLIF(p_payload->>'effective_to','')::date,
      COALESCE(NULLIF(p_payload->>'default_due_offset_days','')::int, 30)
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
      accommodation_type_id = CASE WHEN p_payload ? 'accommodation_type_id'
                                   THEN NULLIF(p_payload->>'accommodation_type_id','')::uuid
                                   ELSE v_existing.accommodation_type_id END,
      hostel_category_id    = CASE WHEN p_payload ? 'hostel_category_id'
                                   THEN NULLIF(p_payload->>'hostel_category_id','')::uuid
                                   ELSE v_existing.hostel_category_id END,
      mess_category_id      = CASE WHEN p_payload ? 'mess_category_id'
                                   THEN NULLIF(p_payload->>'mess_category_id','')::uuid
                                   ELSE v_existing.mess_category_id END,
      -- Same absent-key contract as the tier columns above. package_type is a
      -- LABEL, not a matching dimension -- no function reads it, and it is not
      -- in the overlap identity -- so it is editable on an UPDATE row where the
      -- six dimensions are frozen.
      package_type          = CASE WHEN p_payload ? 'package_type'
                                   THEN NULLIF(p_payload->>'package_type','')::text
                                   ELSE v_existing.package_type END,
      name                  = p_payload->>'name',
      status                = COALESCE(NULLIF(p_payload->>'status',''),'draft'),
      notes                 = NULLIF(p_payload->>'notes',''),
      effective_from        = NULLIF(p_payload->>'effective_from','')::date,
      effective_to          = NULLIF(p_payload->>'effective_to','')::date,
      -- Absent key = leave it alone, same contract as the tier columns above.
      default_due_offset_days = CASE WHEN p_payload ? 'default_due_offset_days'
                                     THEN COALESCE(NULLIF(p_payload->>'default_due_offset_days','')::int,
                                                   v_existing.default_due_offset_days)
                                     ELSE v_existing.default_due_offset_days END,
      updated_at            = now()
    WHERE id = v_structure_id;
  END IF;

  DELETE FROM admission_fee_structure_communities WHERE fee_structure_id = v_structure_id;
  FOR v_comm IN SELECT jsonb_array_elements_text(p_payload->'community_category_ids')::uuid LOOP
    INSERT INTO admission_fee_structure_communities (fee_structure_id, community_category_id)
    VALUES (v_structure_id, v_comm);
  END LOOP;

  -- ── SNAPSHOT everything the item re-INSERT does not carry ────────────────
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
    v_prev := COALESCE(v_snapshot -> (v_item->>'billing_category_id'), '{}'::jsonb);
    -- The sheet wins for a category it names; every other category falls back
    -- to what was there before.
    v_cfg  := v_sheet -> (v_item->>'billing_category_id');

    -- Resolve mode / anchor / date TOGETHER: the anchor is what decides whether
    -- due_date is ever read, and chk_afsi_due_date_required_for_fixed refuses a
    -- single 'fixed_date' item that has no date under it.
    v_mode := COALESCE(NULLIF(v_cfg->>'schedule_mode',''),
                       NULLIF(v_prev->>'schedule_mode',''), 'single');
    v_due_date := CASE WHEN v_cfg IS NOT NULL THEN NULLIF(v_cfg->>'due_date','')::date
                       ELSE NULLIF(v_prev->>'due_date','')::date END;
    -- The sheet CARRIES the anchor now; blank/absent still means "leave alone".
    v_anchor := COALESCE(NULLIF(v_cfg->>'due_anchor',''),
                         NULLIF(v_prev->>'due_anchor',''), 'generation_date');
    -- Self-heal: the date it pointed at is gone (cleared, or the fee was split
    -- so the lines own their dates). Leaving 'fixed_date' here would either
    -- violate the CHECK or silently base offsets on a date that is not there.
    IF v_anchor = 'fixed_date' AND (v_mode = 'split' OR v_due_date IS NULL) THEN
      v_anchor := 'generation_date';
    END IF;

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
      COALESCE(NULLIF(v_item->>'applies_to',''), NULLIF(v_prev->>'applies_to',''), 'every_year'),
      COALESCE(NULLIF(v_item->>'applies_year_of_study','')::int,
               NULLIF(v_prev->>'applies_year_of_study','')::int),
      v_mode,
      v_anchor,
      CASE WHEN v_cfg IS NOT NULL THEN NULLIF(v_cfg->>'due_offset_days','')::int
           ELSE NULLIF(v_prev->>'due_offset_days','')::int END,
      v_due_date,
      CASE WHEN v_cfg IS NOT NULL THEN NULLIF(v_cfg->>'promotes_to_status_code','')
           ELSE NULLIF(v_prev->>'promotes_to_status_code','') END
    )
    RETURNING id INTO v_new_item_id;

    -- Instalment lines: the sheet's if it named this category, else the
    -- snapshot's. Re-sequenced from 1 either way, because the shape validator
    -- rejects gaps and the sheet may legitimately have been sorted by date.
    v_seq := 0;
    FOR v_line IN
      SELECT * FROM jsonb_array_elements(
        CASE WHEN v_cfg IS NOT NULL
             THEN COALESCE(v_cfg->'lines', '[]'::jsonb)
             ELSE COALESCE(v_prev->'schedules', '[]'::jsonb) END)
    LOOP
      v_seq := v_seq + 1;
      INSERT INTO admission_fee_structure_item_schedules (
        fee_structure_item_id, sequence_no, share_percent, fixed_amount,
        due_offset_days, due_date, promotes_to_status_code, label
      ) VALUES (
        v_new_item_id,
        v_seq,
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
