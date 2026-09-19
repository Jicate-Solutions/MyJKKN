-- Restore num_cycles on cycle timetables that createTimetable dropped.
--
-- Found 2026-09-10 while investigating BUG-006085. TimetableService.createTimetable
-- builds its insert from an explicit column list and `num_cycles` was never on it,
-- so every cycle-format timetable created through that path landed with
-- num_cycles NULL. get_cycle_for_date returns NULL when num_cycles is NULL, so no
-- date ever resolves to a cycle: the grid draws, the slots are there, and faculty
-- are told "no classes scheduled for today" for the entire term.
--
-- Two live rows in JKKN College of Arts and Science (Aided) were in that state,
-- both created 2026-08-28 with six authored cycle-N blocks in timetable_data:
--   f2942009-536f-4204-b541-96c5f53c6bd9  I M.Com
--   e05a9bca-8fc4-4cf1-8530-e74942f47edd  I M.Sc ZOOLOGY
--
-- The count comes from the row's OWN timetable_data rather than a constant, so it
-- restores what each author actually built.
--
-- They also share the 2026-08-18 anchor that caused BUG-006085, and the same
-- college-wide rotation anchored 2026-06-15 puts 18 Aug on Cycle 3. Bringing them
-- back to life on Cycle 1 would reproduce the reported bug for two more cohorts,
-- so they are aligned in the same statement.
UPDATE public.timetables t
   SET num_cycles = sub.authored_cycles,
       start_cycle = 3,
       updated_at  = NOW()
  FROM (
    SELECT id,
           (SELECT max((regexp_match(k, '^cycle-(\d+)$'))[1]::int)
              FROM jsonb_object_keys(timetable_data) k
             WHERE k ~ '^cycle-\d+$') AS authored_cycles
      FROM public.timetables
     WHERE id IN (
       'f2942009-536f-4204-b541-96c5f53c6bd9',
       'e05a9bca-8fc4-4cf1-8530-e74942f47edd'
     )
  ) sub
 WHERE t.id                = sub.id
   AND t.timetable_format  = 'cycle'
   AND t.num_cycles       IS NULL
   AND t.start_date        = '2026-08-18'
   AND sub.authored_cycles IS NOT NULL;
