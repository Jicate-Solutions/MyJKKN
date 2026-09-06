-- Drop the vestigial academic_years FKs from the HR leave tables.
--
-- DO NOT APPLY UNTIL THE BACKFILL HAS BEEN VERIFIED IN THE UI.
--
-- This is migration C. 20260810120000 moved the primary key and every read onto
-- hr_academic_year_id; 20260810121000 moved the functions and triggers. The old
-- academic_year_id columns have been nullable and unread since then -- they are
-- kept only so the mapping can be eyeballed before it goes.
--
-- Verify first (expected values from the 2026-08-10 cutover):
--
--   SELECT count(*) FROM hr_leave_balances;                    -- 5496
--   SELECT count(*) FROM hr_leave_balances
--    WHERE hr_academic_year_id IS NULL;                        -- 0
--   SELECT count(*) FROM hr_leave_applications;                -- 284
--   SELECT h.year_name, count(*), sum(b.entitled)
--     FROM hr_leave_balances b
--     JOIN hr_academic_years h ON h.id = b.hr_academic_year_id
--    GROUP BY 1;   -- 2024-2025: 2334 / 16662.51
--                  -- 2025-2026:   24 /   149.84
--                  -- 2026-2027: 3138 / 32426.00
--
-- and in the browser: /hr/admin/leave-balances analytics totals unchanged, the
-- generator dry-run reports 0 to create, one apply-leave submission succeeds.
--
-- The bak_hr_leave_ay_20260810_* tables keep the original mapping regardless and
-- are NOT dropped here.

-- Guard: refuse to drop the old columns while any row lacks the new one.
DO $$
DECLARE
  v_bad bigint;
BEGIN
  SELECT (SELECT count(*) FROM public.hr_leave_balances    WHERE hr_academic_year_id IS NULL)
       + (SELECT count(*) FROM public.hr_leave_applications WHERE hr_academic_year_id IS NULL)
       + (SELECT count(*) FROM public.hr_leave_encashments  WHERE hr_academic_year_id IS NULL)
    INTO v_bad;

  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop academic_year_id: % row(s) still have no hr_academic_year_id.', v_bad;
  END IF;
END $$;

ALTER TABLE public.hr_leave_balances    DROP COLUMN IF EXISTS academic_year_id;
ALTER TABLE public.hr_leave_applications DROP COLUMN IF EXISTS academic_year_id;
ALTER TABLE public.hr_leave_encashments  DROP COLUMN IF EXISTS academic_year_id;
