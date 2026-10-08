-- Quotation lines keep the GST rate and HSN code the vendor printed, and the
-- quotation keeps its warranty. The PO prints these instead of asking someone to
-- type them again on the order page (it falls back to the item master as before).
ALTER TABLE public.procurement_quotation_items
  ADD COLUMN IF NOT EXISTS gst_percent numeric(5,2)
    CHECK (gst_percent IS NULL OR (gst_percent >= 0 AND gst_percent <= 28)),
  ADD COLUMN IF NOT EXISTS hsn text;

ALTER TABLE public.procurement_quotations
  ADD COLUMN IF NOT EXISTS warranty text;

COMMENT ON COLUMN public.procurement_quotation_items.gst_percent IS 'GST rate printed on the quotation line (5 = 5%).';
COMMENT ON COLUMN public.procurement_quotation_items.hsn IS 'HSN/SAC code printed on the quotation line.';
COMMENT ON COLUMN public.procurement_quotations.warranty IS 'Warranty as written on the quotation.';
