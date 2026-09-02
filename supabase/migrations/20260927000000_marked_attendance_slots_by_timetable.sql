-- Marked attendance slots, folded per timetable so the result cannot be truncated.
--
-- WHY THIS REPLACES 20260926000000
--
-- That function returned one row per marked slot. PostgREST caps a response at
-- max_rows (10,000 here) and truncates SILENTLY, and the slot grain blows
-- through it easily:
--
--     window (all institutions)   rows returned      capped?
--     92 days                        21,991            yes
--     365 days                       38,849            yes
--
-- The column-read it replaced was not safe either — one row per
-- student_attendance record is 13,090 over a year, also past the cap. So both
-- the old code and my first fix could lose marked slots.
--
-- Losing a MARKED slot is worse than it sounds. The Pending engine computes
-- pending = scheduled - marked, so a marked slot that fails to arrive comes back
-- as PENDING: a session someone already registered is printed as their backlog,
-- and they get chased for work they did. Silent over-reporting on a report that
-- names individual faculty.
--
-- Folding by timetable caps the row count at the number of timetables that have
-- any attendance at all — under 200 across every college — so no window, however
-- wide, can reach the ceiling.
--
-- SECURITY INVOKER: student_attendance RLS scopes the rows, as before.

drop function if exists public.get_marked_attendance_slots(date, date, uuid);

create or replace function public.get_marked_attendance_slots(
  p_date_from      date,                  -- required: bounds the scan
  p_date_to        date,                  -- required
  p_institution_id uuid default null      -- null = every institution RLS allows
)
returns table (
  timetable_id uuid,
  -- { "2026-08-01": ["<slot-id>", ...], "2026-08-02": [...] }
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
         e.key as period_id
  from public.student_attendance sa
  cross join lateral jsonb_each(sa.attendance_data) e
  where sa.attendance_date between p_date_from and p_date_to
    and (p_institution_id is null or sa.institution_id = p_institution_id)
    and jsonb_typeof(sa.attendance_data) = 'object'
    -- A slot counts as marked only when it carries at least one student — the
    -- rule the JS used to apply after downloading the whole roster array.
    and jsonb_typeof(e.value -> 'students') = 'array'
    and jsonb_array_length(e.value -> 'students') > 0
),
by_day as (
  select timetable_id,
         attendance_date,
         jsonb_agg(distinct period_id) as period_ids
  from slots
  group by timetable_id, attendance_date
)
select b.timetable_id,
       jsonb_object_agg(to_char(b.attendance_date, 'YYYY-MM-DD'), b.period_ids) as marked
from by_day b
group by b.timetable_id;
$fn$;

comment on function public.get_marked_attendance_slots(date, date, uuid) is
  'Marked attendance slots for the Pending engine, folded to one row per timetable as {date: [slot_ids]}. Folded rather than per-slot because the per-slot grain exceeded PostgREST max_rows and truncated silently, which turned already-marked sessions into phantom pending ones. SECURITY INVOKER.';

grant execute on function public.get_marked_attendance_slots(date, date, uuid)
  to authenticated;
