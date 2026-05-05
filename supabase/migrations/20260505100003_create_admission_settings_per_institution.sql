-- ============================================================================
-- 20260505100003 — Create admission_settings_per_institution table
-- ============================================================================
-- Hosts the v1 feature flag (use_fee_structures), the required-documents
-- list for the status='account' transition, and dialog-enabled toggles.
-- One row per institution. Defaults to OFF for all institutions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_settings_per_institution (
    id                                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id                              uuid NOT NULL UNIQUE REFERENCES public.institutions(id) ON DELETE CASCADE,
    use_fee_structures                          boolean NOT NULL DEFAULT false,
    required_documents_for_account_transition   jsonb   NOT NULL DEFAULT '["pan","aadhaar","parent_id","agreement_form"]'::jsonb,
    pre_submit_dialog_enabled                   boolean NOT NULL DEFAULT true,
    status_change_dialog_enabled                boolean NOT NULL DEFAULT true,
    created_at                                  timestamptz NOT NULL DEFAULT now(),
    updated_at                                  timestamptz NOT NULL DEFAULT now(),
    created_by                                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by                                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

DROP TRIGGER IF EXISTS trg_admission_settings_touch ON public.admission_settings_per_institution;
CREATE TRIGGER trg_admission_settings_touch
    BEFORE UPDATE ON public.admission_settings_per_institution
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- One row per institution, auto-created with defaults
INSERT INTO public.admission_settings_per_institution (institution_id)
SELECT id FROM public.institutions
ON CONFLICT (institution_id) DO NOTHING;
