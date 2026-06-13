-- Migration: 20260512_create_bos_po_pso_mapping.sql
-- Stores PO ↔ PSO correlation mappings per regulation + programme.

CREATE TABLE IF NOT EXISTS public.bos_po_pso_mapping (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation_id   UUID        NOT NULL,
  programme_code  VARCHAR     NOT NULL,
  institutions_id UUID        NOT NULL,
  po_code         VARCHAR     NOT NULL,
  pso_code        VARCHAR     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  UNIQUE (regulation_id, programme_code, po_code, pso_code)
);

CREATE INDEX IF NOT EXISTS idx_bos_po_pso_mapping_reg_prog
  ON public.bos_po_pso_mapping (regulation_id, programme_code);

ALTER TABLE public.bos_po_pso_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_po_pso_mapping_select" ON public.bos_po_pso_mapping
  FOR SELECT USING (true);

CREATE POLICY "bos_po_pso_mapping_write" ON public.bos_po_pso_mapping
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (is_super_admin = true OR role = 'super_admin')
    )
  );
