-- 20260601_remove_transport_hostel_fee_structure_items.sql
--
-- Remove transport + hostel fee items from admission fee structures.
--
-- Transport fees are now owned by the transport module; hostel fees by
-- campus-living (hostel_category_fees). The admission fee-structure editor no
-- longer offers these billing-category kinds (UI picker filter in
-- fees-structure-form.tsx / clone page), so existing line items are cleared to
-- match. This affects FUTURE fee resolutions only — already-resolved learners
-- keep their frozen learners_profiles.fee_items snapshot until re-resolved.
--
-- The billing_categories rows for 'Transport Fee' and 'Hostel Fee' are
-- intentionally KEPT (the transport / campus-living modules may reference them).

DELETE FROM public.admission_fee_structure_items i
USING public.billing_categories bc
WHERE bc.id = i.billing_category_id
  AND bc.kind IN ('transport', 'hostel');
