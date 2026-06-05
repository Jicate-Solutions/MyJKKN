-- 20260605103000_remove_hostel_items_from_admission.sql
-- Hostel fees are owned by Campus Living. Remove any hostel-kind items from admission
-- fee structures. Dry-run on production 2026-06-05 found ZERO such items (admission
-- already contains only application_fee / university_fee / tuition / other) -- this runs as
-- an idempotent guard that also cleans any non-prod environment that still has hostel items.
-- Does NOT delete the billing_categories rows (Campus Living still uses them).
DELETE FROM public.admission_fee_structure_items i
USING public.billing_categories c
WHERE i.billing_category_id = c.id
  AND c.kind = 'hostel';
