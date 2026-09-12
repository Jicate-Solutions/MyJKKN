-- ============================================================================
-- fn_global_record_search: SECURITY DEFINER -> SECURITY INVOKER
-- Created: 2026-09-12  (fixes a confidentiality defect in 20261201090000)
--
-- WHAT WENT WRONG
--   The original function was SECURITY DEFINER, so it BYPASSED RLS and
--   substituted its own check:
--       user_has_permission('<key>') AND role_has_institution_access(inst_id)
--   That is not an ADDITIONAL gate — it REPLACES each table's policy. And the
--   real policies are much richer. admission_leads.adm_leads_select also
--   requires _user_in_admission_lead_allowlist(), excludes
--   _user_is_strict_counselor() from its broad branch, and resolves
--   institutions via _user_accessible_institutions() rather than
--   role_has_institution_access().
--
--   Measured on production as test.faculty@jkkn.ac.in (role staff_counselor),
--   rows readable under RLS vs rows the function returned:
--       admission_leads      0  vs 10      <-- disclosed names + PHONE NUMBERS
--       staff                1  vs 10      <-- disclosed names + staff ids
--       learners_profiles 2000  vs 10          (ok)
--       courses              0  vs  0          (ok)
--   Mitigated the same day by REVOKE EXECUTE ... FROM authenticated.
--
-- THE FIX
--   SECURITY INVOKER. Every SELECT below now runs as the CALLER, so each
--   table's own RLS decides what comes back. A row the caller cannot SELECT
--   cannot be returned — the leak becomes impossible by construction rather
--   than by this function correctly re-implementing five policies forever.
--
--   role_has_institution_access() is REMOVED from the predicates. It was a
--   second, simpler institution rule competing with the one RLS applies;
--   keeping it would both duplicate the policy (the original bug) and risk
--   hiding rows the platform legitimately permits. RLS is the single
--   authority now.
--
--   user_has_permission() is KEPT, but only as a cheap short-circuit so a
--   caller with no permission does not scan four tables — and so each group
--   maps to the permission that guards its detail route. IT IS NOT THE
--   SECURITY BOUNDARY. RLS is. Never re-add a predicate here on the theory
--   that it "tightens" things; that theory is what produced the defect.
--
--   institution_id IS NOT NULL is KEPT. Some table policies permit NULL
--   institutions, and 3 learners_profiles rows have one; search should not
--   surface orphan rows platform-wide. Fail closed.
--
-- HOW TO VERIFY (the test that would have caught the original defect):
--   for each branch, as a REAL user over PostgREST, compare
--     GET /rest/v1/<table>?select=id&limit=2000     (what RLS allows)
--   against the rows this RPC returns. Any surplus is a leak. Compare row
--   counts, not sample queries — sampling only proves the samples.
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

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.fn_global_record_search(text, integer) IS
  'Command-palette record search across learners, team members, admission leads and courses. SECURITY INVOKER: each table''s own RLS is the authority, so a row the caller cannot SELECT cannot be returned. user_has_permission() is only a short-circuit and a group label, never the boundary. Returns entity+id; the frontend owns routing.';

-- anon must stay locked: Supabase grants EXECUTE to anon by default on every
-- new function, and CREATE OR REPLACE does not reset that.
REVOKE EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) TO authenticated;
