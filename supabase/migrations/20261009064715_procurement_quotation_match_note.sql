-- Why a vendor line was taken as the requested item, kept with the price for audit:
-- "AI: NaOH is sodium hydroxide", "known name", "Box of 100 @ ₹450 → ₹4.50 each",
-- "Asked AR grade, quoted LR — accepted by reviewer".
-- Applied live 2026-10-09 under this version.
ALTER TABLE public.procurement_quotation_items ADD COLUMN IF NOT EXISTS match_note text;
COMMENT ON COLUMN public.procurement_quotation_items.match_note IS
  'Audit: why this vendor line was taken for the requested item, and any pack / spec difference a person accepted.';
