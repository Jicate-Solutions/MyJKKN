-- Create bos_regulation_taxonomies table for taxonomy configuration per regulation
-- Stores: K-values (Bloom's/Finks taxonomy), POs, PSOs framework definitions

CREATE TABLE IF NOT EXISTS public.bos_regulation_taxonomies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  regulation_id UUID NOT NULL,

  -- Taxonomy framework choice
  taxonomy_type VARCHAR(50) NOT NULL, -- 'finks', 'blooms', or institution-specific

  -- K-values definitions (e.g., K1-K6 with their full names)
  k_values JSONB NOT NULL,
  -- Example: {"K1": "Application", "K2": "Foundational", "K3": "Integration", "K4": "Human Dimension", "K5": "Caring", "K6": "Learning How to Learn"}

  -- Programme Outcomes (POs) - institution defined
  pos JSONB NOT NULL,
  -- Example: {"PO1": "Engineering knowledge", "PO2": "Problem analysis", "PO3": "Design/Development of Solutions", ...}

  -- Programme Specific Outcomes (PSOs) - optional, institution/stream specific
  psos JSONB,
  -- Example: {"PSO1": "Apply domain knowledge", "PSO2": "Develop sustainable solutions", ...}

  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraint: One taxonomy per institution + regulation
  UNIQUE(institutions_id, regulation_id)
);

-- Indexes
CREATE INDEX idx_bos_regulation_taxonomies_institutions ON public.bos_regulation_taxonomies(institutions_id);
CREATE INDEX idx_bos_regulation_taxonomies_regulation ON public.bos_regulation_taxonomies(regulation_id);

-- RLS: Enable row-level security
ALTER TABLE public.bos_regulation_taxonomies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view taxonomy from their own institution
CREATE POLICY "bos_taxonomies_read_own_institution"
  ON public.bos_regulation_taxonomies
  FOR SELECT
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- RLS Policy: Only regulation admin/super admin can insert/update
CREATE POLICY "bos_taxonomies_write_own_institution"
  ON public.bos_regulation_taxonomies
  FOR INSERT
  WITH CHECK (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "bos_taxonomies_update_own_institution"
  ON public.bos_regulation_taxonomies
  FOR UPDATE
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- Comments
COMMENT ON TABLE public.bos_regulation_taxonomies IS 'Master taxonomy configuration per regulation. Defines K-values, POs, and PSOs that all courses under this regulation will use.';
COMMENT ON COLUMN public.bos_regulation_taxonomies.taxonomy_type IS 'Framework: finks (6 K-values) or blooms (standard Bloom levels), or custom';
COMMENT ON COLUMN public.bos_regulation_taxonomies.k_values IS 'JSON: {K1: "full name", K2: "full name", ...}';
COMMENT ON COLUMN public.bos_regulation_taxonomies.pos IS 'JSON: {PO1: "Programme Outcome 1", PO2: "...", ...} - institution-wide definitions';
COMMENT ON COLUMN public.bos_regulation_taxonomies.psos IS 'JSON: {PSO1: "Programme Specific Outcome 1", ...} - optional stream/institution specific outcomes';
