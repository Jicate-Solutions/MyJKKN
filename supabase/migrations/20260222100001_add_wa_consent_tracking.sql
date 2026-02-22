-- ============================================
-- WhatsApp Gap Fill: Opt-in Consent Tracking
-- Gap 2 — P0 Critical (compliance)
-- ============================================

-- 1. Add consent fields to admission_leads
ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS wa_opt_in BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wa_opt_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_opt_in_source TEXT,
  ADD COLUMN IF NOT EXISTS wa_opt_out_at TIMESTAMPTZ;

-- source values: website_form | whatsapp_inbound | manual | import | chatbot | keyword_stop

CREATE INDEX IF NOT EXISTS idx_leads_wa_opt_in
  ON public.admission_leads(wa_opt_in)
  WHERE wa_opt_in = true;

-- 2. Consent audit log
CREATE TABLE IF NOT EXISTS public.wa_consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.admission_leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,       -- opt_in | opt_out
  source TEXT NOT NULL,       -- website_form | whatsapp_inbound | manual | import | chatbot | keyword_stop
  ip_address TEXT,
  user_agent TEXT,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_consent_log_access" ON public.wa_consent_log;
CREATE POLICY "wa_consent_log_access" ON public.wa_consent_log
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_consent_log_lead ON public.wa_consent_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_consent_log_institution ON public.wa_consent_log(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_consent_log_created ON public.wa_consent_log(created_at DESC);
