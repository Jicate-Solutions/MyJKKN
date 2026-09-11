-- Declared section scope for timetables.
--
-- THE PROBLEM THIS SOLVES
-- A "semester-level" timetable (section_id NULL) was treated by
-- TimetableService.checkExistingTimetable as covering the ENTIRE semester, so
-- the first one created in a semester reserved every section in it and refused
-- every later one whose dates overlapped.
--
-- That assumption is wrong, and production proves it. JKKN Dental's 4th Year BDS
-- semester b9d3aa7d-f2c8-4324-ad8e-71482ace6e9a holds 24 sections in three
-- PARALLEL GROUPS — A..H, ADD 4A..ADD 4H, TROIZ A..TROIZ H — and each group needs
-- its own timetable with the SAME academic year and the SAME dates. The existing
-- "4th Year 2026-2027 DRAVENCOREZ THEORY" (c04e7842) names exactly the eight A..H
-- section ids on every one of its slots: it covers 8 of 24, yet reserved all 24.
-- The operator's workaround was eight hand-built section-level rows.
--
-- WHY A COLUMN AND NOT THE SLOT JSON
-- The section scope was already knowable from the slots — every slot carries a
-- `section_ids` array, and both the learner resolver and
-- fn_timetable_scheduled_sections already read it. But the duplicate guard runs
-- at CREATE time, and slots are only built afterwards in the timetable editor.
-- At the moment the guard needs the answer there is no slot to read, so the
-- scope has to be DECLARED on the row instead of inferred from data that does
-- not exist yet.
--
-- The slots stay authoritative for WHICH slot applies to whom. This column is
-- the uniqueness scope, and the set the editor offers.
ALTER TABLE public.timetables
  ADD COLUMN IF NOT EXISTS section_ids uuid[];

COMMENT ON COLUMN public.timetables.section_ids IS
  'Sections this timetable covers. For a semester-level row (section_id NULL) '
  'this is the uniqueness scope: two semester-level timetables for the same '
  'semester clash only when their dates overlap AND these sets intersect. For a '
  'section-level row it mirrors section_id. NULL means "not declared" and callers '
  'fall back to the union of the slots'' own section_ids.';

-- Array containment/overlap (`&&`, `@>`) is the access pattern; btree cannot serve it.
CREATE INDEX IF NOT EXISTS idx_timetables_section_ids
  ON public.timetables USING gin (section_ids);

-- ---------------------------------------------------------------------------
-- BACKFILL
-- Templates are deliberately skipped: they are prototypes, not scheduled rows,
-- and they are already excluded from the duplicate guard by `is_template IS NOT
-- TRUE`. Giving them a scope would only create drift.
-- ---------------------------------------------------------------------------

-- 1. Section-level rows mirror their own section. 202 rows on production.
UPDATE public.timetables
SET section_ids = ARRAY[section_id]
WHERE section_id IS NOT NULL
  AND COALESCE(is_template, false) = false
  AND section_ids IS NULL;

-- 2. Semester-level rows take the union of the sections their slots name.
--    190 of 199 production rows land here; 181 of those resolve to the whole
--    semester, so the backfill is behaviourally a no-op for them. The 9 that
--    resolve to a real subset are the group case this migration exists for.
--
--    The uuid cast is GUARDED by the same regex fn_timetable_scheduled_sections
--    uses: one malformed entry in a slot's section_ids must not abort the whole
--    backfill. Non-uuid text yields NULL and is dropped by the WHERE.
UPDATE public.timetables t
SET section_ids = sub.sids
FROM (
  SELECT tt.id,
         array_agg(DISTINCT e.sid) AS sids
  FROM public.timetables tt
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(tt.timetable_data) = 'object'
         THEN tt.timetable_data ELSE '{}'::jsonb END) AS day(day_key, day_val)
  CROSS JOIN LATERAL jsonb_each(
    CASE WHEN jsonb_typeof(day.day_val) = 'object'
         THEN day.day_val ELSE '{}'::jsonb END) AS per(period_key, slot)
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN val ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN val::uuid
           END AS sid
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(per.slot -> 'section_ids') = 'array'
                THEN per.slot -> 'section_ids' ELSE '[]'::jsonb END) AS a(val)
  ) e
  WHERE tt.section_id IS NULL
    AND COALESCE(tt.is_template, false) = false
    AND tt.section_ids IS NULL
    AND e.sid IS NOT NULL
  GROUP BY tt.id
) sub
WHERE t.id = sub.id;

-- 3. Semester-level rows whose grid is still empty (9 on production) fall back
--    to every active section of their semester. That is what the old guard
--    effectively assumed, so these rows keep behaving exactly as they do today.
UPDATE public.timetables t
SET section_ids = sub.sids
FROM (
  SELECT tt.id,
         array_agg(s.id) AS sids
  FROM public.timetables tt
  JOIN public.sections s
    ON s.semester_id = tt.semester_id
   AND s.is_active = true
  WHERE tt.section_id IS NULL
    AND COALESCE(tt.is_template, false) = false
    AND tt.section_ids IS NULL
    AND tt.semester_id IS NOT NULL
  GROUP BY tt.id
) sub
WHERE t.id = sub.id;

-- No RLS change. Every policy on public.timetables gates on institution_id plus
-- an academic.timetables.* / learners.my-timetable.view permission key, or on
-- staff_teaching_institution_ids(). None of them reference section_id, so
-- adding a section scope column changes no row's visibility.
