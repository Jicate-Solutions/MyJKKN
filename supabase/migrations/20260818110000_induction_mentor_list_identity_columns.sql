-- Senior Peer Mentor list — carry the identity columns the picker already shows.
--
-- THE GAP. An appointed mentor rendered as "<register number> · cap 20" and
-- nothing else, on both the induction detail card and the /mentors console. Once
-- the picker gained degree / department / programme / semester / section filters
-- (20260818100000_induction_peer_mentor_picker_filters.sql), an admin could
-- narrow to one section, appoint someone from it — and then have no way to read
-- back from the list that the right person actually landed there. Roll number,
-- email and semester are the three an admin checks, so the list returns them
-- now, alongside the placement columns that make the picker's filters
-- verifiable after the fact.
--
-- DROP + CREATE, not CREATE OR REPLACE: RETURNS TABLE changes shape and Postgres
-- refuses with "cannot change return type of existing function". The ARGUMENT
-- signature is unchanged (uuid), so unlike the picker rewrite there is no second
-- overload for PostgREST to keep answering from. DROP does still discard EXECUTE
-- grants — reverting them to PUBLIC — so they are re-granted explicitly below.
--
-- NEW COLUMNS ARE APPENDED, NEVER INSERTED. The body's `ORDER BY 2` is
-- positional: it exists to dodge the RETURNS TABLE output-name ambiguity that
-- `ORDER BY full_name` would raise in plpgsql. Inserting a column ahead of
-- position 2 would silently re-sort the entire roster by something else, with no
-- error anywhere. Append only.
--
-- LEFT JOIN on every academic table, deliberately. An INNER join drops a mentor
-- whose section or department is unset — the roster would quietly show fewer
-- mentors than are actually appointed, and the freshers assigned to the missing
-- mentor would look unowned. A blank cell is the far better failure.

DROP FUNCTION IF EXISTS public.fn_induction_list_feedback_volunteers(uuid);

CREATE FUNCTION public.fn_induction_list_feedback_volunteers(p_event_id uuid)
RETURNS TABLE(
  -- ── existing shape, order preserved (see "append only" above) ──────────────
  learner_id      uuid,
  full_name       text,
  register_number text,
  capacity        integer,
  is_active       boolean,
  group_size      integer,
  captured        integer,
  guide_read      boolean,
  self_ack        boolean,
  admin_trained   boolean,
  is_trained      boolean,
  -- ── appended: identity + academic placement ───────────────────────────────
  roll_number     text,
  college_email   text,
  student_email   text,
  student_mobile  text,
  program_name    text,
  department_name text,
  section_name    text,
  semester_name   text,
  semester_order  integer,
  /** Derived, not stored — same rule as the picker: 2 semesters to a year. */
  year_of_study   integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'list_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN
    RAISE EXCEPTION 'list_feedback_volunteers: not authorized';
  END IF;
  RETURN QUERY
    SELECT v.learner_id,
           btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
           lp.register_number::text,
           v.capacity, v.is_active,
           (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g WHERE g.volunteer_id = v.id),
           (SELECT count(DISTINCT g.learner_id)::int FROM public.induction_feedback_volunteer_group g
             WHERE g.volunteer_id = v.id
               AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                           WHERE f.learner_id = g.learner_id AND f.event_id = v.event_id)),
           v.guide_read_at IS NOT NULL, v.self_ack_at IS NOT NULL, v.admin_trained_at IS NOT NULL, v.is_trained,
           -- appended columns. Every reference is table-qualified: the output
           -- parameter names above are in scope as plpgsql variables, so an
           -- unqualified `semester_order` here would fail as ambiguous.
           lp.roll_number::text,
           lp.college_email::text,
           lp.student_email::text,
           lp.student_mobile::text,
           coalesce(prg.display_name, prg.program_name)::text,
           coalesce(dept.display_name, dept.department_name)::text,
           sec.section_name::text,
           sem.semester_name::text,
           sem.semester_order::integer,
           CASE WHEN sem.semester_order IS NULL THEN NULL
                ELSE ceil(sem.semester_order::numeric / 2)::integer END
    FROM public.induction_feedback_volunteers v
    JOIN public.learners_profiles lp ON lp.id = v.learner_id
    LEFT JOIN public.programs    prg  ON prg.id  = lp.program_id
    LEFT JOIN public.departments dept ON dept.id = lp.department_id
    LEFT JOIN public.sections    sec  ON sec.id  = lp.section_id
    LEFT JOIN public.semesters   sem  ON sem.id  = lp.semester_id
    WHERE v.event_id = p_event_id
    ORDER BY 2;   -- positional on purpose; see the header note before reordering
END $function$;

REVOKE ALL ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) FROM anon;
-- service_role is named explicitly to match 20260730140000_*, which last granted
-- it. It also arrives via Supabase's default privileges, but relying on that
-- would make a fresh replay of this file depend on an invisible default.
GRANT EXECUTE ON FUNCTION public.fn_induction_list_feedback_volunteers(uuid) TO authenticated, service_role;
