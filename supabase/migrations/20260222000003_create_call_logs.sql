-- ============================================
-- Unified Communication Suite: Call Logs
-- Phase 2.1 — Telephony Integration (Exotel)
-- ============================================

-- 1. New table: admission_call_logs
CREATE TABLE IF NOT EXISTS public.admission_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.admission_leads(id) ON DELETE SET NULL,
    counselor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    call_sid TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'outbound',  -- outbound | inbound
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'initiated',
    -- initiated | ringing | in-progress | completed | busy | no-answer | failed | cancelled

    duration_seconds INT,
    recording_url TEXT,
    recording_duration_seconds INT,

    -- Post-call data (counselor fills in)
    call_notes TEXT,
    call_disposition TEXT,
    -- interested | not_interested | callback | wrong_number | not_reachable | switched_off | busy | other
    follow_up_date DATE,

    cost_amount DECIMAL(10,2),
    cost_currency TEXT DEFAULT 'INR',

    started_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE public.admission_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_logs_institution_access" ON public.admission_call_logs;
CREATE POLICY "call_logs_institution_access" ON public.admission_call_logs
    FOR ALL USING (
        institution_id IN (
            SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
        )
    );

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_call_logs_institution ON public.admission_call_logs(institution_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead ON public.admission_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_counselor ON public.admission_call_logs(counselor_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_status ON public.admission_call_logs(status);
CREATE INDEX IF NOT EXISTS idx_call_logs_created ON public.admission_call_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_call_sid ON public.admission_call_logs(call_sid);
