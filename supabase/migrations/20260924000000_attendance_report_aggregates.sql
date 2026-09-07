-- Attendance report aggregates: three RPCs that power all six reports.
--
-- Every report on /academic/attendance/reports needs the same thing - the
-- attendance_data JSONB roster unnested and counted - at one of three grains:
--
--   get_attendance_student_course   student x course   Student-wise Course,
--                                                      Low Attendance,
--                                                      Course-wise Summary,
--                                                      Exam Eligibility
--   get_attendance_student_day      student x date     Daily Log Book
--   get_attendance_student_month    student x month    Monthly + Cumulative
--
-- Doing this in Postgres is not an optimisation, it is the only workable option:
-- student_attendance holds 239 MB of roster JSON across 12.8k rows, and pulling
-- it to the browser to count crashed the tab (see 20260923000000).
--
-- SECURITY INVOKER throughout. student_attendance RLS already scopes rows by
-- role and institution, so a faculty caller sees their own sessions and a
-- principal sees the institution, with no role logic duplicated here. Verified:
-- the same call returns 36,791 marked periods for a super_admin and 4,881 for a
-- faculty member.
--
-- STATUS VOCABULARY
--   Live data holds only 'Present' and 'Absent' (plus one stray lowercase
--   'absent'). The type allows 'OnDuty' and the leave service writes 'Leave' /
--   'Holiday', but no such rows exist yet. Matching is case-insensitive so the
--   stray row counts correctly and so the OD/Leave buckets start working the
--   moment that integration writes its first row - without a migration.
--
--   'Holiday' is excluded from the denominator: a holiday is not a conducted
--   hour and must not dilute anybody's percentage.

-- ── shared: which rows are in scope, unnested to one row per student-period ──
-- Inlined into each function rather than shared as a view so the planner can
-- push the filters down into the jsonb expansion.

