-- =====================================================================
-- CDC Sprint 4 — Internship certificate-issued trigger + status guards
-- =====================================================================
-- Date: 2026-05-18
-- Branch: feat/cdc-sprint-4-internships
-- Prereq: 20260518_cdc_substrate_03_internship_extensions_triggers_storage.sql
--
-- Changes (additive only — existing tables untouched):
--   1. Status transition guard on internship_assignments.status:
--      prevents illegal backwards transitions via a CHECK-friendly trigger.
--   2. AFTER UPDATE trigger on internship_assignments: when status flips
--      to 'completed', write an in-app notification to the learner via
--      the existing notifications table.
--   3. AFTER INSERT trigger on internship_certificates: when a cert row
--      is created for a corporate_internship assignment, write a second
--      notification ("certificate is ready").
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. VALID STATUS TRANSITIONS GUARD
--    internship_assignments.status is a plain text field with an
--    existing CHECK from the original module. We add a trigger guard
--    that enforces a forward-only state machine for corporate
--    internships to match CDC workflow expectations:
--      pending → active → completed | withdrawn | cancelled
--    Clinical/teaching/pharmacy assignments are unrestricted (existing).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cdc_internship_assignment_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce on corporate internships.
  IF NEW.internship_type <> 'corporate_internship' THEN
    RETURN NEW;
  END IF;

  -- Define the allowed forward transitions.
  CASE OLD.status
    WHEN 'pending' THEN
      IF NEW.status NOT IN ('active', 'withdrawn', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition for corporate internship: % → %', OLD.status, NEW.status;
      END IF;
    WHEN 'active' THEN
      IF NEW.status NOT IN ('completed', 'withdrawn', 'cancelled') THEN
        RAISE EXCEPTION 'Invalid status transition for corporate internship: % → %', OLD.status, NEW.status;
      END IF;
    WHEN 'completed' THEN
      -- completed is terminal; only allow if no change.
      IF NEW.status <> 'completed' THEN
        RAISE EXCEPTION 'Cannot move corporate internship out of completed status';
      END IF;
    WHEN 'withdrawn' THEN
      IF NEW.status <> 'withdrawn' THEN
        RAISE EXCEPTION 'Cannot move corporate internship out of withdrawn status';
      END IF;
    WHEN 'cancelled' THEN
      IF NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Cannot move corporate internship out of cancelled status';
      END IF;
    ELSE
      -- Unknown current state — let it through (safety valve for future states).
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_internship_assignment_status_guard ON public.internship_assignments;
CREATE TRIGGER trg_cdc_internship_assignment_status_guard
  BEFORE UPDATE OF status ON public.internship_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_internship_assignment_status_guard();


-- ---------------------------------------------------------------------
-- 2. COMPLETION NOTIFICATION TRIGGER
--    When a corporate internship assignment transitions to 'completed',
--    insert an in-app notification targeting the learner's auth user.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cdc_internship_completed_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner_user_id uuid;
  v_site_name       text;
BEGIN
  -- Only fire on corporate internship completion.
  IF NEW.internship_type <> 'corporate_internship' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Resolve the learner's auth user id via learners_profiles.
  SELECT lp.user_id INTO v_learner_user_id
  FROM public.learners_profiles lp
  WHERE lp.id = NEW.learner_id
  LIMIT 1;

  IF v_learner_user_id IS NULL THEN
    RETURN NEW; -- no auth user found; skip notification silently.
  END IF;

  -- Resolve site name for the notification body.
  SELECT s.site_name INTO v_site_name
  FROM public.internship_external_sites s
  WHERE s.id = NEW.site_id
  LIMIT 1;

  v_site_name := COALESCE(v_site_name, 'your internship site');

  -- Write notification row.
  INSERT INTO public.notifications (
    title,
    body,
    url,
    created_by,
    targeting,
    priority,
    category,
    metadata,
    idempotency_key
  ) VALUES (
    'Internship Completed',
    'Your corporate internship at ' || v_site_name || ' has been marked as completed. You can now download your certificate once it is issued.',
    '/cdc/internships/' || NEW.id::text,
    NEW.updated_by,
    jsonb_build_object('user_ids', jsonb_build_array(v_learner_user_id)),
    'normal',
    'cdc_internship',
    jsonb_build_object(
      'assignment_id', NEW.id,
      'internship_type', 'corporate_internship',
      'event', 'completed'
    ),
    'cdc_intern_completed_' || NEW.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_internship_completed_notify ON public.internship_assignments;
CREATE TRIGGER trg_cdc_internship_completed_notify
  AFTER UPDATE OF status ON public.internship_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_internship_completed_notify();


-- ---------------------------------------------------------------------
-- 3. CERTIFICATE ISSUED NOTIFICATION TRIGGER
--    When a certificate row is created for a corporate internship, send
--    a second notification ("your certificate is ready to download").
--    Relies on internship_assignments.internship_type to scope.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_cdc_internship_cert_issued_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment      RECORD;
  v_learner_user_id uuid;
BEGIN
  -- Fetch the parent assignment.
  SELECT a.*, s.site_name
  INTO v_assignment
  FROM public.internship_assignments a
  LEFT JOIN public.internship_external_sites s ON s.id = a.site_id
  WHERE a.id = NEW.assignment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Only fire for corporate internship.
  IF v_assignment.internship_type <> 'corporate_internship' THEN
    RETURN NEW;
  END IF;

  -- Resolve learner auth user.
  SELECT lp.user_id INTO v_learner_user_id
  FROM public.learners_profiles lp
  WHERE lp.id = v_assignment.learner_id
  LIMIT 1;

  IF v_learner_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    title,
    body,
    url,
    created_by,
    targeting,
    priority,
    category,
    metadata,
    idempotency_key
  ) VALUES (
    'Internship Certificate Issued',
    'Your internship certificate for ' || COALESCE(v_assignment.site_name, 'your placement') || ' is now available. Certificate number: ' || NEW.certificate_number || '.',
    '/cdc/internships/' || v_assignment.id::text,
    NEW.created_by,
    jsonb_build_object('user_ids', jsonb_build_array(v_learner_user_id)),
    'high',
    'cdc_internship',
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'certificate_id', NEW.id,
      'internship_type', 'corporate_internship',
      'event', 'certificate_issued'
    ),
    'cdc_cert_issued_' || NEW.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cdc_internship_cert_issued_notify ON public.internship_certificates;
CREATE TRIGGER trg_cdc_internship_cert_issued_notify
  AFTER INSERT ON public.internship_certificates
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cdc_internship_cert_issued_notify();


-- ---------------------------------------------------------------------
-- 4. INDEX: certificate lookup by assignment_id (used by detail page)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_internship_certificates_assignment_id
  ON public.internship_certificates (assignment_id);

COMMIT;
