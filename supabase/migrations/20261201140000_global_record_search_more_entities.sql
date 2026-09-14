-- ============================================================================
-- Global record search reaches past learners, staff, leads and courses
-- Created: 2026-09-12
--
-- WHAT THIS ADDS
--   Three organisational entities — departments, programmes and institutions —
--   to fn_global_record_search, taking the Cmd+K palette from four record
--   kinds to seven. Nothing else about the function changes.
--
-- WHAT IT DELIBERATELY DOES NOT ADD: BILLING
--   Invoices and receipts were candidates and were DROPPED. This function is
--   SECURITY INVOKER, so each table's own RLS is the ONLY thing standing
--   between a caller and a row. `billing_invoices` and `billing_receipts`
--   carry ZERO named CREATE POLICY statements anywhere in supabase/migrations,
--   and the live catalogue could not be consulted while this was written
--   (the project connection was down for the whole session).
--
--   That is not proof RLS is absent — the live catalogue is known to hold far
--   more policies than the repo records. It is the absence of proof that RLS
--   is PRESENT, which is a different and sufficient reason to stop: on
--   2026-09-12 this very function leaked admission-lead names and phone
--   numbers because a security decision was made on an assumption. Financial
--   records are the last place to repeat that. Billing can be added in a
--   follow-up that opens with `SELECT relrowsecurity FROM pg_class` against
--   the live database.
--
-- THE THREE RULES THIS FILE MUST NOT BREAK
--   Restated from 20261201100000, whose header explains what each one cost.
--
--   1. SECURITY INVOKER, NEVER DEFINER. DEFINER does not ADD a check, it
--      REPLACES each table's RLS policy — and the real policies are far richer
--      than anything reproducible here. That substitution was the defect.
--   2. NO role_has_institution_access() (or any other institution predicate)
--      in a query body. It is a second, simpler authorization rule competing
--      with the policy RLS actually applies. The new arms rely on the same
--      policies the Organisations pages already rely on:
--      departments_select_by_role, programs_select_by_role and
--      institutions_select_by_role each begin
--          is_super_admin() OR is_admin() OR role_has_institution_access(...)
--      so scoping is enforced by RLS, once, where it belongs.
--   3. user_has_permission() is a SHORT-CIRCUIT and a group label, never the
--      boundary. It stops a caller with no permission from scanning three more
--      tables, and it maps each group to the permission guarding its detail
--      route.
--
-- WHY THESE THREE ENTITIES ARE SAFE TO ADD
--   Each has a real detail route the palette can reach
--   (/organizations/{departments,programs,institutions}/[id]), a permission
--   key already in lib/constants/permissions.ts, and a MENU_PERMISSIONS row —
--   so the drift guard in __tests__/lib/navigation/global-record-search-keys
--   can pin the SQL gate against the route. And all three are already partly
--   public through this very function: every existing arm LEFT JOINs
--   institutions and returns `i.name` as the institution label, so
--   institution names are not new information here.
--
-- PROGRAMMES ARE DE-DUPLICATED
--   public.programs carries duplicate rows (no unique constraint on
--   program_name; other code in this repo already works around it with
--   DISTINCT ON). Without de-duplication the palette would show the same
--   programme two or three times and push the other groups off the list.
--   DISTINCT ON (lower(program_name), institution_id) keeps one row per
--   distinct programme name per institution — which is what a reader means by
--   "the same programme" — and keeps the OLDEST id, so the link is stable
--   across re-runs rather than flipping between duplicate rows.
--
-- INSTITUTIONS CARRY NO institution_id GUARD, AND CANNOT
--   Every other arm excludes rows whose institution_id IS NULL so that orphan
--   records do not surface platform-wide. An institution has no
--   institution_id: it IS the institution. The guard is therefore absent from
--   that arm by necessity, not by omission, and the test that counts the
--   guards accounts for it explicitly.
-- ============================================================================

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
SECURITY INVOKER
SET search_path = public, pg_temp
SET statement_timeout = '5s'
AS $function$
#variable_conflict use_column
DECLARE
  v_q   text    := btrim(coalesce(p_query, ''));
  -- Clamp: an unbounded limit from the client would turn this into a bulk
  -- export of whatever RLS does allow.
  v_lim integer := least(greatest(coalesce(p_limit_per_entity, 5), 1), 10);
  v_pat text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  -- Escape LIKE metacharacters so "100%" or "a_b" is literal text.
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

  -- ── Team members ──────────────────────────────────────────────────────────
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
      AND (
        coalesce(c.course_code, '') || ' ' || coalesce(c.course_name, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;


  -- ── Departments ───────────────────────────────────────────────────────────
  -- RLS: departments_select_by_role / departments_admin_all /
  -- departments_faculty_own_institution decide which rows come back.
  IF public.user_has_permission('organizations.departments.view') THEN
    RETURN QUERY
    SELECT
      'department'::text,
      d.id,
      coalesce(nullif(btrim(d.display_name), ''), d.department_name)::text,
      nullif(btrim(coalesce(d.department_code, '')), ''),
      i.name::text,
      CASE WHEN coalesce(d.department_code, '') ILIKE v_q || '%'
             OR coalesce(d.department_name, '') ILIKE v_q || '%'
             OR coalesce(d.display_name, '')    ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.departments d
    LEFT JOIN public.institutions i ON i.id = d.institution_id
    WHERE d.institution_id IS NOT NULL
      AND coalesce(d.is_active, true) = true
      AND (
        coalesce(d.department_code, '') || ' ' ||
        coalesce(d.department_name, '') || ' ' ||
        coalesce(d.display_name, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  -- ── Programmes ────────────────────────────────────────────────────────────
  -- De-duplicated: see the header. The inner DISTINCT ON must ORDER BY its own
  -- expressions first (a PostgreSQL requirement), so the palette's real
  -- ordering — best match, then name — is applied by the outer query.
  -- created_at NULLS LAST then id makes the surviving row deterministic.
  IF public.user_has_permission('organizations.programs.view') THEN
    RETURN QUERY
    SELECT p.entity, p.record_id, p.title, p.subtitle, p.institution_name, p.match_rank
    FROM (
      SELECT DISTINCT ON (lower(pr.program_name), pr.institution_id)
        'program'::text AS entity,
        pr.id           AS record_id,
        coalesce(nullif(btrim(pr.display_name), ''), pr.program_name)::text AS title,
        nullif(btrim(coalesce(pr.program_id, '')), '')                      AS subtitle,
        i.name::text                                                        AS institution_name,
        CASE WHEN coalesce(pr.program_id, '')    ILIKE v_q || '%'
               OR coalesce(pr.program_name, '')  ILIKE v_q || '%'
               OR coalesce(pr.display_name, '')  ILIKE v_q || '%'
             THEN 0 ELSE 1 END                                              AS match_rank
      FROM public.programs pr
      LEFT JOIN public.institutions i ON i.id = pr.institution_id
      WHERE pr.institution_id IS NOT NULL
        AND coalesce(pr.is_active, true) = true
        AND (
          coalesce(pr.program_id, '')   || ' ' ||
          coalesce(pr.program_name, '') || ' ' ||
          coalesce(pr.display_name, '')
        ) ILIKE v_pat
      ORDER BY lower(pr.program_name), pr.institution_id,
               pr.created_at ASC NULLS LAST, pr.id ASC
    ) p
    ORDER BY p.match_rank ASC, p.title ASC
    LIMIT v_lim;
  END IF;

  -- ── Institutions ──────────────────────────────────────────────────────────
  -- No institution_id guard is possible here — see the header. The institution
  -- label for an institution is its own name, which is why this arm needs no
  -- join at all.
  IF public.user_has_permission('organizations.institutions.view') THEN
    RETURN QUERY
    SELECT
      'institution'::text,
      i.id,
      i.name::text,
      nullif(btrim(coalesce(i.counselling_code, i.category, '')), ''),
      i.name::text,
      CASE WHEN coalesce(i.name, '')             ILIKE v_q || '%'
             OR coalesce(i.counselling_code, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.institutions i
    WHERE coalesce(i.is_active, true) = true
      AND (
        coalesce(i.name, '')              || ' ' ||
        coalesce(i.counselling_code, '')  || ' ' ||
        coalesce(i.category, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.fn_global_record_search(text, integer) IS
  'Command-palette record search across learners, team members, admission leads, courses, departments, programmes and institutions. SECURITY INVOKER: each table''s own RLS is the authority, so a row the caller cannot SELECT cannot be returned. user_has_permission() is only a short-circuit and a group label, never the boundary. Billing records are deliberately excluded — see 20261201140000. Returns entity+id; the frontend owns routing.';

-- Restated verbatim from 20261201100000. CREATE OR REPLACE does NOT reset a
-- function's ACL, so these are strictly belt-and-braces for the existing
-- grants — but Supabase's ALTER DEFAULT PRIVILEGES hands anon its own EXECUTE
-- on new functions, and an explicit revoke is the only thing that makes the
-- intended ACL readable in this file rather than inferred from another.
REVOKE EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) TO authenticated;
