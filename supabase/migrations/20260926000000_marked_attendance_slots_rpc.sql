-- Which timetable slots already have attendance, without shipping the rosters.
--
-- The Pending Attendance engine needs one thing from student_attendance: the set
-- of (date, timetable, slot) triples that were already marked, so it can
-- subtract them from what the timetables scheduled. It was getting that by
-- selecting `attendance_data` — the whole per-period roster blob — and calling
-- Object.keys() on it in the browser.
--
-- Measured for one college over 2026-06-01..2026-08-31:
--
--     attendance_data downloaded   4.6 MB   (554 rows)
--     information actually used     84 KB   (1,124 slot keys)
--
-- 54x more bytes than the answer needs, and the browser then has to JSON.parse
-- all of it before the real work starts. Same anti-pattern as the reports page
-- crash in 20260923000000 — this table's JSONB is simply too fat to move.
--
-- The `students` array is checked here too: a slot whose array is empty was
-- never really marked, and the old code applied that rule in JS after paying to
-- download the array. Now the row never leaves the database.
--
-- SECURITY INVOKER: student_attendance RLS scopes the rows, exactly as it does
-- for the caller's own SELECT. No new read surface.

create or replace function public.get_marked_attendance_slots(
  p_date_from      date,                  -- required: bounds the scan
  p_date_to        date,                  -- required
  p_institution_id uuid default null      -- null = every institution RLS allows
)
returns table (
  attendance_date date,
  timetable_id    uuid,
  period_id       text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
  select sa.attendance_date,
         sa.timetable_id,
         e.key as period_id
  from public.student_attendance sa
  cross join lateral jsonb_each(sa.attendance_data) e
  where sa.attendance_date between p_date_from and p_date_to
    and (p_institution_id is null or sa.institution_id = p_institution_id)
    and jsonb_typeof(sa.attendance_data) = 'object'
    -- A slot counts as marked only when it carries at least one student, which
    -- is the rule the JS applied after downloading the whole array.
    and jsonb_typeof(e.value -> 'students') = 'array'
    and jsonb_array_length(e.value -> 'students') > 0;
$fn$;

comment on function public.get_marked_attendance_slots(date, date, uuid) is
  'Marked (date, timetable, slot) triples for the Pending Attendance engine. Replaces downloading attendance_data to call Object.keys() on it — 4.6 MB became 84 KB for a one-college quarter. SECURITY INVOKER; student_attendance RLS scopes the rows.';

grant execute on function public.get_marked_attendance_slots(date, date, uuid)
  to authenticated;
