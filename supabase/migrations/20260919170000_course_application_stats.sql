-- Statistics for the course Applications tab.
--
-- The tab was a list and nothing else: to answer "how many applied, how many did
-- we approve, how much money has actually landed" an admin had to export the
-- sheet and pivot it. It already computed per-status counts and spent them only
-- on the filter dropdown's labels.
--
-- ONE RPC RATHER THAN COUNTING IN THE CLIENT. The existing countsByCourse pulls
-- every application row and counts them in JavaScript. Doing that for bills and
-- payments too — which grow per instalment per participant, and which
-- self-service registration can now add without an admin — would be three more
-- full scans per tab open. This is one SELECT with FILTER clauses. Same shape as
-- fn_jkkn_stats, the existing stats-card precedent.
--
-- THE GATE IS THE LOAD-BEARING PART. SECURITY DEFINER bypasses RLS, so this
-- function has to re-impose the scope its callers live under. Without the
-- institution check a Course Coordinator could read another institution's
-- revenue simply by passing that course's id — the RPC takes a course id from
-- the client and nothing else. The predicate below mirrors
-- course_applications_select exactly.
--
-- SEATS. seats_taken counts the SAME enrolment statuses the self-service seat
-- check uses in app/api/public/courses/[slug]/apply/route.ts. If the two ever
-- disagree the card will report room on a course that registration is refusing,
-- or the reverse.

CREATE OR REPLACE FUNCTION public.fn_course_application_stats(p_course_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst    uuid;
  v_seats   int;
  v_apps    jsonb;
  v_fees    jsonb;
  v_health  jsonb;
  v_taken   int;
BEGIN
  SELECT institution_id, total_seats INTO v_inst, v_seats
    FROM public.course_events WHERE id = p_course_event_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'No course %', p_course_event_id USING ERRCODE = '23503';
  END IF;

  IF NOT (
    coalesce(public.is_super_admin(), false)
    OR public.is_admin()
    OR (
      public.user_has_permission('courses.applications.view')
      AND public.role_has_institution_access(v_inst)
    )
  ) THEN
    RAISE EXCEPTION 'Not authorised to view course application statistics'
      USING ERRCODE = '42501';
  END IF;

  -- Applications by status and by origin. Every status is present with 0 rather
  -- than absent, mirroring CourseApplicationCounts, so the UI never has to tell
  -- "none" apart from "not loaded".
  SELECT jsonb_build_object(
           'total',       count(*),
           'pending',     count(*) FILTER (WHERE status = 'pending'),
           'shortlisted', count(*) FILTER (WHERE status = 'shortlisted'),
           'approved',    count(*) FILTER (WHERE status = 'approved'),
           'rejected',    count(*) FILTER (WHERE status = 'rejected'),
           'withdrawn',   count(*) FILTER (WHERE status = 'withdrawn'),
           'internal',    count(*) FILTER (WHERE applicant_origin = 'internal'),
           'external',    count(*) FILTER (WHERE applicant_origin = 'external')
         )
    INTO v_apps
    FROM public.course_applications
   WHERE course_event_id = p_course_event_id;

  -- Money from course_enrollments, which fn_course_recompute_balances keeps
  -- current — summing the bills instead would drift the moment a payment landed.
  SELECT jsonb_build_object(
           'enrollments', count(*),
           'payable',     coalesce(sum(total_payable), 0),
           'collected',   coalesce(sum(total_paid), 0),
           'outstanding', coalesce(sum(balance), 0),
           -- Zero-guard: a free course has nothing to collect, and 0/0 would be
           -- a division error rather than the 0% a reader expects.
           'collection_pct', CASE
             WHEN coalesce(sum(total_payable), 0) > 0
               THEN round((coalesce(sum(total_paid), 0) / sum(total_payable)) * 100, 1)
             ELSE 0
           END
         )
    INTO v_fees
    FROM public.course_enrollments
   WHERE course_event_id = p_course_event_id;

  SELECT count(*) INTO v_taken
    FROM public.course_enrollments
   WHERE course_event_id = p_course_event_id
     AND status IN ('active', 'confirmed', 'payment_overdue', 'completed');

  SELECT jsonb_build_object(
           'overdue_bills',  (
             SELECT count(*) FROM public.course_bills b
              WHERE b.course_event_id = p_course_event_id
                AND b.due_date < current_date
                AND b.status NOT IN ('paid', 'voided')
           ),
           'overdue_amount', (
             SELECT coalesce(sum(b.balance_amount), 0) FROM public.course_bills b
              WHERE b.course_event_id = p_course_event_id
                AND b.due_date < current_date
                AND b.status NOT IN ('paid', 'voided')
           ),
           -- A payment row that never reached 'success'. Not proof of a lost
           -- sale — a webhook may simply not have landed yet — so this is a
           -- prompt to look, not a failure count.
           'stalled_payments', (
             SELECT count(*) FROM public.course_bill_payments p
               JOIN public.course_bills b ON b.id = p.bill_id
              WHERE b.course_event_id = p_course_event_id AND p.status = 'initiated'
           ),
           'stalled_amount', (
             SELECT coalesce(sum(p.amount_paid), 0) FROM public.course_bill_payments p
               JOIN public.course_bills b ON b.id = p.bill_id
              WHERE b.course_event_id = p_course_event_id AND p.status = 'initiated'
           )
         )
    INTO v_health;

  RETURN jsonb_build_object(
    'ok', true,
    'applications', v_apps,
    'fees', v_fees,
    'health', v_health,
    'seats', jsonb_build_object('total', v_seats, 'taken', v_taken)
  );
END;
$function$;

COMMENT ON FUNCTION public.fn_course_application_stats(uuid) IS
  'Aggregates for the course Applications tab statistics card: applications by status and origin, fees payable/collected/outstanding, overdue bills, stalled (initiated) payments, and seat fill. SECURITY DEFINER, so it re-imposes course_applications_select''s own predicate — courses.applications.view AND role_has_institution_access — because it takes a course id from the client.';

REVOKE ALL ON FUNCTION public.fn_course_application_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_course_application_stats(uuid) TO authenticated;
