-- ============================================================================
-- 20260509100001 — Create admission_fee_change_events + _event_lines
-- ============================================================================
-- Spec §6.4. Pending-review events fire when a learner's matrix dimensions
-- change after bills exist. Lifecycle is frozen until admin approves/rejects.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admission_fee_change_events (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_id                  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    trigger_field               text NOT NULL CHECK (trigger_field IN
                                ('program_id','quota_id','community_category_id',
                                 'accommodation_type_id','admission_year_id','manual')),
    -- Snapshot at moment of change
    old_program_id              uuid,
    old_quota_id                uuid,
    old_community_category_id   uuid,
    old_accommodation_type_id   uuid,
    old_admission_year_id       uuid,
    old_fee_structure_id        uuid REFERENCES public.admission_fee_structures(id),
    new_fee_structure_id        uuid REFERENCES public.admission_fee_structures(id),
    status                      text NOT NULL DEFAULT 'pending_review'
                                CHECK (status IN ('pending_review','approved','rejected')),
    reason_notes                text,
    requested_by                uuid REFERENCES public.profiles(id),
    decided_by                  uuid REFERENCES public.profiles(id),
    requested_at                timestamptz NOT NULL DEFAULT now(),
    decided_at                  timestamptz,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_fee_change_events_pending
    ON public.admission_fee_change_events (status, learner_id)
    WHERE status = 'pending_review';

CREATE INDEX IF NOT EXISTS ix_fee_change_events_learner
    ON public.admission_fee_change_events (learner_id, requested_at DESC);

DROP TRIGGER IF EXISTS trg_fee_change_events_touch ON public.admission_fee_change_events;
CREATE TRIGGER trg_fee_change_events_touch
    BEFORE UPDATE ON public.admission_fee_change_events
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE IF NOT EXISTS public.admission_fee_change_event_lines (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                uuid NOT NULL REFERENCES public.admission_fee_change_events(id) ON DELETE CASCADE,
    billing_category_id     uuid NOT NULL REFERENCES public.billing_categories(id),
    old_amount              numeric(15,2),
    new_amount              numeric(15,2),
    paid_amount_so_far      numeric(15,2) NOT NULL DEFAULT 0,
    decision                text CHECK (decision IN
                            ('apply_supplemental','issue_credit_note','refund_payment',
                             'reallocate_payment','waive_delta','do_nothing')),
    generated_artifact_id   uuid,
    decision_notes          text,
    UNIQUE (event_id, billing_category_id)
);

CREATE INDEX IF NOT EXISTS ix_fee_change_event_lines_event
    ON public.admission_fee_change_event_lines (event_id);
