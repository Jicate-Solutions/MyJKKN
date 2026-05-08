-- ============================================================================
-- 20260508120001 — Create learner_self_fill_tokens
-- ============================================================================
-- Per-learner HMAC-signed tokens that grant a single student a 30-minute
-- window to fill their Basic / Academic / Contact sections via the public
-- /student-form/[token] route. See design doc:
-- docs/superpowers/specs/2026-05-08-student-self-fill-enquiry-design.md
--
-- The token's raw value is signed (HMAC-SHA256) and shipped to the student's
-- phone via QR. The DB stores only a SHA-256 hash of the raw value (peppered
-- with a server-side secret). Lookup is by hash; the HMAC validates the
-- payload's authenticity.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learner_self_fill_tokens (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    learner_profile_id uuid NOT NULL
                       REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
    token_hash         text NOT NULL UNIQUE,
    status             text NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'consumed', 'expired', 'superseded')),
    expires_at         timestamptz NOT NULL,
    generated_by       uuid REFERENCES public.profiles(id),
    generated_at       timestamptz NOT NULL DEFAULT now(),
    consumed_at        timestamptz,
    superseded_by      uuid REFERENCES public.learner_self_fill_tokens(id),
    section_progress   jsonb NOT NULL DEFAULT '{
        "basic_done": false,
        "academic_done": false,
        "contact_done": false
    }'::jsonb
);

CREATE INDEX IF NOT EXISTS ix_lsft_active
    ON public.learner_self_fill_tokens (learner_profile_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_lsft_expiry
    ON public.learner_self_fill_tokens (expires_at)
    WHERE status = 'active';

-- One active token per learner; second concurrent insert fails 23505.
-- Application code catches that and supersedes the prior token.
CREATE UNIQUE INDEX IF NOT EXISTS ux_lsft_one_active_per_learner
    ON public.learner_self_fill_tokens (learner_profile_id)
    WHERE status = 'active';

-- All writes go through service-role (admission API + student-form API).
-- RLS is deny-all for the anon role; only service-role bypasses it.
ALTER TABLE public.learner_self_fill_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learner_self_fill_tokens_read ON public.learner_self_fill_tokens;
CREATE POLICY learner_self_fill_tokens_read
    ON public.learner_self_fill_tokens FOR SELECT
    USING (
      public.is_super_admin()
      OR public.user_has_permission('admission.leads.student_form.generate')
    );

-- No INSERT/UPDATE/DELETE policies — service-role bypasses RLS entirely.
