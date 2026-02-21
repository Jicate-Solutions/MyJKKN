-- ============================================
-- Unified Communication Suite: Cost Tracking
-- Phase 4.9 — Communication Cost Tracking
-- ============================================

-- 1. Cost log table
CREATE TABLE IF NOT EXISTS public.communication_cost_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,          -- email | sms | whatsapp | call | voice_broadcast
    event_type TEXT NOT NULL,       -- send | receive | call_minute | template_message
    unit_cost DECIMAL(10,4) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    total_cost DECIMAL(10,4) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    reference_id UUID,              -- Link to specific log (email_log, sms_log, call_log, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE public.communication_cost_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comm_cost_log_access" ON public.communication_cost_log;
CREATE POLICY "comm_cost_log_access" ON public.communication_cost_log
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_comm_cost_institution ON public.communication_cost_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_comm_cost_channel ON public.communication_cost_log(channel);
CREATE INDEX IF NOT EXISTS idx_comm_cost_created ON public.communication_cost_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comm_cost_reference ON public.communication_cost_log(reference_id)
    WHERE reference_id IS NOT NULL;

-- 4. Monthly summary materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_communication_costs_monthly AS
SELECT
    institution_id,
    channel,
    DATE_TRUNC('month', created_at) AS month,
    SUM(total_cost) AS total_cost,
    SUM(quantity) AS total_units
FROM public.communication_cost_log
GROUP BY institution_id, channel, DATE_TRUNC('month', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_comm_costs_monthly
    ON public.mv_communication_costs_monthly(institution_id, channel, month);
