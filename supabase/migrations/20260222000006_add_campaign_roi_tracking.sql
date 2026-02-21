-- ============================================
-- Unified Communication Suite: Campaign ROI
-- Phase 4.2 — Campaign ROI Attribution
-- ============================================

-- 1. Add attribution fields to admission_applications
ALTER TABLE public.admission_applications
    ADD COLUMN IF NOT EXISTS attributed_campaign_id UUID,
    ADD COLUMN IF NOT EXISTS attribution_channel TEXT,  -- email | sms | whatsapp | call
    ADD COLUMN IF NOT EXISTS attribution_timestamp TIMESTAMPTZ;

-- 2. Indexes for attribution lookups
CREATE INDEX IF NOT EXISTS idx_applications_attributed_campaign ON public.admission_applications(attributed_campaign_id)
    WHERE attributed_campaign_id IS NOT NULL;

-- 3. Campaign summary materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_campaign_roi AS
SELECT
    cq.id AS campaign_id,
    cq.institution_id,
    cq.step_type AS channel,
    COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'sent') AS emails_sent,
    COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'opened') AS emails_opened,
    COUNT(DISTINCT el.id) FILTER (WHERE el.status = 'clicked') AS emails_clicked,
    COUNT(DISTINCT wl.id) FILTER (WHERE wl.status = 'delivered') AS wa_delivered,
    COUNT(DISTINCT wl.id) FILTER (WHERE wl.status = 'read') AS wa_read,
    COUNT(DISTINCT sl.id) FILTER (WHERE sl.status = 'delivered') AS sms_delivered,
    COUNT(DISTINCT aa.id) AS applications,
    COUNT(DISTINCT al.id) FILTER (WHERE al.stage = 'enrolled') AS enrollments,
    cq.created_at AS campaign_date
FROM public.admission_campaign_queue cq
LEFT JOIN public.admission_email_logs el ON el.campaign_id = cq.id
LEFT JOIN public.admission_whatsapp_campaign_logs wl ON wl.campaign_id::uuid = cq.id
LEFT JOIN public.admission_sms_logs sl ON sl.campaign_id::uuid = cq.id
LEFT JOIN public.admission_applications aa ON aa.attributed_campaign_id = cq.id
LEFT JOIN public.admission_leads al ON al.id = aa.lead_id
GROUP BY cq.id, cq.institution_id, cq.step_type, cq.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_campaign_roi_id ON public.mv_campaign_roi(campaign_id);
