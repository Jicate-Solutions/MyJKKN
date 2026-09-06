-- Course Events — super-admin-only cascade delete.
--
-- WHY THIS EXISTS
-- ---------------
-- Deleting a course used to fail with:
--   update or delete on table "course_events" violates foreign key constraint
--   "course_enrollments_course_event_id_fkey" on table "course_enrollments"
--
-- The FK graph off course_events splits in two. The CONTENT half already
-- cascades and needs nothing here:
--   course_packages           -> CASCADE (-> course_package_installments CASCADE)
--   course_registration_forms -> CASCADE (-> sections/fields CASCADE)
--   course_sessions           -> CASCADE
--   course_applications       -> CASCADE
--   course_events.previous_course_event_id  -> SET NULL
--   resource_reservations.course_session_id -> SET NULL  (venue hold released,
--       the reservation row and the meetings/tournament subtree behind it SURVIVE
--       — deliberate, do not "fix" this to CASCADE)
--
-- The MONEY half is ON DELETE RESTRICT, on purpose, and is what blocks the delete:
--   course_enrollments.course_event_id  -> RESTRICT
--   course_bills.course_event_id        -> RESTRICT
--   course_bills.enrollment_id          -> RESTRICT
--   course_bill_payments.bill_id        -> RESTRICT
--   course_bill_payments.enrollment_id  -> RESTRICT
--   course_enrollments.package_id       -> RESTRICT   <-- the non-obvious one:
--       course_packages CASCADEs from course_events, but THAT cascade is itself
--       blocked by an enrollment pointing at the package. Flipping only the
--       *_course_event_id FKs to CASCADE would still fail here.
--
-- We deliberately do NOT flip those six to ON DELETE CASCADE. Doing so would make
-- every future delete path — including any accidental one — silently destroy
-- payment receipts. Instead RESTRICT stays as the backstop and the destruction is
-- funnelled through one SECURITY DEFINER RPC that deletes children in dependency
-- order, so RESTRICT is satisfied rather than bypassed.
--
-- ACCESS: super admin only, at BOTH layers (RLS policy below + the explicit guard
-- inside each function). SECURITY DEFINER bypasses RLS, so the in-function guard
-- is the real gate — it is not redundant with the policy.

