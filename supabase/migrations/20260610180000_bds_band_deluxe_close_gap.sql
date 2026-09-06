-- 20260610180000_bds_band_deluxe_close_gap.sql
-- Data fix (Category Eligibility config) for JKKN Dental / BDS.
-- Conflict found 2026-06-10: BDS 2-Year girls (fee ₹4,00,000) resolved Classic Room,
-- but their reserved physical rooms in Girls Hostel C (22–34) are all Deluxe Room, and
-- Block C has NO Classic rooms — so strict (category AND physical) never matched.
-- Decision: make the ₹4,00,000 band grant Deluxe Room (match the reserved rooms) AND
-- extend its upper bound 4,25,000 → 4,50,000 so ₹4,25,000 students (previously a band
-- gap → no category) resolve too. Mess category unchanged (Premium).
-- Old values (for rollback): room_category = Classic Room, fee_max = 425000.
UPDATE public.hostel_program_eligibility e
SET room_category_id = (SELECT id FROM public.hostel_categories WHERE name = 'Deluxe Room' LIMIT 1),
    fee_max = 450000,
    updated_at = now()
WHERE e.institution_id = (SELECT id FROM public.institutions WHERE name = 'JKKN Dental College and Hospital')
  AND e.program_id     = (SELECT id FROM public.programs WHERE program_name = 'BDS' LIMIT 1)
  AND e.quota_id IS NULL
  AND e.fee_min = 400000
  AND e.fee_max = 425000;
