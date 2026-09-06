-- Attendance statistics: aggregate server-side instead of shipping rosters to the browser.
--
-- SYMPTOM
--   /academic/attendance/reports killed the Chrome tab outright with
--   "Aw, Snap! Something went wrong -- Error code: Out of Memory" on plain page
--   load (?page=1&pageSize=10, no filters chosen).
--
-- CAUSE
--   AttendanceReportService.getAttendanceStatistics() ran
--       select id, attendance_date, attendance_data, institution_id
--       from student_attendance
--       where attendance_date between '2020-01-01' and <today>
--   with NO .range() and NO .limit(), then aggregated the JSONB rosters in JS.
--   For a super_admin no institution filter is applied at all, so this asked for
--   every session row of every institution across 6.5 years -- and each row
--   carries attendance_data, a full per-period student roster blob.
--
--   PostgREST's max_rows caps the ROW count, not the payload size. 10k rows each
--   holding several periods x ~48 students is still hundreds of MB of JSON, and
--   JSON.parse must buffer the whole response as a string before building the
--   object graph. That is what exhausted the renderer heap. The statistics card
--   renders above the table, so the page died before painting anything.
--
-- FIX
--   Do the counting in Postgres and return a single jsonb row. Identical
--   anti-pattern and identical cure to
--     20260510260000_admission_dashboard_funnel_aggregate_rpcs.sql
--     20260510270000_admission_counselor_performance_aggregate_rpc.sql
--   both of which exist because someone fetched rows to the client to count them.
--
-- SECURITY
--   SECURITY INVOKER on purpose. student_attendance RLS already scopes rows by
--   role and institution, so a caller gets exactly the rows they could have
--   selected directly -- the aggregate adds no new read surface. Deliberately NOT
--   SECURITY DEFINER: an institution-wide attendance aggregate is precisely the
--   shape that had to be walled off in 20260910100000 / commit d3e874f9f.
--
-- p_today is supplied by the caller rather than read from current_date so the
-- function reproduces the JS `new Date().toISOString().split('T')[0]` (UTC) the
-- old code used, byte for byte, and stays deterministic under test. The
-- UTC-vs-IST question that implies is a separate, pre-existing bug -- not changed
-- here.

-- Matches the actual access pattern of this RPC and of the attendance reports
-- that will follow. Existing indexes cover institution_id and attendance_date
-- separately, which forces a bitmap-and instead of a single ordered scan.
create index if not exists idx_student_attendance_institution_date
  on public.student_attendance (institution_id, attendance_date desc);

drop function if exists public.get_attendance_statistics(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date
);

