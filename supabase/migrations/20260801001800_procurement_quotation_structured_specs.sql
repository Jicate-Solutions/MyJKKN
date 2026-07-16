-- Migration: 20260801001800_procurement_quotation_structured_specs
-- Purpose:  Replace the single freeform offered_spec text field (added in
--           20260801001600) with distinct, comparable spec fields so vendor
--           quotations can be compared on more than price:
--             - manufacturer   (brand / company name offered)
--             - quality_grade  (quality / grade offered)
--             - concentration  (chemical items only — purity/strength offered)
--             - other_specs    (freeform overflow for anything not covered above)
--           offered_spec is dropped outright rather than kept alongside: it
--           shipped in the same not-yet-deployed session, so there is no
--           production data to preserve.

ALTER TABLE public.procurement_quotation_items DROP COLUMN IF EXISTS offered_spec;

ALTER TABLE public.procurement_quotation_items
    ADD COLUMN IF NOT EXISTS manufacturer TEXT,
    ADD COLUMN IF NOT EXISTS quality_grade TEXT,
    ADD COLUMN IF NOT EXISTS concentration TEXT,
    ADD COLUMN IF NOT EXISTS other_specs TEXT;

COMMENT ON COLUMN public.procurement_quotation_items.manufacturer  IS 'Manufacturer/brand this vendor is offering for the line, distinct from the RFQ item_spec (what was requested).';
COMMENT ON COLUMN public.procurement_quotation_items.quality_grade IS 'Quality/grade this vendor is offering for the line.';
COMMENT ON COLUMN public.procurement_quotation_items.concentration IS 'Concentration/purity offered — relevant for chemical items (see ims_items.is_chemical).';
COMMENT ON COLUMN public.procurement_quotation_items.other_specs   IS 'Freeform overflow for any other product-specific detail not covered by the structured fields.';
