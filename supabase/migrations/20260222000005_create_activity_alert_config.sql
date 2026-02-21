-- ============================================
-- Unified Communication Suite: Activity Alerts
-- Phase 4.1 — Real-time Sales Alerts (Zing Equivalent)
-- ============================================

-- 1. New table: activity_alert_rules
CREATE TABLE IF NOT EXISTS public.activity_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    -- wa_reply | payment_initiated | application_submitted | lead_reengaged |
    -- document_uploaded | chatbot_handoff | score_changed
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    notify_assigned_counselor BOOLEAN NOT NULL DEFAULT true,
    notify_additional_users UUID[] DEFAULT '{}',
    notification_channels TEXT[] DEFAULT '{PUSH,IN_APP}',
    -- Conditions (optional)
    conditions JSONB DEFAULT '{}'::jsonb,
    -- e.g., { "min_score_change": 20 } for score_changed events
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE public.activity_alert_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_rules_access" ON public.activity_alert_rules;
CREATE POLICY "alert_rules_access" ON public.activity_alert_rules
    FOR ALL USING (institution_id IN (
        SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    ));

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_alert_rules_institution ON public.activity_alert_rules(institution_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_event_type ON public.activity_alert_rules(event_type);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON public.activity_alert_rules(is_enabled) WHERE is_enabled = true;
