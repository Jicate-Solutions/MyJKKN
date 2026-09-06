-- Attendance access scope: who may read which attendance rows.
--
-- WHAT IS WRONG TODAY
--
-- student_attendance has two PERMISSIVE select policies that grant the whole
-- institution to anyone whose profiles.institution_id matches, with no role and
-- no permission test:
--
--     "Enhanced attendance custom role access"   institution_id IN (my institution)
--     "student_attendance_select_institution"    institution_id IN (my institution)
--
-- Measured by impersonation: a librarian at the Engineering college reads 2,945
-- attendance rows covering 14,588 named-student records; an office assistant at
-- Dental reads 3,072. There is effectively no role-based access on attendance
-- reads at all.
--
-- Policies are permissive and OR together, so a tighter policy ADDS access
-- rather than removing it. Fixing this means REPLACING those two, which is a
-- separate reviewed migration. THIS ONE IS ADDITIVE AND CHANGES NOTHING: it
-- defines the scope and the predicate so the new rule can be dry-run against
-- every role and compared with today's visibility before any policy is touched.
--
-- THE FIVE LEVELS (union — the widest applicable rule wins)
--
--   super_admin / ceo / cao / managing_director   every institution
--   principal                                     their institution
--   hod                                           their institution + department
--   facilitator                                   the classes their staff_plan covers
--   class in-charge                               timetables they are in charge of
--
-- WHY FACILITATOR IS GATED ON THE PLAN'S CLASS, NOT ITS COURSES
--
-- The natural reading is "the courses named in staff_plan_courses". Two earlier
-- attempts did exactly that and both were unusable:
--
--   * resolving course -> timetable inside the row predicate unnested every
--     timetable's timetable_data for each of ~12,800 rows;
--   * doing the same expansion once inside this function still cost 0.9-2.0 s
--     per call, because it scans ~12,300 slots across 198 timetables.
--
-- An RLS predicate has to be cheap. staff_plans already records the institution,
-- department, programme and semester a plan covers, and student_attendance
-- carries those same four columns — so the row gate is a plain indexed column
-- match with no JSONB at all. The grant is one step coarser than "only their
-- courses" (they can reach the rows of the class they teach in), and the report
-- RPCs narrow to the exact course using `course_ids` below. Where the coarser
-- grant is not acceptable the fix is a maintained timetable->course lookup
-- table, not a JSONB scan in a policy.

-- ── the caller's scope, resolved once ──────────────────────────────────────
--
-- SECURITY DEFINER because it reads staff, staff_plans and timetables, which the
-- caller may not be able to read directly. Safe because it resolves ONLY
-- auth.uid() — there is no parameter to point it at another user, which is the
-- failure mode that made three functions callable against anybody in d3e874f9f.
create or replace function public.attendance_access_scope()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_role        text;
  v_institution uuid;
  v_department  uuid;
  v_email       text;
  v_staff       uuid[];
  v_result      jsonb;
