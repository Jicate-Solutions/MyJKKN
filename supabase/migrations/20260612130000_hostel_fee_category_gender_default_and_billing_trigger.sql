-- Extends 20260612120000: makes the fee-condition category write-back
--   (1) GENDER-AWARE  -- a band only matches if its category's gender (boys/girls)
--       matches the learner; categories are global but gender-typed.
--   (2) CLASSIC-DEFAULTED -- a learner WITH an academic bill whose fee matches no
--       gender-appropriate band falls back to the gender-matched "Classic Room" +
--       "Classic" mess (instead of fail-open NULL).
--   (3) AUTO-APPLIED on bill generation via fail-safe statement-level triggers on
--       billing_student_bills (covers admission auto-sync, bulk import, manual).
--
-- Precedence unchanged: allocation wins ROOM; overwrite-never-wipe. Gender map is
-- tolerant (m%->boys, f%->girls; blank/OTHER -> no gendered default => fail-open).
--
-- NOTE (data): when this shipped every fee band pointed to GIRLS categories, so
-- gender-aware matching moved 22 male BDS learners off girls-Deluxe onto Classic
-- boys (no boys bands existed yet). Configure boys bands to give them band rooms.

-- ── Rebuilt per-learner apply (gender-aware + Classic default) ───────────────
CREATE OR REPLACE FUNCTION public.fn_apply_hostel_fee_categories(p_learner_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender      text;
  v_gender_type text;   -- 'boys' | 'girls' | NULL
  v_allocated   boolean;
  v_has_bill    boolean;
  v_room        uuid;
  v_mess        uuid;
  v_cur_room    uuid;
  v_cur_mess    uuid;
  v_new_room    uuid;
  v_new_mess    uuid;
BEGIN
  -- Only stamp HOSTEL learners.
  SELECT lp.gender
    INTO v_gender
  FROM learners_profiles lp
  JOIN accommodation_types acc ON acc.id = lp.accommodation_type_id
  WHERE lp.id = p_learner_id AND acc.code = 'hostel';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_gender_type := CASE
                     WHEN lower(v_gender) LIKE 'm%' THEN 'boys'
                     WHEN lower(v_gender) LIKE 'f%' THEN 'girls'
                     ELSE NULL
                   END;

  -- Default-to-Classic only applies to learners who actually have a bill.
  v_has_bill := EXISTS (
    SELECT 1 FROM billing_student_bills b
    WHERE b.student_id = p_learner_id
      AND b.fee_source = 'academic'
      AND b.status NOT IN ('cancelled','superseded')
  );

  -- Allocation wins for ROOM.
  v_allocated := EXISTS (
    SELECT 1
    FROM hostel_allocations ha
    JOIN profiles p ON p.id = ha.learner_id
    WHERE p.learner_id = p_learner_id
      AND ha.status = 'active'
  );

  -- (1) Gender-matched fee-band category (NULL gender => no band).
  SELECT r.category_id INTO v_room
  FROM fn_hostel_learner_room_categories(p_learner_id) r
  JOIN hostel_categories hc ON hc.id = r.category_id
  WHERE hc.type = v_gender_type
  LIMIT 1;

  SELECT m.category_id INTO v_mess
  FROM fn_hostel_learner_mess_categories(p_learner_id) m
  JOIN mess_categories mc ON mc.id = m.category_id
  WHERE mc.type = v_gender_type
  LIMIT 1;

  -- (2) Classic default (gender-matched) for bill-holders with no band match.
  IF v_room IS NULL AND v_has_bill AND v_gender_type IS NOT NULL THEN
    SELECT id INTO v_room
    FROM hostel_categories
    WHERE name = 'Classic Room' AND type = v_gender_type AND is_active
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  IF v_mess IS NULL AND v_has_bill AND v_gender_type IS NOT NULL THEN
    SELECT id INTO v_mess
    FROM mess_categories
    WHERE name = 'Classic' AND type = v_gender_type AND is_active
    ORDER BY sort_order
    LIMIT 1;
  END IF;

  -- Apply: allocation-wins (room) + overwrite-never-wipe.
  SELECT hostel_category_id, mess_category_id
    INTO v_cur_room, v_cur_mess
  FROM learners_profiles
  WHERE id = p_learner_id;

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

-- ── Auto-apply on bill generation (fail-safe, statement-level) ──────────────
-- Transition tables cannot be shared across events, so INSERT and UPDATE get
-- their own trigger; both call the same handler (which reads `new_rows`).
CREATE OR REPLACE FUNCTION public.trg_bill_apply_hostel_fee_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Never block a bill write over category syncing.
  BEGIN
    PERFORM public.fn_apply_hostel_fee_categories(s.student_id)
    FROM (
      SELECT DISTINCT student_id
      FROM new_rows
      WHERE fee_source = 'academic'
        AND student_id IS NOT NULL
    ) s;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trg_bill_apply_hostel_fee_categories: %', SQLERRM;
  END;
  RETURN NULL;
END
$function$;

DROP TRIGGER IF EXISTS trg_bill_apply_hostel_fee_categories_ins ON public.billing_student_bills;
CREATE TRIGGER trg_bill_apply_hostel_fee_categories_ins
  AFTER INSERT ON public.billing_student_bills
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_bill_apply_hostel_fee_categories();

DROP TRIGGER IF EXISTS trg_bill_apply_hostel_fee_categories_upd ON public.billing_student_bills;
CREATE TRIGGER trg_bill_apply_hostel_fee_categories_upd
  AFTER UPDATE ON public.billing_student_bills
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_bill_apply_hostel_fee_categories();

-- ── Re-run backfill with the new gender-aware + Classic-default logic ────────
SELECT public.fn_apply_hostel_fee_categories_bulk(NULL);
