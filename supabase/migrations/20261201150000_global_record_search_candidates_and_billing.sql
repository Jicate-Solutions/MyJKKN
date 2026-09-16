-- ============================================================================
-- Record search reaches recruitment candidates, invoices and receipts
-- Created: 2026-09-16
--
-- WHAT THIS ADDS
--   Three more kinds to fn_global_record_search, taking the Cmd+K palette from
--   seven to ten: recruitment candidates, billing invoices, billing receipts.
--   Nothing else about the function changes.
--
-- BILLING WAS WRONGLY EXCLUDED, AND THIS CORRECTS THE RECORD
--   20261201140000's header states that billing_invoices and billing_receipts
--   "carry ZERO named CREATE POLICY statements anywhere in supabase/migrations".
--   THAT IS FALSE. It was produced by a grep that only matched
--   `CREATE POLICY <bare_name> ON <table>` and therefore missed every policy on
--   these two tables, because theirs are named as quoted strings containing
--   spaces ("Accounts users can view institution billing invoices") and several
--   arrive as ALTER POLICY from a later initplan sweep.
--
--   Counted properly, billing_invoices carries 18 policy statements and
--   billing_receipts 28, and they are layered exactly as this platform's
--   billing ought to be: a learner sees their own invoice (student_id resolved
--   through learners_profiles), accounts staff see their institution's,
--   is_admin() sees all. The stated reason for dropping billing did not hold,
--   so billing is added here. The mistake is recorded rather than quietly
--   fixed, because the false claim is in a merged migration header and in a
--   merged pull request.
--
--   The underlying rule is unchanged and was right: this function is SECURITY
--   INVOKER, so RLS is the ONLY boundary, and no table joins this search
--   without its row rules being READ FIRST. What failed was the reading.
--
-- THE THREE RULES THIS FILE MUST NOT BREAK
--   Restated from 20261201100000, whose header explains what each one cost.
--   1. SECURITY INVOKER, NEVER DEFINER. DEFINER does not ADD a check, it
--      REPLACES each table's RLS policy.
--   2. NO role_has_institution_access() (or any institution predicate) in a
--      query body. RLS is the single authority.
--   3. user_has_permission() is a SHORT-CIRCUIT and a group label, never the
--      boundary.
--
-- THE ROW RULES BEHIND EACH NEW ARM, read before adding it
--   hr_recruitment_candidates — hr_recruitment_candidates_select_permission:
--     is_super_admin() OR is_admin()
--     OR (user_has_permission('hr.recruitment.view')
--         AND role_has_institution_access(institution_id))
--     OR submitted_by = auth.uid()
--   That is this platform's canonical shape plus an own-submission clause, so
--   a recruiter sees the candidates they raised even outside their colleges.
--   Search inherits that exactly; it discloses no name a caller cannot already
--   open on the candidate's own page.
--
--   billing_invoices / billing_receipts — layered as described above.
--
-- WHAT THE BILLING ARMS DELIBERATELY DO NOT SEARCH
--   Neither arm joins learners_profiles to search by the learner's name, even
--   though student_id is right there. Two reasons. It would make each billing
--   row's visibility depend on a SECOND table's RLS, so an invoice the caller
--   may read would vanish whenever the learner behind it is one they may not —
--   a confusing hole rather than a safe one. And the actual desk task is
--   "find receipt 4417" or "who paid, Ramesh", which the receipt's own
--   payer_name and remitter_name already answer.
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


  -- ── Recruitment candidates ────────────────────────────────────────────────
  -- RLS: hr_recruitment_candidates_select_permission decides the rows, including
  -- its own-submission clause. Nothing is re-implemented here.
  IF public.user_has_permission('hr.recruitment.view') THEN
    RETURN QUERY
    SELECT
      'candidate'::text,
      hc.id,
      hc.name::text,
      nullif(btrim(coalesce(hc.role_title, hc.email, '')), ''),
      i.name::text,
      CASE WHEN coalesce(hc.name, '')       ILIKE v_q || '%'
             OR coalesce(hc.phone, '')      ILIKE v_q || '%'
             OR coalesce(hc.role_title, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.hr_recruitment_candidates hc
    LEFT JOIN public.institutions i ON i.id = hc.institution_id
    WHERE hc.institution_id IS NOT NULL
      AND (
        coalesce(hc.name, '')       || ' ' ||
        coalesce(hc.email, '')      || ' ' ||
        coalesce(hc.phone, '')      || ' ' ||
        coalesce(hc.role_title, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  -- ── Invoices ──────────────────────────────────────────────────────────────
  -- No join to learners_profiles — see the header.
  IF public.user_has_permission('billing.invoices.view') THEN
    RETURN QUERY
    SELECT
      'invoice'::text,
      bi.id,
      coalesce(nullif(btrim(bi.invoice_number), ''), 'Invoice')::text,
      nullif(btrim(coalesce(bi.invoice_description, bi.invoice_type, '')), ''),
      i.name::text,
      CASE WHEN coalesce(bi.invoice_number, '') ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.billing_invoices bi
    LEFT JOIN public.institutions i ON i.id = bi.institution_id
    WHERE bi.institution_id IS NOT NULL
      AND (
        coalesce(bi.invoice_number, '')      || ' ' ||
        coalesce(bi.invoice_description, '') || ' ' ||
        coalesce(bi.invoice_type, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  -- ── Receipts ──────────────────────────────────────────────────────────────
  -- payer_name / remitter_name are the desk's real lookup ("who paid"), and
  -- they live on the receipt itself, so no second table's RLS is involved.
  IF public.user_has_permission('billing.receipts.view') THEN
    RETURN QUERY
    SELECT
      'receipt'::text,
      br.id,
      coalesce(nullif(btrim(br.receipt_number), ''), 'Receipt')::text,
      nullif(btrim(coalesce(br.payer_name, br.remitter_name, '')), ''),
      i.name::text,
      CASE WHEN coalesce(br.receipt_number, '') ILIKE v_q || '%'
             OR coalesce(br.payer_name, '')     ILIKE v_q || '%'
             OR coalesce(br.remitter_name, '')  ILIKE v_q || '%'
           THEN 0 ELSE 1 END
    FROM public.billing_receipts br
    LEFT JOIN public.institutions i ON i.id = br.institution_id
    WHERE br.institution_id IS NOT NULL
      AND (
        coalesce(br.receipt_number, '')            || ' ' ||
        coalesce(br.payer_name, '')                || ' ' ||
        coalesce(br.remitter_name, '')             || ' ' ||
        coalesce(br.payment_reference_number, '')
      ) ILIKE v_pat
    ORDER BY 6 ASC, 3 ASC
    LIMIT v_lim;
  END IF;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION public.fn_global_record_search(text, integer) IS
  'Command-palette record search across learners, team members, admission leads, courses, departments, programmes, institutions, recruitment candidates, invoices and receipts. SECURITY INVOKER: each table''s own RLS is the authority, so a row the caller cannot SELECT cannot be returned. user_has_permission() is only a short-circuit and a group label, never the boundary. Returns entity+id; the frontend owns routing.';

-- Restated from 20261201100000. CREATE OR REPLACE does NOT reset a function's
-- ACL, so these are belt-and-braces for the existing grants — but Supabase's
-- ALTER DEFAULT PRIVILEGES hands anon its own EXECUTE on new functions, and an
-- explicit revoke keeps the intended ACL readable in this file.
REVOKE EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_global_record_search(text, integer) TO authenticated;