create function public.get_attendance_statistics(
  p_institution_id   uuid default null,
  p_academic_year_id uuid default null,
  p_degree_id        uuid default null,
  p_department_id    uuid default null,
  p_program_id       uuid default null,
  p_semester_id      uuid default null,
  p_section_id       uuid default null,
  p_date_from        date default null,
  p_date_to          date default null,
  p_today            date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
with base as (
  select sa.attendance_date, sa.attendance_data
  from public.student_attendance sa
  where (p_institution_id   is null or sa.institution_id   = p_institution_id)
    and (p_academic_year_id is null or sa.academic_year_id = p_academic_year_id)
    and (p_degree_id        is null or sa.degree_id        = p_degree_id)
    and (p_department_id    is null or sa.department_id    = p_department_id)
    and (p_program_id       is null or sa.program_id       = p_program_id)
    and (p_semester_id      is null or sa.semester_id      = p_semester_id)
    and (p_section_id       is null or sa.section_id       = p_section_id)
    and (p_date_from        is null or sa.attendance_date >= p_date_from)
    and (p_date_to          is null or sa.attendance_date <= p_date_to)
    and jsonb_typeof(sa.attendance_data) = 'object'
),
-- attendance_data is an object keyed by timetable_slot_id; one row per period.
period as (
  select b.attendance_date, e.value as p
  from base b
  cross join lateral jsonb_each(b.attendance_data) e
),
-- A period counts only when its students array exists, is non-empty, and at
-- least one entry carries a status. Mirrors the hasAttendanceMarked guard the
-- TypeScript implementation applied, so the numbers do not shift under callers.
marked as (
  select pd.attendance_date, pd.p
  from period pd
  where jsonb_typeof(pd.p -> 'students') = 'array'
    and jsonb_array_length(pd.p -> 'students') > 0
    and exists (
      select 1
      from jsonb_array_elements(pd.p -> 'students') s
      where nullif(s.value ->> 'status', '') is not null
    )
),
stu as (
  select m.attendance_date,
         s.value ->> 'student_id' as student_id,
         s.value ->> 'status'     as status
  from marked m
  cross join lateral jsonb_array_elements(m.p -> 'students') s
),
daily as (
  select attendance_date                                     as d,
         count(*)::bigint                                    as total,
         (count(*) filter (where status = 'Present'))::bigint as present
  from stu
  group by attendance_date
),
-- assigned_faculty is either a single object or an array of them.
fac as (
  select distinct f.value ->> 'faculty_id' as faculty_id
  from marked m
  cross join lateral (
    select case jsonb_typeof(m.p -> 'assigned_faculty')
             when 'array'  then m.p -> 'assigned_faculty'
             when 'object' then jsonb_build_array(m.p -> 'assigned_faculty')
             else '[]'::jsonb
           end as arr
  ) a
  cross join lateral jsonb_array_elements(a.arr) f
  where nullif(f.value ->> 'faculty_id', '') is not null
),
today_periods as (
  select count(*)::bigint as periods,
         coalesce(sum(jsonb_array_length(m.p -> 'students')), 0)::bigint as capacity
  from marked m
  where m.attendance_date = coalesce(p_today, current_date)
),
totals as (
  select (select count(*) from marked)::bigint as total_classes,
         (select count(distinct student_id) from stu
           where student_id is not null)::bigint as total_students,
         (select count(*) from fac)::bigint as total_faculty,
         coalesce((select sum(total)   from daily), 0)::bigint as sum_total,
         coalesce((select sum(present) from daily), 0)::bigint as sum_present
),
today_row as (
  select coalesce(d.total, 0)::bigint   as total,
         coalesce(d.present, 0)::bigint as present
  from (select 1) x
  left join daily d on d.d = coalesce(p_today, current_date)
),
week_row as (
  select coalesce(d.total, 0)::bigint   as total,
         coalesce(d.present, 0)::bigint as present
  from (select 1) x
  left join daily d on d.d = coalesce(p_today, current_date) - 7
),
-- JS sorted ascending then took the last 30; taking the 30 most recent and
-- re-sorting ascending is the same window.
trend as (
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'date',       t.d,
             'percentage', t.percentage,
             'present',    t.present,
             'total',      t.total
           ) order by t.d
         ), '[]'::jsonb) as items
  from (
    select d, present, total,
           case when total > 0 then (present::numeric * 100) / total else 0 end as percentage
    from daily
    order by d desc
    limit 30
  ) t
),
alerts as (
  select coalesce(jsonb_agg(
           jsonb_build_object('date', a.d, 'percentage', a.percentage)
           order by a.d desc
         ), '[]'::jsonb) as items
  from (
    select d, (present::numeric * 100) / total as percentage
    from daily
    where total > 0
      and present > 0
      and (present::numeric * 100) / total < 75
    order by d desc
    limit 10
  ) a
)
select jsonb_build_object(
  'totalClasses', tt.total_classes,
  'averageAttendance',
    case when tt.sum_total > 0
         then round((tt.sum_present::numeric * 100) / tt.sum_total, 2)
         else 0 end,
  'totalStudents', tt.total_students,
  'totalFaculty',  tt.total_faculty,
  'presentToday',  tr.present,
  'absentToday',   tr.total - tr.present,
  'todayClasses',  tp.periods,
  'todayAttendanceRate',
    case when tr.total > 0
         then round((tr.present::numeric * 100) / tr.total, 2)
         else 0 end,
  'weeklyComparison',
    (case when tr.total > 0
          then round((tr.present::numeric * 100) / tr.total, 2)
          else 0 end)
    - (case when wr.total > 0
            then (wr.present::numeric * 100) / wr.total
            else 0 end),
  'attendanceTrend',      tn.items,
  'departmentComparison', '[]'::jsonb,
  'lowAttendanceAlerts',  al.items,
  'todayPeriods',         tp.periods,
  'todayTotalCapacity',   tp.capacity
)
from totals tt, today_row tr, week_row wr, today_periods tp, trend tn, alerts al;
$fn$;

comment on function public.get_attendance_statistics(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date
) is
  'Attendance dashboard statistics as a single jsonb row. Replaces a client-side fetch of every student_attendance row (rosters included) that crashed the browser tab with an out-of-memory error. SECURITY INVOKER: student_attendance RLS scopes the rows, so this adds no read surface.';

grant execute on function public.get_attendance_statistics(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, date, date, date
) to authenticated;
