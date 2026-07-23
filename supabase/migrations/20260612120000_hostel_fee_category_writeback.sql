-- Write-back of fee-condition (hostel_program_eligibility) derived room + mess
-- categories onto learners_profiles for HOSTEL learners who already have an
-- academic bill ("existing bill students"). The resolution machinery
-- (fn_hostel_learner_room/mess_categories -> fn_learner_current_year_academic_fee)
-- already exists and is read-only; this adds the missing write layer.
--
-- Companion to 20260611190000_reset_learner_hostel_categories_allocation_sync.sql:
-- that migration made categories allocation-derived (and NULLed everything). This
-- one adds a SECOND derivation source -- the fee band -- for learners who have
-- bills but are not yet allocated.
--
-- Rules (decided 2026-06-12):
--   * Allocation wins  : a learner with an ACTIVE hostel_allocations row keeps the
--                        physical room's category (allocation trigger owns it);
--                        the fee band only fills room for NON-allocated learners.
--   * Overwrite, never wipe : write the resolved value (even if different), but if
--                        the fee resolves no band (fail-open) leave the existing
--                        value untouched -- never reset to NULL.
--   * Mess category is independent of the physical room, so it is fee-derived for
--     everyone (overwrite, never wipe).

-- ── Per-learner apply (SECURITY DEFINER, internal/trigger use only) ──────────
CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories(p_learner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_allocated boolean;
  v_room      uuid;
  v_mess      uuid;
  v_cur_room  uuid;
  v_cur_mess  uuid;
  v_new_room  uuid;
  v_new_mess  uuid;
BEGIN
  -- Defensive: only stamp HOSTEL learners (the fee resolver itself is
  -- accommodation-agnostic, so a day-scholar with a fee could otherwise match).
  PERFORM 1
  FROM learners_profiles lp
  JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
  WHERE lp.id = p_learner_id AND acc.code = 'hostel';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Allocation wins for ROOM: bridge learners_profiles.id -> profiles.learner_id
  -- -> profiles.id (hostel_allocations.learner_id keys on profiles.id).
  v_allocated := EXISTS (
    SELECT 1
    FROM hostel_allocations ha
    JOIN profiles p ON p.id = ha.learner_id
    WHERE p.learner_id = p_learner_id
      AND ha.status = 'active'
  );

  SELECT category_id INTO v_room FROM fn_hostel_learner_room_categories(p_learner_id) LIMIT 1;
  SELECT category_id INTO v_mess FROM fn_hostel_learner_mess_categories(p_learner_id) LIMIT 1;

  SELECT hostel_category_id, mess_category_id
    INTO v_cur_room, v_cur_mess
  FROM learners_profiles
  WHERE id = p_learner_id;

  -- allocation-wins (room) + overwrite-never-wipe
  v_new_room := CASE WHEN v_allocated THEN v_cur_room
                     ELSE COALESCE(v_room, v_cur_room) END;
  v_new_mess := COALESCE(v_mess, v_cur_mess);

  IF v_new_room IS DISTINCT FROM v_cur_room
     OR v_new_mess IS DISTINCT FROM v_cur_mess THEN
    UPDATE learners_profiles
       SET hostel_category_id = v_new_room,
           mess_category_id   = v_new_mess,
           updated_at         = now()
     WHERE id = p_learner_id;
    RETURN true;
  END IF;

  RETURN false;
END
$function$;

-- ── Bulk apply (operator button + one-time backfill) ────────────────────────
-- Scoped to "existing bill students": active hostellers with at least one
-- non-cancelled academic bill. p_institution NULL = every institution.
CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories_bulk(p_institution uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id      uuid;
  v_scanned int := 0;
  v_updated int := 0;
BEGIN
  -- auth.uid() IS NULL => service-role / migration backfill (allowed).
  IF auth.uid() IS NOT NULL
     AND NOT user_has_permission('campus_living.settings.edit') THEN
    RAISE EXCEPTION 'Not authorized to sync learner categories'
      USING ERRCODE = '42501';
  END IF;

  FOR v_id IN
    SELECT lp.id
    FROM learners_profiles lp
    JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
    WHERE acc.code = 'hostel'
      AND lp.lifecycle_status = 'active'
      AND (p_institution IS NULL OR lp.institution_id = p_institution)
      AND EXISTS (
        SELECT 1
        FROM billing_student_bills b
        WHERE b.student_id = lp.id
          AND b.fee_source = 'academic'
          AND b.status NOT IN ('cancelled','superseded')
      )
  LOOP
    v_scanned := v_scanned + 1;
    IF public.fn_apply_hostel_fee_categories(v_id) THEN
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_scanned, 'updated', v_updated);
END
$function$;

-- The per-learner writer is internal only.
REVOKE EXECUTE ON FUNCTION public.fn_apply_hostel_fee_categories(uuid) FROM anon, authenticated, PUBLIC;
-- The bulk writer is callable by authenticated users; it self-gates on the
-- campus_living.settings.edit permission. REVOKE from anon (Supabase grants to
-- anon directly, so REVOKE ... FROM PUBLIC alone is a no-op).
REVOKE EXECUTE ON FUNCTION public.fn_apply_hostel_fee_categories_bulk(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_apply_hostel_fee_categories_bulk(uuid) TO authenticated;

-- ── One-time backfill (idempotent under overwrite-never-wipe) ────────────────
SELECT public.fn_apply_hostel_fee_categories_bulk(NULL);