create or replace function public.get_attendance_student_course(
  p_institution_id   uuid,                 -- required: an unscoped call can exhaust temp disk
  p_date_from        date,                 -- required
  p_date_to          date,                 -- required
  p_academic_year_id uuid default null,
  p_degree_id        uuid default null,
  p_department_id    uuid default null,
  p_program_id       uuid default null,
  p_semester_id      uuid default null,
  p_section_id       uuid default null,
  p_course_id        uuid default null
)
returns table (
  student_id      uuid,
  roll_number     text,
  register_number text,
  student_name    text,
  course_id       uuid,
  course_code     text,
  course_name     text,
  present_hours   bigint,
  absent_hours    bigint,
  od_hours        bigint,
  leave_hours     bigint,
  conducted_hours bigint,
  percentage      numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
with base as (
  select sa.attendance_data
  from public.student_attendance sa
  where sa.institution_id = p_institution_id
    and sa.attendance_date between p_date_from and p_date_to
    and (p_academic_year_id is null or sa.academic_year_id = p_academic_year_id)
    and (p_degree_id        is null or sa.degree_id        = p_degree_id)
    and (p_department_id    is null or sa.department_id    = p_department_id)
    and (p_program_id       is null or sa.program_id       = p_program_id)
    and (p_semester_id      is null or sa.semester_id      = p_semester_id)
    and (p_section_id       is null or sa.section_id       = p_section_id)
    and jsonb_typeof(sa.attendance_data) = 'object'
),
period as (
  select e.value as p
  from base b
  cross join lateral jsonb_each(b.attendance_data) e
  where jsonb_typeof(e.value -> 'students') = 'array'
    and jsonb_array_length(e.value -> 'students') > 0
),
-- Course names come from the period set - tens of thousands of rows - not from
-- the student set, which is over a million. Carrying two text columns through
-- that larger intermediate is what exhausted pgsql_tmp on the first cut of this
-- query and briefly took the database's temp space with it.
course_meta as (
  select distinct on (c.course_id) c.course_id, c.course_code, c.course_name
  from (
    select nullif(pr.p ->> 'course_id', '')::uuid as course_id,
           nullif(pr.p ->> 'course_code', '')     as course_code,
           nullif(pr.p ->> 'course_name', '')     as course_name
    from period pr
  ) c
  where c.course_id is not null
  order by c.course_id, c.course_code nulls last
),
marks as (
  select nullif(pr.p ->> 'course_id', '')::uuid as course_id,
         nullif(s.value ->> 'student_id', '')::uuid as student_id,
         lower(coalesce(s.value ->> 'status', '')) as status
  from period pr
  cross join lateral jsonb_array_elements(pr.p -> 'students') s
  where nullif(s.value ->> 'status', '') is not null
    and nullif(s.value ->> 'student_id', '') is not null
),
scoped as (
  select * from marks
  where status <> 'holiday'
    and (p_course_id is null or course_id = p_course_id)
),
agg as (
  select m.student_id,
         m.course_id,
         (count(*) filter (where m.status = 'present'))::bigint as present_hours,
         (count(*) filter (where m.status = 'absent'))::bigint  as absent_hours,
         (count(*) filter (where m.status in ('onduty', 'on_duty', 'od')))::bigint as od_hours,
         (count(*) filter (where m.status = 'leave'))::bigint   as leave_hours,
         count(*)::bigint as conducted_hours
  from scoped m
  group by m.student_id, m.course_id
)
select a.student_id,
       -- 1,519 of 7,289 learner profiles carry neither a roll nor a register
       -- number, and many roll_number values are '' rather than NULL. Fall back
       -- to the register number and normalise blanks to NULL so the renderers
       -- can print a clear dash instead of an empty cell that reads as a bug.
       coalesce(nullif(trim(lp.roll_number), ''),
                nullif(trim(lp.register_number), '')) as roll_number,
       nullif(trim(lp.register_number), '') as register_number,
       nullif(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') as student_name,
       a.course_id,
       cm.course_code,
       cm.course_name,
       a.present_hours,
       a.absent_hours,
       a.od_hours,
       a.leave_hours,
       a.conducted_hours,
       case when a.conducted_hours > 0
            then round((a.present_hours::numeric * 100) / a.conducted_hours, 2)
            else 0 end as percentage
from agg a
left join course_meta cm on cm.course_id = a.course_id
-- LEFT JOIN on purpose: a learner whose profile row was removed or re-keyed
-- still has marked attendance. Dropping them would quietly shrink the cohort.
left join public.learners_profiles lp on lp.id = a.student_id
order by coalesce(nullif(trim(lp.roll_number), ''), nullif(trim(lp.register_number), '')) nulls last, cm.course_code nulls last;
$fn$;

comment on function public.get_attendance_student_course(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid
) is
  'Per learner per course attendance totals from the student_attendance JSONB roster. Powers the Student-wise Course, Low Attendance, Course-wise Summary and Exam Eligibility reports. SECURITY INVOKER - RLS scopes the rows. Holiday is excluded from conducted_hours.';


create or replace function public.get_attendance_student_day(
  p_institution_id   uuid,                 -- required: an unscoped call can exhaust temp disk
  p_date_from        date,                 -- required
  p_date_to          date,                 -- required
  p_academic_year_id uuid default null,
  p_degree_id        uuid default null,
  p_department_id    uuid default null,
  p_program_id       uuid default null,
  p_semester_id      uuid default null,
  p_section_id       uuid default null,
  p_course_id        uuid default null
)
returns table (
  student_id      uuid,
  roll_number     text,
  register_number text,
  student_name    text,
  -- { "2026-08-01": "P", "2026-08-02": "A", ... }
  days            jsonb,
  present_hours   bigint,
  absent_hours    bigint,
  od_hours        bigint,
  leave_hours     bigint,
  conducted_hours bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
-- Returns ONE ROW PER LEARNER, with the register grid folded into a jsonb map.
--
-- The obvious shape - one row per learner per day - produced ~29,000 rows for a
-- ten-month cohort and hit PostgREST's 10,000 max_rows cap, which truncates
-- silently: the register still renders and still prints, just without some
-- learners. Range-paginating around the cap is worse, because each page re-runs
-- the whole aggregation. Folding the days server-side keeps the response to the
-- size of the class and needs exactly one query.
with base as (
  select sa.attendance_date, sa.attendance_data
  from public.student_attendance sa
  where sa.institution_id = p_institution_id
    and sa.attendance_date between p_date_from and p_date_to
    and (p_academic_year_id is null or sa.academic_year_id = p_academic_year_id)
    and (p_degree_id        is null or sa.degree_id        = p_degree_id)
    and (p_department_id    is null or sa.department_id    = p_department_id)
    and (p_program_id       is null or sa.program_id       = p_program_id)
    and (p_semester_id      is null or sa.semester_id      = p_semester_id)
    and (p_section_id       is null or sa.section_id       = p_section_id)
    and jsonb_typeof(sa.attendance_data) = 'object'
),
marks as (
  select b.attendance_date,
         nullif(s.value ->> 'student_id', '')::uuid as student_id,
         lower(coalesce(s.value ->> 'status', '')) as status
  from base b
  cross join lateral jsonb_each(b.attendance_data) e
  cross join lateral jsonb_array_elements(e.value -> 'students') s
  where jsonb_typeof(e.value -> 'students') = 'array'
    and jsonb_array_length(e.value -> 'students') > 0
    and nullif(s.value ->> 'status', '') is not null
    and nullif(s.value ->> 'student_id', '') is not null
    and (p_course_id is null or nullif(e.value ->> 'course_id', '')::uuid = p_course_id)
),
per_day as (
  select m.student_id,
         m.attendance_date,
         (count(*) filter (where m.status = 'present'))::bigint as present_hours,
         (count(*) filter (where m.status = 'absent'))::bigint  as absent_hours,
         (count(*) filter (where m.status in ('onduty', 'on_duty', 'od')))::bigint as od_hours,
         (count(*) filter (where m.status = 'leave'))::bigint   as leave_hours,
         (count(*) filter (where m.status <> 'holiday'))::bigint as conducted_hours,
         (count(*) filter (where m.status = 'holiday'))::bigint  as holiday_hours
  from marks m
  group by m.student_id, m.attendance_date
),
coded as (
  select d.*,
         -- Precedence matters: a day with any absence reads 'A' even when other
         -- hours were present, which is what a physical register records.
         case
           when d.conducted_hours = 0 and d.holiday_hours > 0 then 'H'
           when d.absent_hours  > 0 then 'A'
           when d.od_hours      > 0 then 'OD'
           when d.leave_hours   > 0 then 'L'
           when d.present_hours > 0 then 'P'
           else '-'
         end as day_code
  from per_day d
),
rolled as (
  select c.student_id,
         jsonb_object_agg(to_char(c.attendance_date, 'YYYY-MM-DD'), c.day_code) as days,
         sum(c.present_hours)::bigint   as present_hours,
         sum(c.absent_hours)::bigint    as absent_hours,
         sum(c.od_hours)::bigint        as od_hours,
         sum(c.leave_hours)::bigint     as leave_hours,
         sum(c.conducted_hours)::bigint as conducted_hours
  from coded c
  group by c.student_id
)
select r.student_id,
       coalesce(nullif(trim(lp.roll_number), ''),
                nullif(trim(lp.register_number), '')) as roll_number,
       nullif(trim(lp.register_number), '') as register_number,
       nullif(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') as student_name,
       r.days,
       r.present_hours,
       r.absent_hours,
       r.od_hours,
       r.leave_hours,
       r.conducted_hours
from rolled r
left join public.learners_profiles lp on lp.id = r.student_id
order by coalesce(nullif(trim(lp.roll_number), ''), nullif(trim(lp.register_number), '')) nulls last;
$fn$;

comment on function public.get_attendance_student_day(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid
) is
  'Per learner attendance register: the day codes (P/A/OD/L/H) folded into a jsonb map plus the row totals. One row per learner, so a full-semester register stays under PostgREST max_rows. Powers the Daily Log Book. SECURITY INVOKER.';


create or replace function public.get_attendance_student_month(
  p_institution_id   uuid,                 -- required: an unscoped call can exhaust temp disk
  p_date_from        date,                 -- required
  p_date_to          date,                 -- required
  p_academic_year_id uuid default null,
  p_degree_id        uuid default null,
  p_department_id    uuid default null,
  p_program_id       uuid default null,
  p_semester_id      uuid default null,
  p_section_id       uuid default null,
  p_course_id        uuid default null
)
returns table (
  student_id      uuid,
  roll_number     text,
  register_number text,
  student_name    text,
  month_start     date,
  present_hours   bigint,
  conducted_hours bigint,
  percentage      numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $fn$
with base as (
  select sa.attendance_date, sa.attendance_data
  from public.student_attendance sa
  where sa.institution_id = p_institution_id
    and sa.attendance_date between p_date_from and p_date_to
    and (p_academic_year_id is null or sa.academic_year_id = p_academic_year_id)
    and (p_degree_id        is null or sa.degree_id        = p_degree_id)
    and (p_department_id    is null or sa.department_id    = p_department_id)
    and (p_program_id       is null or sa.program_id       = p_program_id)
    and (p_semester_id      is null or sa.semester_id      = p_semester_id)
    and (p_section_id       is null or sa.section_id       = p_section_id)
    and jsonb_typeof(sa.attendance_data) = 'object'
),
marks as (
  select date_trunc('month', b.attendance_date)::date as month_start,
         nullif(s.value ->> 'student_id', '')::uuid as student_id,
         lower(coalesce(s.value ->> 'status', '')) as status
  from base b
  cross join lateral jsonb_each(b.attendance_data) e
  cross join lateral jsonb_array_elements(e.value -> 'students') s
  where jsonb_typeof(e.value -> 'students') = 'array'
    and jsonb_array_length(e.value -> 'students') > 0
    and nullif(s.value ->> 'status', '') is not null
    and nullif(s.value ->> 'student_id', '') is not null
    and (p_course_id is null or nullif(e.value ->> 'course_id', '')::uuid = p_course_id)
),
agg as (
  select m.student_id,
         m.month_start,
         (count(*) filter (where m.status = 'present'))::bigint as present_hours,
         (count(*) filter (where m.status <> 'holiday'))::bigint as conducted_hours
  from marks m
  group by m.student_id, m.month_start
)
select a.student_id,
       -- 1,519 of 7,289 learner profiles carry neither a roll nor a register
       -- number, and many roll_number values are '' rather than NULL. Fall back
       -- to the register number and normalise blanks to NULL so the renderers
       -- can print a clear dash instead of an empty cell that reads as a bug.
       coalesce(nullif(trim(lp.roll_number), ''),
                nullif(trim(lp.register_number), '')) as roll_number,
       nullif(trim(lp.register_number), '') as register_number,
       nullif(trim(concat_ws(' ', lp.first_name, lp.last_name)), '') as student_name,
       a.month_start,
       a.present_hours,
       a.conducted_hours,
       case when a.conducted_hours > 0
            then round((a.present_hours::numeric * 100) / a.conducted_hours, 2)
            else 0 end as percentage
from agg a
left join public.learners_profiles lp on lp.id = a.student_id
order by coalesce(nullif(trim(lp.roll_number), ''), nullif(trim(lp.register_number), '')) nulls last, a.month_start;
$fn$;

comment on function public.get_attendance_student_month(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid
) is
  'Per learner per calendar month attendance totals. Powers Monthly + Cumulative; the running cumulative is computed client-side from these rows. SECURITY INVOKER.';


grant execute on function public.get_attendance_student_course(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_attendance_student_day(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_attendance_student_month(
  uuid, date, date, uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
