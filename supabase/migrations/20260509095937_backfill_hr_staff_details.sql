-- Backfill hr_staff_details for active staff missing the record
-- Spec: specs/hr-module-decomposition-2026-05-09.md, Tier 1, T1.3
-- Audit: 2026-05-09, 151 active staff identified (spec said 58; live count is 151)
-- Closes Core HR coverage gap (393 → 544 hr_staff_details rows)
--
-- Migration tier: TIER-1 (data-touching, additive, idempotent)
-- - Pure INSERT, no UPDATE/DELETE
-- - NOT IN guard + ON CONFLICT DO NOTHING make this idempotent
-- - hr_organization_id derived from staff.institution_id via hr_organizations.institution_id
--   (verified: all 151 missing-staff institutions have a matching hr_organization)

INSERT INTO hr_staff_details (staff_id, hr_organization_id)
SELECT
  s.id AS staff_id,
  ho.id AS hr_organization_id
FROM staff s
JOIN hr_organizations ho ON ho.institution_id = s.institution_id
WHERE s.is_active = true
  AND s.id NOT IN (
    SELECT staff_id FROM hr_staff_details WHERE staff_id IS NOT NULL
  )
ON CONFLICT (staff_id) DO NOTHING;

-- Verification: confirm zero gap remains
DO $$
DECLARE
  active_without_hr INTEGER;
BEGIN
  SELECT COUNT(*) INTO active_without_hr
  FROM staff
  WHERE is_active = true
    AND id NOT IN (SELECT staff_id FROM hr_staff_details WHERE staff_id IS NOT NULL);

  IF active_without_hr > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % active staff still missing hr_staff_details', active_without_hr;
  END IF;
END $$;
