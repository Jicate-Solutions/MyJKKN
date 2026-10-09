-- What the vendor actually quoted, kept with each price, and a memory of which vendor
-- names mean which requested item — so a name a person confirmed once is never asked again.
-- Applied live 2026-10-09 under this version.

ALTER TABLE public.procurement_quotation_items
  ADD COLUMN IF NOT EXISTS quoted_name text,
  ADD COLUMN IF NOT EXISTS quoted_qty numeric,
  ADD COLUMN IF NOT EXISTS quoted_pack text,
  ADD COLUMN IF NOT EXISTS match_source text;

DO $$ BEGIN
  ALTER TABLE public.procurement_quotation_items
    ADD CONSTRAINT procurement_quotation_items_match_source_chk
    CHECK (match_source IS NULL OR match_source IN ('ai', 'memory', 'person', 'typed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.procurement_quotation_items.quoted_name IS 'The line name as the vendor printed it (their own name for the requested item).';
COMMENT ON COLUMN public.procurement_quotation_items.quoted_qty IS 'Quantity printed on the vendor''s line; NULL = not printed.';
COMMENT ON COLUMN public.procurement_quotation_items.quoted_pack IS 'Pack/size the vendor''s price is for, as printed ("100 ml").';
COMMENT ON COLUMN public.procurement_quotation_items.match_source IS 'How the line was tied to the requested item: ai (sure + names agree), memory (confirmed before), person (checked now), typed (price typed in).';

CREATE TABLE IF NOT EXISTS public.procurement_item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.ims_suppliers(id) ON DELETE CASCADE,
  quoted_name text NOT NULL,
  quoted_key text NOT NULL,
  item_key text NOT NULL,
  item_name text NOT NULL,
  same boolean NOT NULL,
  confirmed_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, supplier_id, quoted_key, item_key)
);

COMMENT ON TABLE public.procurement_item_aliases IS
  'Quotation reader memory: a person said the vendor''s name (quoted_key) is / is not the requested item (item_key = item:<ims item id> or name:<normalised name>).';

CREATE INDEX IF NOT EXISTS procurement_item_aliases_lookup
  ON public.procurement_item_aliases (institution_id, item_key);

ALTER TABLE public.procurement_item_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pia_institution_scope ON public.procurement_item_aliases;
CREATE POLICY pia_institution_scope ON public.procurement_item_aliases
  FOR ALL TO authenticated
  USING (public.role_has_institution_access(institution_id))
  WITH CHECK (public.role_has_institution_access(institution_id));

GRANT SELECT, INSERT, UPDATE ON public.procurement_item_aliases TO authenticated;
REVOKE ALL ON public.procurement_item_aliases FROM anon;
