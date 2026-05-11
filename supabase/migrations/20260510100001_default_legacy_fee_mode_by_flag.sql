-- ============================================================================
-- 20260510100001 — Default legacy_fee_mode based on institution flag
-- ============================================================================
-- BEFORE INSERT trigger sets legacy_fee_mode based on
-- admission_settings_per_institution.use_fee_structures for the row's
-- institution_id. Flag ON → false (matrix-driven). Flag OFF → keeps DDL
-- default of true (legacy manual).
--
-- Plan: 2026-05-05-admission-fees-plan-06-cutover-adoption.md Task 1
-- Spec §12.1
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_legacy_fee_mode_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_use_fee_structures boolean;
BEGIN
    IF NEW.institution_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT use_fee_structures INTO v_use_fee_structures
      FROM public.admission_settings_per_institution
     WHERE institution_id = NEW.institution_id;

    IF v_use_fee_structures = true THEN
        NEW.legacy_fee_mode := false;
    END IF;
    -- Flag false or missing → keep whatever was passed (defaults to true via DDL)

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_legacy_fee_mode_default() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_set_legacy_fee_mode_default ON public.learners_profiles;
CREATE TRIGGER trg_set_legacy_fee_mode_default
    BEFORE INSERT ON public.learners_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_legacy_fee_mode_default();
