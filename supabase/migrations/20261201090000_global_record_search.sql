-- ============================================================================
-- Global record search for the command palette
-- Created: 2026-09-12
--
-- WHY
--   The Cmd+K palette (components/CommandPalette, PR #367) searches PAGES only.
--   It has never touched the database, so a user who knows a learner's name has
--   to first navigate to Learners > Profiles and search again there. This adds
--   RECORD search to the same box for four high-traffic entities.
--
-- SECURITY MODEL (the whole point of this file)
--   A search box that reaches across the platform is the highest-blast-radius
--   place to get multi-tenant scoping wrong: one missed check and a Dental HOD
--   sees a Nursing learner. Three defences, all inside the function:
--
--   1. PERMISSION per entity. Each block is gated on the SAME permission key
--      that guards that entity's detail route in lib/sidebarMenuLink.ts, so a
--      result can never be something the user is then refused when they click
--      it (a hit you cannot open is its own bug — see the "correct guards
--      compose into no entry point" class).
--        learners  -> learners.profiles.view  -> /learners/profiles/[id]
--        staff     -> staff.view              -> /staff/list/[id]
--        leads     -> admission.leads.view    -> /admission/leads/[id]
--        courses   -> courses.view            -> /courses/[id]
--      user_has_permission() carries the super-admin bypass and merges
--      multi-role grants with OR, so no role names are hardcoded here.
--
--   2. INSTITUTION per row, via role_has_institution_access().
--
--   3. NULL-INSTITUTION ROWS ARE EXCLUDED — deliberate deviation.
--      role_has_institution_access() returns TRUE for a NULL institution_id
--      ("system-wide records"). That default is right for config tables and
--      wrong for people: 3 learners_profiles rows currently have a NULL
--      institution_id, and inheriting the default would publish those 3 to
--      every authenticated user in the platform. Every block therefore
--      requires institution_id IS NOT NULL. Orphan rows are invisible to
--      search until their institution is set — fail closed, not open.
--
--   Callers are further limited to authenticated (see REVOKE/GRANT at the end).
--
-- WHAT IS DELIBERATELY NOT SEARCHABLE
--   aadhar_number, mobile numbers on learners, and parent contact fields.
--   Lead phone IS searchable because a counsellor's working identifier for a
--   lead is the number that just called them; a learner is found by name, roll
--   number, register number or college email instead.
--
-- ROUTES ARE NOT RETURNED. The function returns entity + id; the frontend owns
-- the entity -> URL mapping. Route shapes drift and belong in the app, not in
-- a database function that is expensive to re-deploy.
-- ============================================================================

-- ── Trigram indexes ─────────────────────────────────────────────────────────
-- gin_trgm_ops lives in the `extensions` schema on hosted Supabase, not public.
-- Each index covers the EXACT concatenated expression the function filters on,
-- so a two-word query ("Priya Raman") matches across first_name + last_name
-- instead of failing the way per-column indexes would.

CREATE INDEX IF NOT EXISTS learners_profiles_global_search_trgm_idx
  ON public.learners_profiles
  USING gin ((
    coalesce(first_name, '')      || ' ' ||
    coalesce(last_name, '')       || ' ' ||
    coalesce(roll_number, '')     || ' ' ||
    coalesce(register_number, '') || ' ' ||
    coalesce(college_email, '')
  ) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS staff_global_search_trgm_idx
  ON public.staff
  USING gin ((
    coalesce(first_name, '')        || ' ' ||
    coalesce(last_name, '')         || ' ' ||
    coalesce(staff_id, '')          || ' ' ||
    coalesce(email, '')             || ' ' ||
    coalesce(institution_email, '')
  ) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS admission_leads_global_search_trgm_idx
  ON public.admission_leads
  USING gin ((
    coalesce(full_name, '')          || ' ' ||
    coalesce(first_name, '')         || ' ' ||
    coalesce(last_name, '')          || ' ' ||
    coalesce(phone, '')              || ' ' ||
    coalesce(email, '')              || ' ' ||
    coalesce(application_number, '')
  ) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS courses_global_search_trgm_idx
  ON public.courses
  USING gin ((
    coalesce(course_code, '') || ' ' || coalesce(course_name, '')
  ) extensions.gin_trgm_ops);

-- ── Dispatcher RPC ──────────────────────────────────────────────────────────
-- One function rather than four so that the entire authorization surface of
-- global search is auditable in a single place. Every block has the same
-- three-line shape: permission gate, institution gate, NOT NULL institution.

CREATE OR REPLACE FUNCTION public.fn_global_record_search(
  p_query            text,
  p_limit_per_entity integer DEFAULT 5
)
RETURNS TABLE(
  entity           text,
  record_id        uuid,
  title            text,
  subtitle         text,
  institution_name text,
  match_rank       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '5s'
AS $function$
-- Several OUT parameter names (title, entity) would become plpgsql variables
-- that shadow future column references. use_column removes the whole class of
-- "column reference is ambiguous" failure rather than relying on every later
-- edit remembering to table-qualify.
#variable_conflict use_column
DECLARE
  v_q   text    := btrim(coalesce(p_query, ''));
  -- Clamp: an unbounded p_limit_per_entity from the client would turn this
  -- into a bulk export endpoint for anyone holding one .view permission.
  v_lim integer := least(greatest(coalesce(p_limit_per_entity, 5), 1), 10);
  v_pat text;
BEGIN
  -- Fail closed on an unauthenticated caller. anon is revoked below as well;
  -- this is the second lock, not the only one.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Mirrors the palette's own 2-character floor. Also stops a single-character
  -- query from scanning every trigram index on the platform.
  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  -- Escape LIKE metacharacters so a query of "100%" or "a_b" is treated as
  -- literal text rather than a wildcard.
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  -- ── Learners ──────────────────────────────────────────────────────────────
  IF public.user_has_permission('learners.profiles.view') THEN
    RETURN QUERY
    SELECT
      'learner'::text,
      l.id,
      btrim(coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, '')),
      nullif(btrim(coalesce(l.roll_number, l.register_number, '')), ''),
      i.name::text,
      CASE WHEN coalesce(l.first_name, '') ILIKE v_q || '%'
             OR coalesce(l.roll_number, '') ILIKE v_q || '%'
             OR coalesce(l.register_number, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.learners_profiles l
    LEFT JOIN public.institutions i ON i.id = l.institution_id
    WHERE l.institution_id IS NOT NULL
      AND public.role_has_institution_access(l.institution_id)
      AND (
        coalesce(l.first_name, '')      || ' ' ||
        coalesce(l.last_name, '')       || ' ' ||
        coalesce(l.roll_number, '')     || ' ' ||
        coalesce(l.register_number, '') || ' ' ||
        coalesce(l.college_email, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  -- ── Staff ─────────────────────────────────────────────────────────────────
  IF public.user_has_permission('staff.view') THEN
    RETURN QUERY
    SELECT
      'staff'::text,
      s.id,
      btrim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')),
      nullif(btrim(coalesce(s.staff_id, s.email, '')), ''),
      i.name::text,
      CASE WHEN coalesce(s.first_name, '') ILIKE v_q || '%'
             OR coalesce(s.staff_id, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.staff s
    LEFT JOIN public.institutions i ON i.id = s.institution_id
    WHERE s.institution_id IS NOT NULL
      AND coalesce(s.is_active, true) = true
      AND public.role_has_institution_access(s.institution_id)
      AND (
        coalesce(s.first_name, '')  || ' ' ||
        coalesce(s.last_name, '')   || ' ' ||
        coalesce(s.staff_id, '')    || ' ' ||
        coalesce(s.email, '')       || ' ' ||
        coalesce(s.institution_email, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  -- ── Admission leads ───────────────────────────────────────────────────────
  IF public.user_has_permission('admission.leads.view') THEN
    RETURN QUERY
    SELECT
      'lead'::text,
      a.id,
      btrim(coalesce(a.full_name,
                     coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, ''))),
      nullif(btrim(coalesce(a.application_number, a.phone, '')), ''),
      i.name::text,
      CASE WHEN coalesce(a.full_name, '') ILIKE v_q || '%'
             OR coalesce(a.phone, '') ILIKE v_q || '%'
             OR coalesce(a.application_number, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.admission_leads a
    LEFT JOIN public.institutions i ON i.id = a.institution_id
    WHERE a.institution_id IS NOT NULL
      AND coalesce(a.is_active, true) = true
      AND public.role_has_institution_access(a.institution_id)
      AND (
        coalesce(a.full_name, '')   || ' ' ||
        coalesce(a.first_name, '')  || ' ' ||
        coalesce(a.last_name, '')   || ' ' ||
        coalesce(a.phone, '')       || ' ' ||
        coalesce(a.email, '')       || ' ' ||
        coalesce(a.application_number, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  -- ── Courses ───────────────────────────────────────────────────────────────
  IF public.user_has_permission('courses.view') THEN
    RETURN QUERY
    SELECT
      'course'::text,
      c.id,
      c.course_name::text,
      nullif(btrim(coalesce(c.course_code, '')), ''),
      i.name::text,
      CASE WHEN coalesce(c.course_code, '') ILIKE v_q || '%'
             OR coalesce(c.course_name, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.courses c
    LEFT JOIN public.institutions i ON i.id = c.institution_id
    WHERE c.institution_id IS NOT NULL
      AND coalesce(c.is_active, true) = true
      AND public.role_has_institution_access(c.institution_id)
      AND (
        coalesce(c.course_code, '') || ' ' || coalesce(c.course_name, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.fn_global_record_search(text, integer) IS
  'Command-palette record search across learners, staff, admission leads and courses. Each entity is gated on the same permission key that guards its detail route, scoped by role_has_institution_access(), and excludes NULL-institution rows (fail closed). Returns entity+id only; the frontend owns routing.';

-- Supabase runs ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
-- which is a direct grant separate from PUBLIC. Revoking PUBLIC alone would
-- leave this callable by any holder of the anon key embedded in the JS bundle.
REVOKE EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) TO authenticated;
