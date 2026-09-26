-- ============================================================================
-- Record search: mark a turned-down candidate and a cancelled receipt
-- Created: 2026-09-16
--
-- Two Director rulings from the 2026-09-16 edge-case interview. Both are about
-- the same failure: a search result that is technically true and still reads as
-- the opposite of the truth.
--
-- 1. A CANDIDATE CARRIES ITS STAGE.
--    A turned-down applicant must stay findable — a recruiter's real question is
--    often "haven't we seen this person before" — but must never read as someone
--    still in the running. The subtitle now leads with the stage:
--        "Rejected · Assistant Professor"
--
--    The stage is printed VERBATIM rather than matched against a hand-picked
--    list of "bad" statuses. This table carries at least 16 values (rejected,
--    withdrawn, no_show, shortlisted, promoted, package_fixed, offer_issued,
--    joined …). A curated list would silently mislabel the next one somebody
--    adds, and that failure is precisely the one the ruling forbids: a rejected
--    candidate reading as live.
--
-- 2. A RECEIPT IS MARKED WHEN ITS CANCELLATION WAS APPROVED.
--    Staff must still find a cancelled receipt — a disputed payment is exactly
--    when they need it — but it must never read as money received:
--        "Cancelled · Ramesh"
--
--    Only status = 'approved' counts. A cancellation merely REQUESTED, or one
--    declined, leaves a live receipt unmarked. billing_receipts has no cancel
--    column of its own; the decision lives in billing_receipt_cancel_requests.
--
--    Reading that table here is NOT the learners_profiles case that
--    20261201150000's header rejects. That one would have made a row DISAPPEAR
--    when a second table's rules hid it. This only computes a LABEL, and its
--    gate is not narrower than the row's own: billing_receipt_cancel_requests_
--    select is gated on the SAME user_has_permission('billing.receipts.view')
--    AND role_has_institution_access(institution_id) as this arm (plus
--    super-admin and own-request branches). Anyone who can reach a receipt
--    through this search can read its cancellation, so the mark cannot silently
--    fail for the people who use it.
--
-- WHY A NEW FILE RATHER THAN AN EDIT.
--    These two changes were first written into 20261201150000 while its PR
--    (#3828) was believed open. It had already merged. A merged migration is
--    left exactly as merged: editing one changes the repo and not the database,
--    and it makes "which SQL actually ran" depend on when a checkout was taken.
--    So the function is replaced again here.
--
-- Everything else is unchanged from 20261201150000: SECURITY INVOKER, ten
-- permission gates, no institution predicate competing with RLS.
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
      -- The STAGE always rides in the subtitle ("Rejected · Assistant
      -- Professor"). Director ruling 2026-09-16: a turned-down applicant must
      -- still be findable but must never read as someone still in the running.
      -- Printing the stage verbatim, rather than flagging a hand-picked list of
      -- "bad" statuses, is what makes that safe: this table carries at least 16
      -- status values and a curated list would silently mislabel the next one
      -- somebody adds.
      nullif(btrim(concat_ws(' · ',
        nullif(initcap(replace(coalesce(hc.status, ''), '_', ' ')), ''),
        nullif(btrim(coalesce(hc.role_title, hc.email, '')), '')
      )), ''),
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
      -- A cancelled receipt is marked "Cancelled · Ramesh". Director ruling
      -- 2026-09-16: staff must still be able to find a cancelled receipt (a
      -- disputed payment is exactly when they need it), but it must never read
      -- as money received.
      --
      -- Only status = 'approved' counts. A receipt with a cancellation merely
      -- REQUESTED, or one declined, is still a live receipt and is not marked.
      --
      -- Safe to read here: billing_receipt_cancel_requests_select is gated on
      -- the SAME permission as this arm — user_has_permission
      -- ('billing.receipts.view') AND role_has_institution_access(institution_id)
      -- (plus super-admin and own-request branches). So anyone who can reach a
      -- receipt through this search can read its cancellation, and the mark
      -- cannot silently fail for them. This is NOT the learners_profiles case
      -- the header rejects: that one would have made a row DISAPPEAR, this only
      -- computes a label, and its gate is not narrower than the row's own.
      nullif(btrim(concat_ws(' · ',
        CASE WHEN EXISTS (
          SELECT 1 FROM public.billing_receipt_cancel_requests cr
           WHERE cr.receipt_id = br.id
             AND cr.status = 'approved'
        ) THEN 'Cancelled' END,
        nullif(btrim(coalesce(br.payer_name, br.remitter_name, '')), '')
      )), ''),
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
