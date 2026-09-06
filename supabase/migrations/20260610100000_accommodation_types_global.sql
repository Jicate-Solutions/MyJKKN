-- Make accommodation_types a global (institution-agnostic) lookup table.
--
-- Before: 4 identical codes (hostel / dayscholar / pg / not_applicable)
-- duplicated per institution (12 institutions = 48 rows, UNIQUE(institution_id, code)).
-- Nothing in the system joins on accommodation_types.institution_id — every DB
-- function and view resolves id -> code — so we dedupe to 4 canonical rows,
-- remap every reference, and drop the institution dimension entirely.

-- 1. Backup (drop manually after verification)
CREATE TABLE IF NOT EXISTS public._bak_accommodation_types_20260610 AS
SELECT * FROM public.accommodation_types;

-- 2. Canonical row per code = earliest created (tie-break by id)
CREATE TEMP TABLE _acc_remap ON COMMIT DROP AS
SELECT a.id AS old_id, c.canonical_id
FROM public.accommodation_types a
JOIN (
  SELECT DISTINCT ON (code) code, id AS canonical_id
  FROM public.accommodation_types
  ORDER BY code, created_at, id
) c USING (code)
WHERE a.id <> c.canonical_id;

-- 3. Remap FK references to canonical rows.
-- trg_detect_fee_dimension_change treats any accommodation_type_id change as a
-- fee-dimension change (re-resolves fees + opens fee-change events). This remap
-- is ID churn only — the semantic accommodation value is unchanged — so the
-- trigger must NOT fire for the 5k-row bulk update. Same for the blanket
-- BEFORE UPDATE application-id trigger.
ALTER TABLE public.learners_profiles DISABLE TRIGGER trg_detect_fee_dimension_change;
ALTER TABLE public.learners_profiles DISABLE TRIGGER trigger_set_learner_application_id_on_update;

UPDATE public.learners_profiles t
   SET accommodation_type_id = r.canonical_id
  FROM _acc_remap r
 WHERE t.accommodation_type_id = r.old_id;

ALTER TABLE public.learners_profiles ENABLE TRIGGER trg_detect_fee_dimension_change;
ALTER TABLE public.learners_profiles ENABLE TRIGGER trigger_set_learner_application_id_on_update;

UPDATE public.admission_leads t
   SET accommodation_type_id = r.canonical_id
  FROM _acc_remap r
 WHERE t.accommodation_type_id = r.old_id;

UPDATE public.admission_fee_structures t
   SET accommodation_type_id = r.canonical_id
  FROM _acc_remap r
 WHERE t.accommodation_type_id = r.old_id;

UPDATE public.billing_apportionment_rules t
   SET accommodation_type_id = r.canonical_id
  FROM _acc_remap r
 WHERE t.accommodation_type_id = r.old_id;

-- Audit column without an FK constraint — remap so historical events still
-- resolve to a live row.
UPDATE public.admission_fee_change_events t
   SET old_accommodation_type_id = r.canonical_id
  FROM _acc_remap r
 WHERE t.old_accommodation_type_id = r.old_id;

-- 4. Delete the now-unreferenced duplicates (48 -> 4 rows)
DELETE FROM public.accommodation_types a
 USING _acc_remap r
 WHERE a.id = r.old_id;

-- 5. Drop the old institution-gated RLS policies BEFORE the column — they
--    reference institution_id and block the DROP COLUMN otherwise.
DROP POLICY IF EXISTS accommodation_types_read ON public.accommodation_types;
DROP POLICY IF EXISTS accommodation_types_write ON public.accommodation_types;

-- 6. Drop the institution dimension. This also drops
--    UNIQUE(institution_id, code) and ix_accommodation_types_institution_active.
ALTER TABLE public.accommodation_types DROP COLUMN institution_id;
ALTER TABLE public.accommodation_types
  ADD CONSTRAINT accommodation_types_code_key UNIQUE (code);
CREATE INDEX ix_accommodation_types_active
  ON public.accommodation_types (is_active, sort_order);

-- 7. RLS: global lookup table — open SELECT to any authenticated user
--    (institution gating no longer applies); writes stay behind the
--    admission fees manage permission.
CREATE POLICY accommodation_types_read ON public.accommodation_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY accommodation_types_write ON public.accommodation_types
  FOR ALL
  USING (public.user_has_permission('admission_fees.manage'))
  WITH CHECK (public.user_has_permission('admission_fees.manage'));
