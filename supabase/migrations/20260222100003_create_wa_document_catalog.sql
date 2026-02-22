-- ============================================
-- WhatsApp Gap Fill: Document Catalog
-- Gap 9 — P2 Valuable
-- ============================================

CREATE TABLE IF NOT EXISTS public.wa_document_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  -- brochure | fee_structure | virtual_tour | campus_map | scholarship | hostel | placement | other
  document_type TEXT NOT NULL,
  -- pdf | image | video | link
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size_bytes INT,
  share_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.wa_document_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_doc_catalog_access" ON public.wa_document_catalog;
CREATE POLICY "wa_doc_catalog_access" ON public.wa_document_catalog
  FOR ALL USING (
    institution_id IN (
      SELECT institution_id FROM public.user_institution_access WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_wa_doc_catalog_institution ON public.wa_document_catalog(institution_id);
CREATE INDEX IF NOT EXISTS idx_wa_doc_catalog_category ON public.wa_document_catalog(category);
CREATE INDEX IF NOT EXISTS idx_wa_doc_catalog_active ON public.wa_document_catalog(is_active) WHERE is_active = true;
