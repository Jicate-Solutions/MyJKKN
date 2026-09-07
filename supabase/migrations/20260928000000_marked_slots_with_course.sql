-- Marked attendance slots, now carrying the course each slot was marked against.
--
-- WHY THE COURSE IS NEEDED
--
-- A "combined" timetable slot teaches two cohorts in the same period, each with
-- its own course and its own member of staff:
--
--   period fb7adfbf  course_id: null   is_combined: true
--     sub_slots[0]   24PCAED4  EDC-II WEB DESIGNING   (Group A)
--     sub_slots[1]   24PZOED4  EDC-II VERMICULTURE    (Group B)
--
-- Both groups must be marked separately, but student_attendance keys its JSONB
-- by PERIOD, not by sub-slot — measured: 0 of 1,171 period keys carry any
-- suffix. So "was this period marked?" cannot distinguish Group A from Group B;
-- only the course_id inside the entry can.
--
-- Returning the course alongside each marked slot lets the pending engine ask
-- the precise question — "was THIS course marked in this period?" — instead of
-- the ambiguous one, so marking Group A no longer silently clears Group B.
--
-- Shape is still one row per timetable, for the reason 20260927000000 gives: the
-- per-slot grain exceeded PostgREST max_rows and truncated silently.
--
-- SECURITY INVOKER: student_attendance RLS scopes the rows.

drop function if exists public.get_marked_attendance_slots(date, date, uuid);

create or replace function public.get_marked_attendance_slots(
  p_date_from      date,                  -- required: bounds the scan
  p_date_to        date,                  -- required
  p_institution_id uuid default null      -- null = every institution RLS allows
)
returns table (
  timetable_id uuid,
  -- { "2026-08-01": { "<slot-id>": "<course-id or empty>" , ... }, ... }
  marked       jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
with slots as (
  select sa.timetable_id,
         sa.attendance_date,
         e.key as period_id,
         -- '' rather than NULL so jsonb_object_agg never drops the entry; the
         -- caller treats '' as "marked, course unknown" and falls back to the
         -- period-only match that plain slots have always used.
         coalesce(nullif(e.value ->> 'course_id', ''), '') as course_id
  from public.student_attendance sa
  cross join lateral jsonb_each(sa.attendance_data) e
  where sa.attendance_date between p_date_from and p_date_to
    and (p_institution_id is null or sa.institution_id = p_institution_id)
    and jsonb_typeof(sa.attendance_data) = 'object'
    and jsonb_typeof(e.value -> 'students') = 'array'
    and jsonb_array_length(e.value -> 'students') > 0
),
-- One student_attendance row per section means the same (timetable, date, slot)
-- can appear more than once. Keep one, preferring a row that names a course.
deduped as (
  select distinct on (timetable_id, attendance_date, period_id)
         timetable_id, attendance_date, period_id, course_id
  from slots
  order by timetable_id, attendance_date, period_id,
           (course_id <> '') desc
),
by_day as (
  select timetable_id,
         attendance_date,
         jsonb_object_agg(period_id, course_id) as slots
  from deduped
  group by timetable_id, attendance_date
)
select b.timetable_id,
       jsonb_object_agg(to_char(b.attendance_date, 'YYYY-MM-DD'), b.slots) as marked
from by_day b
group by b.timetable_id;
$fn$;

comment on function public.get_marked_attendance_slots(date, date, uuid) is
  'Marked attendance slots for the Pending engine, one row per timetable as {date: {slot_id: course_id}}. The course is included so a combined slot''s groups can be told apart — student_attendance keys only by period, so without it marking one group clears the other. SECURITY INVOKER.';

grant execute on function public.get_marked_attendance_slots(date, date, uuid)
  to authenticated;
