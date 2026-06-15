-- Campus Living — fix the BDS ₹4.0–4.4L Category-Eligibility band gender mismatch.
--
-- ROOT CAUSE: the BDS ₹4.0–4.4L band (ebed30cf) is hostel_type='both' but points at a
-- BOYS-typed room category. fn_hostel_effective_room_categories returns the band's
-- category verbatim (no gender translation), so every BDS GIRL in this fee tier resolves
-- to a boys category and fails the auto-allocate gender check ("Gender does not match the
-- resolved room category"). 61 girls excluded while Girls Hostel B (37 Deluxe-girls beds)
-- sat empty. This is a recurrence of the same class fixed in
-- 20260613120000_fix_bds_deluxe_band_gender_split.sql — band edits via the admin UI keep
-- collapsing the per-gender split back into a single 'both' row.
--
-- FIX (data-only; the resolver functions are intentionally NOT touched here because they
-- are mid-migration to the multi-quota `quota_ids` model in a parallel session — replacing
-- them now would race that work):
--   (1) re-point the existing 'both' row → GIRLS + girls "Deluxe Room" / girls "Premium"
--       mess  (routes the BDS girls into Girls Hostel B, per confirmed intent);
--   (2) add a 'boys' row for the same tier → boys "Classic Room" / boys "Premium" mess
--       (boys "Deluxe Room" has ZERO physical rooms; boys "Classic Room" has 67 across
--        Boys Hostel A/B/C).
-- uq_prog_elig_band includes hostel_type, so a boys+girls pair per tier is permitted.
-- Reversible via the backup table created below.
--
-- VERIFIED: Block B (Girls Hostel B) BDS 2-Year girls allocatable 0 → 46.

-- One-time safety backup (no-op if it already exists).
CREATE TABLE IF NOT EXISTS _bak_hostel_program_eligibility_20260615 AS
SELECT * FROM hostel_program_eligibility;

-- (1) Re-point the existing band to the GIRLS variants and tag it girls-only.
UPDATE hostel_program_eligibility
SET hostel_type      = 'girls',
    room_category_id = 'a679e730-5539-4f8f-a695-f9111c141058',  -- girls "Deluxe Room" (Girls Hostel B/C)
    mess_category_id = '0a4ebf28-1d52-4568-a47d-698d0e6ea4ee',  -- girls "Premium" mess
    updated_at       = now()
WHERE id = 'ebed30cf-29fa-4af1-aa09-15aa0b59f796'
  AND hostel_type = 'both';  -- guard: only flip if the parallel session hasn't already split it

-- (2) Add the boys-specific row for the same tier (clone tier fields from the now-girls row).
INSERT INTO hostel_program_eligibility
  (institution_id, program_id, quota_ids, fee_min, fee_max,
   room_category_id, mess_category_id, is_monthly_mess_allowed, is_active,
   effective_from, hostel_type)
SELECT institution_id, program_id, quota_ids, fee_min, fee_max,
       '00fad18b-82ee-445a-a409-363c382bccd1'::uuid,  -- boys "Classic Room"
       'f0ed1ca7-616d-4d77-88e3-9906723af810'::uuid,  -- boys "Premium" mess
       is_monthly_mess_allowed, is_active, effective_from,
       'boys'
FROM hostel_program_eligibility
WHERE id = 'ebed30cf-29fa-4af1-aa09-15aa0b59f796'
  AND NOT EXISTS (  -- idempotency / no clash with a parallel-session boys row
    SELECT 1 FROM hostel_program_eligibility b
    WHERE b.institution_id = hostel_program_eligibility.institution_id
      AND b.program_id IS NOT DISTINCT FROM hostel_program_eligibility.program_id
      AND b.quota_ids   IS NOT DISTINCT FROM hostel_program_eligibility.quota_ids
      AND b.fee_min     IS NOT DISTINCT FROM hostel_program_eligibility.fee_min
      AND b.fee_max     IS NOT DISTINCT FROM hostel_program_eligibility.fee_max
      AND b.hostel_type = 'boys'
  );
