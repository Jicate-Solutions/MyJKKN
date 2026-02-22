-- ============================================
-- WhatsApp Gap Fill: Multiple WABA Numbers
-- Gap 12 — P2 Valuable
-- ============================================

CREATE TABLE IF NOT EXISTS public.wa_phone_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  phone_number_id TEXT NOT NULL,         -- Meta's phone_number_id
  business_account_id TEXT NOT NULL,     -- Meta's WABA ID
  display_number TEXT NOT NULL,          -- Human-readable phone number
  verified_name TEXT,                    -- Meta-verified business name
  quality_rating TEXT DEFAULT 'GREEN',   -- GREEN | YELLOW | RED
  messaging_limit TEXT DEFAULT 'TIER_1K',-- TIER_1K | TIER_10K | TIER_100K | UNLIMITED
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Access token stored per number (different WABA may have different tokens)
  access_token_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_wa_phone_number UNIQUE(phone_number_id)
);

ALTER TABLE public.wa_phone_numbers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_phone_numbers_access" ON public.wa_phone_numbers;
CREATE POLICY "wa_phone_numbers_access" ON public.wa_phone_numbers
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_institution ON public.wa_phone_numbers(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_phone_id ON public.wa_phone_numbers(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_active ON public.wa_phone_numbers(is_active) WHERE is_active = true;
