-- 20261222094500_backfill_program_type_from_degree.sql
-- Updated: 2026-09-16 — 84 of 128 programmes carry no program_type, and 52 of them
-- already say what they are, one join away.
--
-- WHY IT MATTERS. `fn_compute_input_sfr` (see 20261204093000) resolves a regulator's
-- staffing norm through the approved programme's own `program_type`, because a
-- regulator's UG and PG ratios differ. A programme with no type matches no norm and the
-- signal answers `insufficient_data` naming the missing type. With 84 of 128 untyped,
-- two thirds of programmes would fall through on the day the first approval letter is
-- uploaded — and that is the worst moment to discover it.
--
-- THE SOURCE IS ALREADY IN THE DATABASE. `programs.degree_id` points at `degrees`, whose
-- `degree_name` is 'Undergraduate' / 'Postgraduate' / 'K-12 Program'. This is not a guess
-- from the programme's name: 46 of the 84 cannot be classified from their name at all.
--
-- THE SOURCE IS PROVEN. Every programme that ALREADY carries a program_type agrees with
-- its linked degree, with zero disagreements:
--     program_type UG  <-> degree 'Undergraduate'   32 of 32
--     program_type PG  <-> degree 'Postgraduate'    12 of 12
-- So this backfill applies a rule the existing data already follows everywhere.
--
-- WHAT IS DELIBERATELY LEFT ALONE.
--   29 programmes whose degree is 'K-12 Program' — the two schools, Nattraja Vidhyalya
--      CBSE and JKKN Matric Higher Secondary. They are not UG or PG, the CHECK constraint
--      on program_type allows only ('UG','PG','Ph.D'), and college staffing norms were
--      never written for a school. The Director ruled 2026-09-16 that schools should be
--      scored against their OWN rule, and that the ratio must come from the two
--      principals rather than from a figure we read somewhere. Until that number exists
--      these stay NULL, which is the honest state: no school norm, no school score.
--      (This is the same root as the defect fixed in 20261204093000, where a Higher
--      Secondary School was scored against a POSTGRADUATE norm.)
--    3 programmes with no degree link at all — nothing to derive from.
--
-- Idempotent: the WHERE clause only touches rows that are still NULL, so re-running
-- changes nothing. Never overwrites a value a human set.

UPDATE public.programs p
   SET program_type = CASE d.degree_name
                        WHEN 'Undergraduate' THEN 'UG'
                        WHEN 'Postgraduate'  THEN 'PG'
                      END,
       updated_at   = now()
  FROM public.degrees d
 WHERE d.id = p.degree_id
   AND p.program_type IS NULL
   AND d.degree_name IN ('Undergraduate', 'Postgraduate');

-- Assert the intent held: no programme may be left typed against a disagreeing degree.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
    FROM public.programs p
    JOIN public.degrees d ON d.id = p.degree_id
   WHERE (p.program_type = 'UG' AND d.degree_name <> 'Undergraduate')
      OR (p.program_type = 'PG' AND d.degree_name <> 'Postgraduate');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'program_type disagrees with the linked degree on % row(s) — backfill aborted', v_bad;
  END IF;
END $$;
