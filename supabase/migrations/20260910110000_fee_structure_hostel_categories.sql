-- ============================================================================
-- Hostel ROOM + MESS categories on the admission fee structure
-- ----------------------------------------------------------------------------
-- Spec: docs/superpowers/specs/2026-08-20-fee-structure-hostel-categories-design.md
--
-- WHY
--   Room/mess categories were never declared anywhere. They were reverse-
--   engineered from the learner's total academic fee via hostel_program_
--   eligibility fee BANDS, and anything outside every band fell through to a
--   hardcoded 'Classic Room' / 'Classic'. With 111 hostel fee structures and
--   only 12 band rules, 68% of hostel learners ended up stamped Classic.
--
--   The fee structure IS the package definition and already carries
--   accommodation_type_id, so the tier belongs here as a declaration rather
--   than as an amount-derived inference.
--
-- SCOPE — DECLARATION LAYER ONLY. This migration is deliberately INERT:
--   nothing in the database reads the two new columns yet.
--   fn_apply_hostel_fee_categories, trg_bill_apply_hostel_fee_categories,
--   hostel_program_eligibility and every campus-living function are UNTOUCHED,
--   and ZERO learners_profiles rows are modified. Wiring the resolver is a
--   separate, separately-approved change (spec section 7).
--
-- GENDER CONVENTION
--   hostel_categories / mess_categories are gender-partitioned: 'Classic Room'
--   exists as both type='boys' and type='girls'. Fee structures normally leave
--   `gender` NULL because they cover both. The stored row's `type` is therefore
--   NOT semantically meaningful — it is a canonical handle, and every future
--   read remaps `name` to the learner's own gender variant. This is exactly the
--   pattern fn_apply_hostel_fee_categories already uses at its step (1).
-- ============================================================================