begin
  select lower(coalesce(p.role, '')), p.institution_id, p.department_id, p.email
    into v_role, v_institution, v_department, v_email
  from public.profiles p
  where p.id = auth.uid();

  if v_role is null then
    return jsonb_build_object('role', null, 'global', false,
      'institution_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'plan_scopes', '[]'::jsonb, 'course_ids', '[]'::jsonb,
      'teaching_institution_ids', '[]'::jsonb, 'timetable_ids', '[]'::jsonb);
  end if;

  -- Short-circuit before any lookup. A global reader needs none of the joins
  -- below, and computing them anyway cost super_admin 2 seconds a call.
  if v_role in ('super_admin', 'ceo', 'cao', 'managing_director') then
    return jsonb_build_object('role', v_role, 'global', true,
      'institution_ids', '[]'::jsonb, 'department_ids', '[]'::jsonb,
      'plan_scopes', '[]'::jsonb, 'course_ids', '[]'::jsonb,
      'teaching_institution_ids', '[]'::jsonb, 'timetable_ids', '[]'::jsonb);
  end if;

  -- Both linkages are populated (867 of 871 staff rows carry each), so match on
  -- either rather than trusting one to be present.
  select array_agg(s.id) into v_staff
  from public.staff s
  where s.profile_id = auth.uid()
     or (v_email is not null and s.institution_email = v_email);

  v_staff := coalesce(v_staff, array[]::uuid[]);

  select jsonb_build_object(
    'role', v_role,
    'global', false,

    -- Principal and HOD only. Everyone else reaches rows by class or plan.
    --
    -- Resolved through role_has_institution_access() rather than matching
    -- profiles.institution_id directly, because that helper is CAS-aware: the
    -- Arts and Science college exists as Aided and Self siblings sharing one
    -- counselling code. Matching the id exactly cost a CAS principal 580 of
    -- 1,873 rows in the dry-run — their sibling college simply disappeared.
    'institution_ids', case
      when v_role in ('principal', 'hod') then coalesce((
        select jsonb_agg(i.id)
        from public.institutions i
        where public.role_has_institution_access(i.id)
      ), '[]'::jsonb)
      else '[]'::jsonb end,

    'department_ids', case
      when v_role = 'hod' and v_department is not null
        then jsonb_build_array(v_department) else '[]'::jsonb end,

    -- Facilitator: the classes their plans cover, as plain column values.
    'plan_scopes', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
               'institution_id', sp.institution_id,
               'department_id',  sp.department_id,
               'program_id',     sp.program_id,
               'semester_id',    sp.semester_id))
      from public.staff_plans sp
      where exists (
        select 1 from public.staff_plan_courses spc
        where spc.staff_plan_id = sp.id and spc.staff_id = any (v_staff))
    ), '[]'::jsonb),

    -- Kept for the report RPCs, which narrow within a row to these courses.
    -- NOT used by the row predicate; see the header note.
    'course_ids', coalesce((
      select jsonb_agg(distinct spc.course_id)
      from public.staff_plan_courses spc
      where spc.staff_id = any (v_staff) and spc.course_id is not null
    ), '[]'::jsonb),

    -- Teaching staff fall back to the institutions they actually teach at.
    --
    -- Not one of the five named levels, but necessary: only 258 of 390 faculty
    -- have a staff_plan and 101 are class in-charge, so plan-and-class alone
    -- left ~111 teaching faculty with zero access to the module they mark
    -- attendance in. This reuses staff_teaching_institution_ids(), the same
    -- helper the existing visiting-teacher policy uses, so it grants nothing to
    -- a librarian or a driver, who teach nowhere.
    'teaching_institution_ids', coalesce(
      to_jsonb(public.staff_teaching_institution_ids()), '[]'::jsonb),

    -- Class in-charge: an indexed column, cheap.
    'timetable_ids', coalesce((
      select jsonb_agg(distinct t.id)
      from public.timetables t
      where t.class_incharge_id = any (v_staff)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$fn$;

comment on function public.attendance_access_scope() is
  'The calling user''s attendance reach as jsonb: global flag, institutions, departments, plan_scopes (facilitator classes), course_ids (for RPC-level narrowing) and timetable_ids (class in-charge). Resolves only auth.uid() — deliberately takes no user parameter.';

revoke all on function public.attendance_access_scope() from public, anon;
grant execute on function public.attendance_access_scope() to authenticated;


-- ── the row predicate ──────────────────────────────────────────────────────
--
-- Pure jsonb containment over values the scope already resolved: no table
-- access, no JSONB scan of timetable_data. Callers must pass the scope in so it
-- is evaluated ONCE per statement — an RLS policy does that by wrapping the
-- scope call in a scalar subquery, which the planner turns into an InitPlan.
create or replace function public.can_read_attendance_row(
  p_scope          jsonb,
  p_institution_id uuid,
  p_department_id  uuid,
  p_program_id     uuid,
  p_semester_id    uuid,
  p_timetable_id   uuid
)
returns boolean
language sql
immutable
parallel safe
as $fn$
select
  -- Super admin / CEO / CAO / MD
  coalesce((p_scope -> 'global')::boolean, false)

  -- Principal: their institution. HOD: their institution AND department.
  or (
    p_institution_id is not null
    and (p_scope -> 'institution_ids') @> to_jsonb(p_institution_id)
    and (
      jsonb_array_length(coalesce(p_scope -> 'department_ids', '[]'::jsonb)) = 0
      or (p_department_id is not null
          and (p_scope -> 'department_ids') @> to_jsonb(p_department_id))
    )
  )

  -- Teaching staff at the institutions they teach at.
  or (
    p_institution_id is not null
    and (p_scope -> 'teaching_institution_ids') @> to_jsonb(p_institution_id)
  )

  -- Class in-charge.
  or (
    p_timetable_id is not null
    and (p_scope -> 'timetable_ids') @> to_jsonb(p_timetable_id)
  )

  -- Facilitator: a plan covering this class. A plan field left NULL means "any",
  -- so a department-wide plan is not accidentally narrowed to nothing.
  or exists (
    select 1
    from jsonb_array_elements(coalesce(p_scope -> 'plan_scopes', '[]'::jsonb)) ps
    where (ps ->> 'institution_id' is null
           or ps ->> 'institution_id' = p_institution_id::text)
      and (ps ->> 'department_id' is null
           or ps ->> 'department_id' = p_department_id::text)
      and (ps ->> 'program_id' is null
           or ps ->> 'program_id' = p_program_id::text)
      and (ps ->> 'semester_id' is null
           or ps ->> 'semester_id' = p_semester_id::text)
  );
$fn$;

comment on function public.can_read_attendance_row(jsonb, uuid, uuid, uuid, uuid, uuid) is
  'Row predicate for attendance reads: the five access levels as a union, evaluated against a scope resolved once per statement. IMMUTABLE and touches no tables, so it is safe to call per row. Grants nothing until a policy references it.';

revoke all on function public.can_read_attendance_row(jsonb, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.can_read_attendance_row(jsonb, uuid, uuid, uuid, uuid, uuid) to authenticated;
