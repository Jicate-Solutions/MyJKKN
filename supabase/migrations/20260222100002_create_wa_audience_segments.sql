-- ============================================
-- WhatsApp Gap Fill: Audience Segments
-- Gap 6 — P1 Important
-- ============================================

CREATE TABLE IF NOT EXISTS public.wa_audience_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,

  -- Filter criteria as structured JSON array
  criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [
  --   { "field": "interested_programs", "operator": "contains", "value": "B.Pharm" },
  --   { "field": "score", "operator": "greater_than", "value": 50 },
  --   { "field": "last_contacted_at", "operator": "older_than_days", "value": 7 },
  --   { "field": "wa_opt_in", "operator": "equals", "value": true }
  -- ]

  logic TEXT NOT NULL DEFAULT 'AND',  -- AND | OR

  -- Cache
  cached_count INT,
  cached_at TIMESTAMPTZ,

  -- Usage
  last_used_at TIMESTAMPTZ,
  use_count INT NOT NULL DEFAULT 0,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_audience_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_segments_access" ON public.wa_audience_segments;
CREATE POLICY "wa_segments_access" ON public.wa_audience_segments
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_segments_institution ON public.wa_audience_segments(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_segments_active ON public.wa_audience_segments(is_active) WHERE is_active = true;
