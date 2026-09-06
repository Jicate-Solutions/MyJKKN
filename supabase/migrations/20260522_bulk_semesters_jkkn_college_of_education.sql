-- Bulk-create semesters for JKKN College of Education
--
-- Context: JKKN College of Education (id 9380358f-7020-4c23-89c3-e9538b47cf33)
-- has 10 B.Ed pedagogy programs (all 2.0-year duration) but currently holds only
-- one orphan semester row that does not match peer naming convention.
-- Peer institutions (Arts & Science, Engineering, etc.) use:
--   semester_code = '<3-letter-prefix>-<N>', semester_name = 'Semester I/II/III/IV',
--   semester_type alternating odd/even by parity, initial/terminal flags on first/last.
-- This migration normalises the orphan row in-place and inserts the remaining
-- 39 rows so every B.Ed program ends up with exactly 4 semesters in the same
-- format used by peer institutions.
--
-- Idempotent: re-running is a no-op because of the NOT EXISTS guard on
-- (program_id, semester_code).

BEGIN;

-- Step 1: Normalise the existing orphan row to the canonical BPS-1 shape.
-- We UPDATE in-place (do not delete+recreate) to preserve the row's UUID for
-- any downstream FK references (course offerings, fee structures, etc.).
UPDATE public.semesters
SET semester_code     = 'BPS-1',
    semester_name     = 'Semester I',
    semester_type     = 'odd',
    semester_order    = 1,
    initial_semester  = true,
    terminal_semester = false,
    is_active         = true,
    updated_at        = NOW()
WHERE id = 'a8278ae3-e710-4acb-b907-dc23eb8af7ad';

-- Step 2: Insert the remaining 39 semester rows.
-- (10 programs x 4 sems = 40 candidate rows; BPS-1 already exists from Step 1
-- and is filtered out by the NOT EXISTS guard, leaving 39 to insert.)
WITH ctx AS (
    SELECT
        '9380358f-7020-4c23-89c3-e9538b47cf33'::uuid AS institution_id,
        '8b027092-7e34-4d39-93b2-c6e1d2ce0800'::uuid AS degree_id,         -- Undergraduate
        '212ca252-1962-4538-a0b3-91f34fc78c82'::uuid AS department_id      -- Bachelor of Education
),
programs (program_id, prefix) AS (
    VALUES
        ('662cb4b4-84f8-4888-8dad-c8902840e832'::uuid, 'BCA'),   -- Pedagogy of Commerce and Accountancy
        ('ce4d19b0-afad-4ac9-acfa-638ed68305cb'::uuid, 'BCS'),   -- Pedagogy of Computer Science
        ('149ac1a4-c6f0-415f-b343-96e9a1d87023'::uuid, 'BEC'),   -- Pedagogy of Economics
        ('dceeea1a-79a1-48bc-885f-351bfd9800aa'::uuid, 'BEN'),   -- Pedagogy of English
        ('f6709bd9-dc91-4320-83c2-1403c820678e'::uuid, 'BHI'),   -- Pedagogy of History
        ('e0664e7e-b4c9-4927-a919-74e4bd3cdb74'::uuid, 'BMA'),   -- Pedagogy of Mathematics
        ('c3ac44db-6cfd-4a7d-948e-95977ca2234d'::uuid, 'BPS'),   -- Pedagogy of Physical Science (BPS-1 already updated)
        ('db10bd63-da82-420c-88e6-ae34fcafe1ff'::uuid, 'BSS'),   -- Pedagogy of Social Science
        ('e3dfecca-536b-4feb-8a5c-5281577e883c'::uuid, 'BSS2'),  -- Pedagogy of Social Science (duplicate program row)
        ('de176e31-2fe8-431c-857f-35fcd5f6c40e'::uuid, 'BTA')    -- Pedagogy of Tamil
),
sem_template (n, roman, sem_type, is_initial, is_terminal) AS (
    VALUES
        (1, 'I',   'odd',  true,  false),
        (2, 'II',  'even', false, false),
        (3, 'III', 'odd',  false, false),
        (4, 'IV',  'even', false, true)
)
INSERT INTO public.semesters (
    institution_id,
    degree_id,
    department_id,
    program_id,
    semester_code,
    semester_name,
    semester_type,
    semester_order,
    initial_semester,
    terminal_semester,
    is_active,
    created_at,
    updated_at
)
SELECT
    ctx.institution_id,
    ctx.degree_id,
    ctx.department_id,
    p.program_id,
    (p.prefix || '-' || t.n::text)              AS semester_code,
    ('Semester ' || t.roman)                    AS semester_name,
    t.sem_type                                  AS semester_type,
    t.n                                         AS semester_order,
    t.is_initial                                AS initial_semester,
    t.is_terminal                               AS terminal_semester,
    true                                        AS is_active,
    NOW()                                       AS created_at,
    NOW()                                       AS updated_at
FROM ctx
CROSS JOIN programs p
CROSS JOIN sem_template t
WHERE NOT EXISTS (
    SELECT 1
    FROM public.semesters s
    WHERE s.program_id    = p.program_id
      AND s.semester_code = (p.prefix || '-' || t.n::text)
);

COMMIT;
