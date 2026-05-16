-- ============================================================================
-- 20260508100001 — Create learner_admission_documents table
-- ============================================================================
-- Spec §6.6. Audit trail for documents collected at the status='account'
-- transition. One row per (learner_id, doc_type) — UNIQUE constraint enforces
-- the latest receipt overwrites prior. doc_type is free-form text driven by
-- admission_settings_per_institution.required_documents_for_account_transition
-- (a JSONB array of strings).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learner_admission_documents (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    doc_type        text NOT NULL,
    is_received     boolean NOT NULL DEFAULT false,
    received_at     timestamptz,
    received_by     uuid REFERENCES public.profiles(id),
    received_via    text CHECK (received_via IN ('physical','email','upload')),
    document_ref    text,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (learner_id, doc_type)
);

CREATE INDEX IF NOT EXISTS ix_learner_admission_documents_learner
    ON public.learner_admission_documents (learner_id, is_received);

DROP TRIGGER IF EXISTS trg_learner_admission_documents_touch
    ON public.learner_admission_documents;
CREATE TRIGGER trg_learner_admission_documents_touch
    BEFORE UPDATE ON public.learner_admission_documents
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