-- No explicit BEGIN/COMMIT: matches repo convention — the migration runner
-- wraps the whole file in one transaction, so a failed assertion below rolls
-- the columns, backfill and trigger back together.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
-- ON DELETE RESTRICT is deliberate: once ~111 structures reference
-- 'Classic Room', deleting that category must fail loudly rather than silently
-- NULL out a hundred packages.
ALTER TABLE public.admission_fee_structures
  ADD COLUMN IF NOT EXISTS hostel_category_id uuid
    REFERENCES public.hostel_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mess_category_id uuid
    REFERENCES public.mess_categories(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.admission_fee_structures.hostel_category_id IS
  'Declared hostel ROOM category for this package. Only meaningful when accommodation_type_id resolves to accommodation_types.code = ''hostel''; required to ACTIVATE such a structure. The referenced row''s `type` (boys/girls) is a canonical handle only — readers remap by `name` to the learner''s gender variant.';

COMMENT ON COLUMN public.admission_fee_structures.mess_category_id IS
  'Declared MESS category for this package. Same hostel-only + gender-remap semantics as hostel_category_id.';

-- ---------------------------------------------------------------------------
-- 2. Backfill — every existing hostel structure starts at Classic Room / Classic
-- ---------------------------------------------------------------------------
-- All 236 structures are already status='active', so the backfill MUST land
-- before the guard trigger below or activation would be impossible.
--
-- Blanket Classic (not band-derived) is the explicit product decision: admins
-- correct each package by hand in the UI. Safe to do bluntly precisely because
-- nothing reads these columns yet.
--
-- trg_admission_fee_structures_touch is disabled for the duration: it sets
-- updated_at = now(), and `updated_at DESC` is the FINAL TIEBREAK in fee
-- structure resolution (admission_resolve_fee_items_for_lead). Bumping 111 rows
-- in one statement would rewrite that ordering wholesale.
ALTER TABLE public.admission_fee_structures
  DISABLE TRIGGER trg_admission_fee_structures_touch;

WITH canon_room AS (
  SELECT id
    FROM public.hostel_categories
   WHERE name = 'Classic Room' AND is_active
   ORDER BY type, sort_order
   LIMIT 1
), canon_mess AS (
  SELECT id
    FROM public.mess_categories
   WHERE name = 'Classic' AND is_active
   ORDER BY type, sort_order
   LIMIT 1
)
UPDATE public.admission_fee_structures fs
   SET hostel_category_id = (SELECT id FROM canon_room),
       mess_category_id   = (SELECT id FROM canon_mess)
  FROM public.accommodation_types a
 WHERE a.id = fs.accommodation_type_id
   AND a.code = 'hostel';

ALTER TABLE public.admission_fee_structures
  ENABLE TRIGGER trg_admission_fee_structures_touch;

-- ---------------------------------------------------------------------------
-- 3. Guard trigger
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is REQUIRED, not incidental. accommodation_types has RLS
-- `SELECT` gated on `auth.uid() IS NOT NULL`. A service-role / cron / webhook
-- write has auth.uid() = NULL, so an invoker-rights guard would read zero rows,
-- conclude "not a hostel structure", and then REJECT a valid hostel row that
-- carries categories. This guard enforces integrity, never authorization.
CREATE OR REPLACE FUNCTION public._fee_structure_hostel_categories_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_hostel boolean;
BEGIN
  v_is_hostel := EXISTS (
    SELECT 1
      FROM public.accommodation_types a
     WHERE a.id = NEW.accommodation_type_id
       AND a.code = 'hostel'
  );

  IF NOT v_is_hostel THEN
    IF NEW.hostel_category_id IS NOT NULL OR NEW.mess_category_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Room/mess categories may only be set on a HOSTEL fee structure (accommodation_type_id must reference accommodation_types.code = ''hostel'')'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'active'
     AND (NEW.hostel_category_id IS NULL OR NEW.mess_category_id IS NULL) THEN
    RAISE EXCEPTION
      'An ACTIVE hostel fee structure must declare both a room category and a mess category'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE EXECUTE ON FUNCTION public._fee_structure_hostel_categories_guard() FROM anon;

DROP TRIGGER IF EXISTS trg_fee_structure_hostel_categories_guard
  ON public.admission_fee_structures;

CREATE TRIGGER trg_fee_structure_hostel_categories_guard
  BEFORE INSERT OR UPDATE ON public.admission_fee_structures
  FOR EACH ROW
  EXECUTE FUNCTION public._fee_structure_hostel_categories_guard();

-- ---------------------------------------------------------------------------
-- 4. Assertions — fail the migration rather than ship a half-applied state
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_unset  int;
  v_leaked int;
  v_wrong  int;
BEGIN
  -- (a) every hostel structure now declares both categories
  SELECT count(*) INTO v_unset
    FROM public.admission_fee_structures fs
    JOIN public.accommodation_types a ON a.id = fs.accommodation_type_id
   WHERE a.code = 'hostel'
     AND (fs.hostel_category_id IS NULL OR fs.mess_category_id IS NULL);
  IF v_unset > 0 THEN
    RAISE EXCEPTION 'backfill incomplete: % hostel structure(s) still missing a category', v_unset;
  END IF;

  -- (b) no non-hostel structure picked up a category
  SELECT count(*) INTO v_leaked
    FROM public.admission_fee_structures fs
    LEFT JOIN public.accommodation_types a ON a.id = fs.accommodation_type_id
   WHERE COALESCE(a.code, '') <> 'hostel'
     AND (fs.hostel_category_id IS NOT NULL OR fs.mess_category_id IS NOT NULL);
  IF v_leaked > 0 THEN
    RAISE EXCEPTION 'backfill leaked onto % non-hostel structure(s)', v_leaked;
  END IF;

  -- (c) EVERY backfilled hostel row really is Classic / Classic
  SELECT count(*) INTO v_wrong
    FROM public.admission_fee_structures fs
    JOIN public.accommodation_types a ON a.id = fs.accommodation_type_id
    JOIN public.hostel_categories hc ON hc.id = fs.hostel_category_id
    JOIN public.mess_categories  mc ON mc.id = fs.mess_category_id
   WHERE a.code = 'hostel'
     AND (hc.name <> 'Classic Room' OR mc.name <> 'Classic');
  IF v_wrong > 0 THEN
    RAISE EXCEPTION 'backfill wrote non-Classic categories onto % hostel structure(s)', v_wrong;
  END IF;

  RAISE NOTICE 'fee-structure hostel categories: backfill + guard OK';
END
$assert$;