-- ---------------------------------------------------------------------------
-- 1. Blast-radius preview. Read this before offering the confirm.
-- ---------------------------------------------------------------------------
-- Counted inside a SECURITY DEFINER function rather than by the client: the child
-- tables are RLS-gated, so a client-side count returns 0 for anyone who cannot see
-- the bills and would report "nothing will be lost" on the exact rows this check
-- exists to protect.
CREATE OR REPLACE FUNCTION public.fn_course_delete_blockers(p_course_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_title text;
  v_out   jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may delete a course'
      USING ERRCODE = '42501';
  END IF;

  SELECT title INTO v_title FROM public.course_events WHERE id = p_course_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT jsonb_build_object(
    'course_title', v_title,
    'applications', (SELECT count(*) FROM public.course_applications
                      WHERE course_event_id = p_course_event_id),
    'enrollments',  (SELECT count(*) FROM public.course_enrollments
                      WHERE course_event_id = p_course_event_id),
    'packages',     (SELECT count(*) FROM public.course_packages
                      WHERE course_event_id = p_course_event_id),
    'forms',        (SELECT count(*) FROM public.course_registration_forms
                      WHERE course_event_id = p_course_event_id),
    'sessions',     (SELECT count(*) FROM public.course_sessions
                      WHERE course_event_id = p_course_event_id),
    'venue_holds',  (SELECT count(*) FROM public.resource_reservations r
                      WHERE r.course_session_id IN (
                        SELECT id FROM public.course_sessions
                         WHERE course_event_id = p_course_event_id)),
    'bills',        (SELECT count(*) FROM public.course_bills
                      WHERE course_event_id = p_course_event_id),
    'payments',     (SELECT count(*) FROM public.course_bill_payments p
                      WHERE p.bill_id IN (SELECT id FROM public.course_bills
                                           WHERE course_event_id = p_course_event_id)),
    -- Only 'success' rows represent money actually received; 'initiated' rows are
    -- abandoned Razorpay attempts and carry no financial weight.
    'successful_payments', (SELECT count(*) FROM public.course_bill_payments p
                             WHERE p.status = 'success'
                               AND p.bill_id IN (SELECT id FROM public.course_bills
                                                  WHERE course_event_id = p_course_event_id)),
    'amount_received', (SELECT COALESCE(sum(p.amount_paid), 0)
                          FROM public.course_bill_payments p
                         WHERE p.status = 'success'
                           AND p.bill_id IN (SELECT id FROM public.course_bills
                                              WHERE course_event_id = p_course_event_id))
  ) INTO v_out;

  RETURN v_out;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. The cascade itself.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_course_delete_cascade(p_course_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_title       text;
  v_payments    bigint := 0;
  v_bills       bigint := 0;
  v_enrollments bigint := 0;
  v_apps        bigint := 0;
  v_packages    bigint := 0;
  v_forms       bigint := 0;
  v_sessions    bigint := 0;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a super admin may delete a course'
      USING ERRCODE = '42501';
  END IF;

  SELECT title INTO v_title FROM public.course_events WHERE id = p_course_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course not found' USING ERRCODE = 'P0002';
  END IF;

  -- Counted before the deletes so the caller gets a truthful receipt of what went.
  SELECT count(*) INTO v_apps     FROM public.course_applications
   WHERE course_event_id = p_course_event_id;
  SELECT count(*) INTO v_packages FROM public.course_packages
   WHERE course_event_id = p_course_event_id;
  SELECT count(*) INTO v_forms    FROM public.course_registration_forms
   WHERE course_event_id = p_course_event_id;
  SELECT count(*) INTO v_sessions FROM public.course_sessions
   WHERE course_event_id = p_course_event_id;

  -- Order matters; each step clears a RESTRICT that would block the next.
  --
  -- (a) Payments first. Matched on bill_id OR enrollment_id because both columns
  --     carry a RESTRICT of their own — a payment reachable by only one of the two
  --     would survive (a) and then block (b) or (c).
  --     trg_course_bill_payments_recompute fires per row here and rewrites the
  --     parent bill/enrollment totals. That is wasted work on rows about to be
  --     deleted, but it is harmless: fn_course_recompute_balances already returns
  --     early on "bill removed in this transaction".
  WITH del AS (
    DELETE FROM public.course_bill_payments p
     WHERE p.bill_id IN (SELECT id FROM public.course_bills
                          WHERE course_event_id = p_course_event_id)
        OR p.enrollment_id IN (SELECT id FROM public.course_enrollments
                                WHERE course_event_id = p_course_event_id)
    RETURNING 1
  ) SELECT count(*) INTO v_payments FROM del;

  -- (b) Bills. Same two-predicate reasoning as (a).
  WITH del AS (
    DELETE FROM public.course_bills b
     WHERE b.course_event_id = p_course_event_id
        OR b.enrollment_id IN (SELECT id FROM public.course_enrollments
                                WHERE course_event_id = p_course_event_id)
    RETURNING 1
  ) SELECT count(*) INTO v_bills FROM del;

  -- (c) Enrollments. Clears BOTH the course_event_id RESTRICT and the
  --     package_id RESTRICT that would otherwise block course_packages' CASCADE.
  WITH del AS (
    DELETE FROM public.course_enrollments
     WHERE course_event_id = p_course_event_id
    RETURNING 1
  ) SELECT count(*) INTO v_enrollments FROM del;

  -- (d) The course. Everything still hanging off it is CASCADE or SET NULL now:
  --     applications, packages (+installments), forms (+sections/fields), sessions
  --     go; resource_reservations.course_session_id and any successor course's
  --     previous_course_event_id are nulled.
  DELETE FROM public.course_events WHERE id = p_course_event_id;

  RETURN jsonb_build_object(
    'course_title', v_title,
    'deleted', jsonb_build_object(
      'payments',     v_payments,
      'bills',        v_bills,
      'enrollments',  v_enrollments,
      'applications', v_apps,
      'packages',     v_packages,
      'forms',        v_forms,
      'sessions',     v_sessions
    )
  );
END;
$fn$;

-- CREATE OR REPLACE resets EXECUTE to PUBLIC, so re-state the grants explicitly
-- every time rather than assuming the previous ones carried over.
REVOKE ALL ON FUNCTION public.fn_course_delete_blockers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_course_delete_cascade(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_course_delete_blockers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_course_delete_cascade(uuid)  TO authenticated;

COMMENT ON FUNCTION public.fn_course_delete_blockers(uuid) IS
  'Super-admin only. Counts everything a course delete would destroy, including money received. Read before confirming.';
COMMENT ON FUNCTION public.fn_course_delete_cascade(uuid) IS
  'Super-admin only. Deletes a course and its entire subtree in dependency order (payments -> bills -> enrollments -> course). Returns a receipt of what was removed.';

-- ---------------------------------------------------------------------------
-- 3. Direct DELETE on course_events becomes super-admin only.
-- ---------------------------------------------------------------------------
-- courses.delete is intentionally KEPT in the catalog (see lib/constants/permissions.ts)
-- so the permissions-audit gate stays green and deletion can be re-delegated later
-- by loosening this one policy. It no longer grants deletion on its own.
DROP POLICY IF EXISTS course_events_delete ON public.course_events;
CREATE POLICY course_events_delete ON public.course_events
  FOR DELETE
  USING ((SELECT public.is_super_admin()));
