-- ── Campus Living: fix Category-Eligibility gender model + the BDS ₹4.0–4.4L band ──
--
-- ROOT CAUSE: hostel_program_eligibility bands carry ONE gender-typed room/mess
-- category each, but the unique index uq_prog_elig_band keyed only on
-- (institution, program, quota, fee_min, fee_max) — so each fee tier could hold
-- just ONE band, gender-agnostic. With gender-typed categories + a resolver
-- (fn_hostel_effective_room_categories) that filters on hostel_type but never
-- translates gender, a single 'both' band can only ever serve ONE gender.
-- The BDS ₹4.0–4.4L band (ebed30cf) was tagged 'both' but pointed at the BOYS
-- "Deluxe Room"/"Premium" mess, so all 46 BDS-2-Year GIRLS in that fee tier
-- failed the auto-allocate gender check while 147 girls-Deluxe beds in
-- Girls Hostel B sat empty.
--
-- FIX:
--   (1) widen uq_prog_elig_band to include hostel_type, so a tier can hold a
--       boys row AND a girls row (the resolver already filters by hostel_type);
--   (2) split the offending 'both' band: clone it as a 'boys' band (keeps boys
--       Deluxe/Premium → preserves the 14 BDS boys) and re-point the original
--       row to 'girls' + girls Deluxe/Premium (fixes the 46 girls).

-- One-time safety backup of the whole config table (no-op if it already exists).
CREATE TABLE IF NOT EXISTS _bak_hostel_program_eligibility_20260613 AS
SELECT * FROM hostel_program_eligibility;

-- (1) Allow one band per gender within a fee tier.
DROP INDEX IF EXISTS uq_prog_elig_band;
CREATE UNIQUE INDEX uq_prog_elig_band ON public.hostel_program_eligibility
USING btree (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(fee_min, ('-1'::integer)::numeric),
  COALESCE(fee_max, ('-1'::integer)::numeric),
  hostel_type
);

-- (2a) Add the boys-specific band, cloned from the existing 'both' row so it
--      keeps the same institution/program/quota/fee/effective_from automatically.
INSERT INTO hostel_program_eligibility
  (institution_id, program_id, quota_id, fee_min, fee_max,
   room_category_id, mess_category_id, is_monthly_mess_allowed, is_active,
   effective_from, hostel_type)
SELECT institution_id, program_id, quota_id, fee_min, fee_max,
       '4d362993-fa38-4fcd-997f-a0147a269247'::uuid,  -- boys "Deluxe Room" (unchanged)
       'f0ed1ca7-616d-4d77-88e3-9906723af810'::uuid,  -- boys "Premium" mess  (unchanged)
       is_monthly_mess_allowed, is_active, effective_from,
       'boys'
FROM hostel_program_eligibility
WHERE id = 'ebed30cf-29fa-4af1-aa09-15aa0b59f796';

-- (2b) Re-point the existing row to the GIRLS variants and tag it girls-only.
UPDATE hostel_program_eligibility
SET hostel_type      = 'girls',
    room_category_id = 'a679e730-5539-4f8f-a695-f9111c141058',  -- girls "Deluxe Room"
    mess_category_id = '0a4ebf28-1d52-4568-a47d-698d0e6ea4ee',  -- girls "Premium" mess
    updated_at       = now()
WHERE id = 'ebed30cf-29fa-4af1-aa09-15aa0b59f796';
