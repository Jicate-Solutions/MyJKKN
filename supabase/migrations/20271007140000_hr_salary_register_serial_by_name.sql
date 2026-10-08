-- ════════════════════════════════════════════════════════════════════════════
-- Salary Register — S.No in staff-name order, titles ignored (2026-10-07)
--
-- serial_no used to follow employee code. generate() now assigns it in name
-- order (lib/hr/payroll/staff-name-order.ts); this renumbers the registers that
-- already existed so every register reads the same way.
--
-- ONLY serial_no CHANGES. No figure, day count or identity column is touched,
-- and serial_no carries no constraint (uniqueness is on run_id, staff_id), so
-- the bulk renumber cannot collide.
--
-- THE KEY MIRRORS staffNameSortKey() EXACTLY: upper-case, whitespace (incl.
-- U+00A0, which [[:space:]] does not match) collapsed, leading DR / MR / MRS /
-- MS / MISS / PROF / SMT titles stripped when a '.' or space follows, '.' made a
-- space. Ties: full upper-cased name, employee code (nulls last), staff id.
-- COLLATE "C" = code-point order, the same comparison the TypeScript side makes.
-- ════════════════════════════════════════════════════════════════════════════

-- A renumber is not an edit of the register; keep updated_at as generated.
ALTER TABLE public.hr_salary_register_lines DISABLE TRIGGER trg_hr_salary_register_lines_touch;

WITH norm AS (
  SELECT id, run_id, staff_id, employee_code, staff_name,
         btrim(regexp_replace(upper(coalesce(staff_name, '')), '[[:space:] ]+', ' ', 'g')) AS u
    FROM public.hr_salary_register_lines
), keyed AS (
  SELECT *,
         btrim(regexp_replace(
           replace(
             coalesce(nullif(regexp_replace(u, '^((DR|MR|MRS|MS|MISS|PROF|SMT)(\.|[[:space:]])[[:space:]]*)+', ''), ''), u),
             '.', ' '),
           ' +', ' ', 'g')) AS k
    FROM norm
), ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY run_id
           ORDER BY k COLLATE "C",
                    upper(coalesce(staff_name, '')) COLLATE "C",
                    employee_code COLLATE "C" NULLS LAST,
                    staff_id
         ) AS rn
    FROM keyed
)
UPDATE public.hr_salary_register_lines l
   SET serial_no = r.rn
  FROM ranked r
 WHERE r.id = l.id
   AND l.serial_no IS DISTINCT FROM r.rn;

ALTER TABLE public.hr_salary_register_lines ENABLE TRIGGER trg_hr_salary_register_lines_touch;
