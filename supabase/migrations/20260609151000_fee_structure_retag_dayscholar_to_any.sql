-- ─── Re-tag active day-scholar fee structures to "Any" (NULL accommodation) ──
-- The 90 active structures tagged 'dayscholar' are the surviving academic-fee
-- twins (their hostel twins were archived on 2026-05-28). With accommodation
-- now an optional matching dimension (20260609150000), they should match EVERY
-- learner, so we null their accommodation_type_id ("Any"). Operators then
-- create accommodation-specific structures only where academic fees differ.
--
-- A backup table preserves the old values for full reversibility. The overlap
-- trigger fires on the junction table (INSERT/UPDATE of communities), not on
-- parent-row updates, so this UPDATE cannot trip it.

CREATE TABLE IF NOT EXISTS public._bak_fee_structure_accommodation_retag_20260609 AS
SELECT fs.id,
       fs.accommodation_type_id AS old_accommodation_type_id,
       now() AS backed_up_at
  FROM public.admission_fee_structures fs
  JOIN public.accommodation_types act ON act.id = fs.accommodation_type_id
 WHERE fs.status = 'active'
   AND act.code = 'dayscholar';

UPDATE public.admission_fee_structures
   SET accommodation_type_id = NULL,
       updated_at = now()
 WHERE id IN (SELECT id FROM public._bak_fee_structure_accommodation_retag_20260609);
