-- ============================================================================
-- 2026-09-15 — Gate Pass as a Service Request category + Gate Security IN/OUT
--
-- ⚠️ NOT APPLIED — FILE ONLY. Apply out-of-band (Supabase SQL editor or the
--    Management API); `supabase db push` does not work in this repo. Safe to
--    rehearse inside BEGIN ... ROLLBACK: nothing here casts a new enum label.
--
-- WHAT THIS BUILDS
-- ----------------
--  1. service_types.issues_gate_pass — the "Gate Pass" category toggle on
--     /service-requests/types/new. A request of such a type, once finally
--     approved, becomes a row in hostel_gate_passes (status 'issued') with a
--     pass number, an opaque QR token and the approver recorded.
--  2. hostel_gate_passes gains the bridge (service_request_id), the calendar
--     day the pass is valid for (valid_date), the requested exit time and the
--     optional alternate mobile. The table already holds reason/approved_at/
--     rejected_* from 20260907020000.
--  3. gate_movements — one row per OUT / IN recorded at the gate, for learners
--     (against a pass) and staff (against their personal QR). recorded_at is
--     server time and immutable; only a staff reason may change, and every
--     change is audited.
--  4. gate_audit_events — append-only trail of every gate action.
--  5. SECURITY DEFINER RPCs, each doing its own authorisation:
--       issue_gate_pass_for_service_request(p_request_id)
--       gate_record_movement(...)          — the OUT / IN tap
--       gate_update_movement_reason(...)   — staff reason, audited
--       gate_search_people(p_query, p_limit)
--       gate_person_snapshot(p_profile_id)
--       gate_today_activity()
--       gate_in_out_report(...)            — CAO report rows
--  6. Permission keys (registered in lib/constants/permissions.ts):
--       gate_security.scan.view      — /gate-security page + scan/search RPCs
--       gate_security.movements.record — the OUT/IN write
--       gate_security.reports.view   — /reports/gate-in-out
--       gate_security.reports.export — Excel export
--     Granted here to gate_security (scan+record), warden/chief_warden
--     (scan+record) and cao (reports). super_admin bypasses everywhere.
--
-- QR CONTENT RULE (requirement §15): a learner pass QR carries ONLY
-- hostel_gate_passes.qr_code ('QR-<uuid>'); a staff QR carries ONLY
-- 'GS:<staff.id>'. Neither encodes a name, number or email. Both are looked
-- up server-side. The existing ID-card codes (learners_profiles.id UUID and
-- the JKKN id) keep working at the gate.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. service_types: the category toggle
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS issues_gate_pass boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.service_types.issues_gate_pass IS
  'Gate Pass category. On final approval a hostel_gate_passes row is issued for the requester (issue_gate_pass_for_service_request).';

-- ────────────────────────────────────────────────────────────────────────
-- 2. hostel_gate_passes: bridge + validity day
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.hostel_gate_passes
  ADD COLUMN IF NOT EXISTS service_request_id uuid REFERENCES public.service_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valid_date        date,
  ADD COLUMN IF NOT EXISTS expected_exit     timestamptz,
  ADD COLUMN IF NOT EXISTS alternate_mobile  text;

CREATE UNIQUE INDEX IF NOT EXISTS hostel_gate_passes_service_request_uniq
  ON public.hostel_gate_passes (service_request_id)
  WHERE service_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hostel_gate_passes_valid_date_idx
  ON public.hostel_gate_passes (valid_date);

-- Human pass number: GP-2026-00125. One sequence, never reset.
CREATE SEQUENCE IF NOT EXISTS public.gate_pass_number_seq;

CREATE OR REPLACE FUNCTION public.next_gate_pass_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'GP-' || to_char(timezone('Asia/Kolkata', now()), 'YYYY') || '-' ||
         lpad(nextval('public.gate_pass_number_seq')::text, 5, '0');
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 3. gate_movements
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gate_movements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_type        text NOT NULL CHECK (person_type IN ('learner', 'staff')),
  profile_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  learner_profile_id uuid REFERENCES public.learners_profiles(id) ON DELETE SET NULL,
  staff_id           uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  gate_pass_id       uuid REFERENCES public.hostel_gate_passes(id) ON DELETE SET NULL,
  institution_id     uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  direction          text NOT NULL CHECK (direction IN ('in', 'out')),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  movement_date      date NOT NULL DEFAULT (timezone('Asia/Kolkata', now()))::date,
  recorded_by        uuid NOT NULL REFERENCES public.profiles(id),
  gate_location      text,
  reason             text,
  reason_updated_at  timestamptz,
  reason_updated_by  uuid REFERENCES public.profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gate_movements_subject_chk CHECK (
    (person_type = 'learner' AND gate_pass_id IS NOT NULL) OR
    (person_type = 'staff'   AND staff_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS gate_movements_date_idx      ON public.gate_movements (movement_date DESC, recorded_at DESC);
CREATE INDEX IF NOT EXISTS gate_movements_staff_idx     ON public.gate_movements (staff_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS gate_movements_pass_idx      ON public.gate_movements (gate_pass_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS gate_movements_profile_idx   ON public.gate_movements (profile_id, recorded_at DESC);

COMMENT ON TABLE public.gate_movements IS
  'One row per OUT/IN recorded at a campus gate. recorded_at is server time and immutable (trigger). Only reason/reason_updated_* may change, via gate_update_movement_reason.';

-- The timestamp, the direction and the subject can never be edited — not by
-- security, not by the person, not by an admin with table access.
CREATE OR REPLACE FUNCTION public.gate_movements_guard_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.recorded_at        IS DISTINCT FROM OLD.recorded_at
     OR NEW.movement_date   IS DISTINCT FROM OLD.movement_date
     OR NEW.direction       IS DISTINCT FROM OLD.direction
     OR NEW.person_type     IS DISTINCT FROM OLD.person_type
     OR NEW.profile_id      IS DISTINCT FROM OLD.profile_id
     OR NEW.learner_profile_id IS DISTINCT FROM OLD.learner_profile_id
     OR NEW.staff_id        IS DISTINCT FROM OLD.staff_id
     OR NEW.gate_pass_id    IS DISTINCT FROM OLD.gate_pass_id
     OR NEW.recorded_by     IS DISTINCT FROM OLD.recorded_by
     OR NEW.gate_location   IS DISTINCT FROM OLD.gate_location
     OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'gate_movements: only the reason may be updated' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gate_movements_immutable ON public.gate_movements;
CREATE TRIGGER gate_movements_immutable
  BEFORE UPDATE ON public.gate_movements
  FOR EACH ROW EXECUTE FUNCTION public.gate_movements_guard_immutable();

ALTER TABLE public.gate_movements ENABLE ROW LEVEL SECURITY;

-- Reads: the security/report keys, or your own rows. All writes go through
-- the DEFINER RPCs below — no INSERT/UPDATE/DELETE policy exists on purpose.
DROP POLICY IF EXISTS gate_movements_select ON public.gate_movements;
CREATE POLICY gate_movements_select ON public.gate_movements
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_permission('gate_security.scan.view')
    OR public.user_has_permission('gate_security.reports.view')
    OR public.user_has_permission('campus_living.gate_passes.edit')
    OR profile_id = auth.uid()
  );

-- ────────────────────────────────────────────────────────────────────────
-- 4. gate_audit_events — append-only
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gate_audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event          text NOT NULL,
  actor_id       uuid,
  actor_role     text,
  related_table  text NOT NULL,
  related_id     uuid,
  previous_value jsonb,
  new_value      jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gate_audit_events_related_idx ON public.gate_audit_events (related_table, related_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS gate_audit_events_occurred_idx ON public.gate_audit_events (occurred_at DESC);

ALTER TABLE public.gate_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gate_audit_events_select ON public.gate_audit_events;
CREATE POLICY gate_audit_events_select ON public.gate_audit_events
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR public.user_has_permission('gate_security.reports.view'));
-- No insert/update/delete policies: rows are written only by DEFINER code.

CREATE OR REPLACE FUNCTION public.gate_audit(
  p_event text, p_table text, p_id uuid, p_prev jsonb, p_new jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.gate_audit_events (event, actor_id, actor_role, related_table, related_id, previous_value, new_value)
  VALUES (p_event, auth.uid(), v_role, p_table, p_id, p_prev, p_new);
END;
$$;
REVOKE ALL ON FUNCTION public.gate_audit(text, text, uuid, jsonb, jsonb) FROM public;
-- Internal helper: callable only from the other DEFINER functions (owner).

-- Gate-pass lifecycle audit, so created/submitted/approved/rejected/cancelled
-- are all captured regardless of which screen produced them.
CREATE OR REPLACE FUNCTION public.hostel_gate_passes_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text; v_event text;
BEGIN
  SELECT role::text INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF TG_OP = 'INSERT' THEN
    v_event := CASE WHEN NEW.status::text = 'requested' THEN 'gate_pass.submitted' ELSE 'gate_pass.created' END;
    INSERT INTO public.gate_audit_events (event, actor_id, actor_role, related_table, related_id, new_value)
    VALUES (v_event, auth.uid(), v_role, 'hostel_gate_passes', NEW.id,
            jsonb_build_object('status', NEW.status, 'pass_number', NEW.pass_number, 'learner_id', NEW.learner_id));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status::text
      WHEN 'issued'    THEN CASE WHEN OLD.status::text = 'requested' THEN 'gate_pass.approved' ELSE 'gate_pass.updated' END
      WHEN 'rejected'  THEN 'gate_pass.rejected'
      WHEN 'cancelled' THEN 'gate_pass.cancelled'
      WHEN 'active'    THEN 'gate_pass.marked_out'
      WHEN 'returned'  THEN 'gate_pass.marked_in'
      WHEN 'overdue'   THEN 'gate_pass.overdue'
      ELSE 'gate_pass.updated' END;
    INSERT INTO public.gate_audit_events (event, actor_id, actor_role, related_table, related_id, previous_value, new_value)
    VALUES (v_event, auth.uid(), v_role, 'hostel_gate_passes', NEW.id,
            jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status, 'pass_number', NEW.pass_number));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hostel_gate_passes_audit ON public.hostel_gate_passes;
CREATE TRIGGER hostel_gate_passes_audit
  AFTER INSERT OR UPDATE ON public.hostel_gate_passes
  FOR EACH ROW EXECUTE FUNCTION public.hostel_gate_passes_audit_trg();

-- ────────────────────────────────────────────────────────────────────────
-- 5a. Authorisation helper for the gate screens
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_can_scan()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_has_permission('gate_security.scan.view')
      OR public.user_has_permission('campus_living.gate_passes.edit');
$$;

CREATE OR REPLACE FUNCTION public.gate_can_record()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR public.user_has_permission('gate_security.movements.record')
      OR public.user_has_permission('campus_living.gate_passes.edit');
$$;

-- ────────────────────────────────────────────────────────────────────────
-- 5b. issue_gate_pass_for_service_request — the Service Request → Gate Pass bridge
-- ────────────────────────────────────────────────────────────────────────
-- form_data keys written by the Gate Pass block of the request form:
--   gate_pass_date        'YYYY-MM-DD'
--   gate_pass_exit_time   'HH:MM'
--   gate_pass_return_time 'HH:MM'
--   gate_pass_reason      text
--   gate_pass_alt_mobile  text (optional)
--   gate_pass_remarks     text (optional)
CREATE OR REPLACE FUNCTION public.issue_gate_pass_for_service_request(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req            record;
  v_issues         boolean;
  v_learner        record;
  v_existing_id    uuid;
  v_date           date;
  v_exit_t         time;
  v_return_t       time;
  v_exit_at        timestamptz;
  v_return_at      timestamptz;
  v_reason         text;
  v_pass_id        uuid;
  v_pass_number    text;
  v_qr             text;
BEGIN
  IF NOT (public.is_super_admin() OR public.user_has_permission('service_requests.approve')) THEN
    RAISE EXCEPTION 'issue_gate_pass: not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT sr.id, sr.requester_id, sr.form_data, sr.status::text AS status, sr.institution_id,
         st.issues_gate_pass
    INTO v_req
    FROM public.service_requests sr
    JOIN public.service_types st ON st.id = sr.service_type_id
   WHERE sr.id = p_request_id;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'issue_gate_pass: request % not found', p_request_id;
  END IF;
  IF NOT COALESCE(v_req.issues_gate_pass, false) THEN
    RAISE NOTICE 'issue_gate_pass: request % is not a gate-pass type; skipping', p_request_id;
    RETURN NULL;
  END IF;
  IF v_req.status NOT IN ('approved', 'fulfilled') THEN
    RAISE EXCEPTION 'issue_gate_pass: request % is not approved (status=%)', p_request_id, v_req.status;
  END IF;

  -- Idempotent: a re-run must hand back the pass already carried at the gate,
  -- never mint a second number / QR.
  SELECT id INTO v_existing_id FROM public.hostel_gate_passes WHERE service_request_id = p_request_id;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT lp.id, lp.institution_id
    INTO v_learner
    FROM public.profiles p
    JOIN public.learners_profiles lp ON lp.id = p.learner_id
   WHERE p.id = v_req.requester_id;
  IF v_learner.id IS NULL THEN
    RAISE EXCEPTION 'issue_gate_pass: requester % has no learner profile', v_req.requester_id;
  END IF;

  BEGIN
    v_date     := NULLIF(v_req.form_data->>'gate_pass_date', '')::date;
    v_exit_t   := NULLIF(v_req.form_data->>'gate_pass_exit_time', '')::time;
    v_return_t := NULLIF(v_req.form_data->>'gate_pass_return_time', '')::time;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'issue_gate_pass: gate_pass_date / exit / return are not valid for request %', p_request_id;
  END;
  IF v_date IS NULL OR v_return_t IS NULL THEN
    RAISE EXCEPTION 'issue_gate_pass: date and expected return time are required (request %)', p_request_id;
  END IF;
  v_reason := COALESCE(NULLIF(v_req.form_data->>'gate_pass_reason', ''), 'Gate pass');

  -- Times are entered on an Indian wall clock.
  v_exit_at   := CASE WHEN v_exit_t IS NULL THEN NULL
                      ELSE ((v_date + v_exit_t) AT TIME ZONE 'Asia/Kolkata') END;
  v_return_at := (v_date + v_return_t) AT TIME ZONE 'Asia/Kolkata';
  -- A return time earlier than the exit time means "back the next day".
  IF v_exit_at IS NOT NULL AND v_return_at <= v_exit_at THEN
    v_return_at := v_return_at + interval '1 day';
  END IF;

  v_pass_number := public.next_gate_pass_number();
  v_qr          := 'QR-' || gen_random_uuid()::text;

  INSERT INTO public.hostel_gate_passes (
    institution_id, learner_id, pass_type, pass_number, qr_code,
    destination, reason, expected_exit, expected_return, valid_date,
    alternate_mobile, approved_by, approved_at, status, service_request_id
  ) VALUES (
    COALESCE(v_learner.institution_id, v_req.institution_id),
    v_req.requester_id, 'regular_out', v_pass_number, v_qr,
    v_reason, v_reason, v_exit_at, v_return_at, v_date,
    NULLIF(v_req.form_data->>'gate_pass_alt_mobile', ''),
    auth.uid(), now(), 'issued', p_request_id
  )
  RETURNING id INTO v_pass_id;

  PERFORM public.gate_audit('gate_pass.qr_generated', 'hostel_gate_passes', v_pass_id, NULL,
    jsonb_build_object('pass_number', v_pass_number, 'service_request_id', p_request_id));

  RETURN v_pass_id;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_gate_pass_for_service_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.issue_gate_pass_for_service_request(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5c. gate_record_movement — the OUT / IN tap
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_record_movement(
  p_direction     text,
  p_gate_pass_id  uuid DEFAULT NULL,
  p_staff_id      uuid DEFAULT NULL,
  p_gate_location text DEFAULT NULL,
  p_reason        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pass        record;
  v_staff       record;
  v_last_dir    text;
  v_today       date := (timezone('Asia/Kolkata', now()))::date;
  v_now         timestamptz := now();
  v_movement_id uuid;
  v_new_status  text;
BEGIN
  IF NOT public.gate_can_record() THEN
    RAISE EXCEPTION 'gate: not authorized to record movements' USING ERRCODE = '42501';
  END IF;
  IF p_direction NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'gate: direction must be in or out';
  END IF;

  -- ── Learner: against an approved pass ────────────────────────────────
  IF p_gate_pass_id IS NOT NULL THEN
    SELECT gp.*, p.learner_id AS learner_profile_id
      INTO v_pass
      FROM public.hostel_gate_passes gp
      LEFT JOIN public.profiles p ON p.id = gp.learner_id
     WHERE gp.id = p_gate_pass_id
     FOR UPDATE OF gp;
    IF v_pass.id IS NULL THEN
      RAISE EXCEPTION 'gate: pass not found';
    END IF;

    IF v_pass.status::text IN ('requested') THEN
      RAISE EXCEPTION 'gate: pass % is not approved yet', v_pass.pass_number;
    ELSIF v_pass.status::text = 'rejected' THEN
      RAISE EXCEPTION 'gate: pass % was rejected', v_pass.pass_number;
    ELSIF v_pass.status::text = 'cancelled' THEN
      RAISE EXCEPTION 'gate: pass % was cancelled', v_pass.pass_number;
    ELSIF v_pass.status::text = 'returned' THEN
      RAISE EXCEPTION 'gate: pass % is already completed', v_pass.pass_number;
    END IF;

    IF p_direction = 'out' THEN
      IF v_pass.status::text <> 'issued' THEN
        RAISE EXCEPTION 'gate: % is already OUT on pass %', 'learner', v_pass.pass_number;
      END IF;
      IF v_pass.valid_date IS NOT NULL AND v_pass.valid_date <> v_today THEN
        RAISE EXCEPTION 'gate: pass % is valid on %, not today', v_pass.pass_number, to_char(v_pass.valid_date, 'DD Mon YYYY');
      END IF;
      IF v_pass.expected_return < v_now THEN
        RAISE EXCEPTION 'gate: pass % has expired', v_pass.pass_number;
      END IF;
      v_new_status := 'active';
      UPDATE public.hostel_gate_passes
         SET status = 'active', out_time = v_now, gate_security_out = auth.uid(), updated_at = v_now
       WHERE id = v_pass.id;
    ELSE
      IF v_pass.status::text NOT IN ('active', 'overdue') THEN
        RAISE EXCEPTION 'gate: learner has not gone OUT on pass % yet', v_pass.pass_number;
      END IF;
      v_new_status := 'returned';
      UPDATE public.hostel_gate_passes
         SET status = 'returned', actual_return = v_now, gate_security_in = auth.uid(), updated_at = v_now
       WHERE id = v_pass.id;
    END IF;

    INSERT INTO public.gate_movements (
      person_type, profile_id, learner_profile_id, gate_pass_id, institution_id,
      direction, recorded_at, movement_date, recorded_by, gate_location
    ) VALUES (
      'learner', v_pass.learner_id, v_pass.learner_profile_id, v_pass.id, v_pass.institution_id,
      p_direction, v_now, v_today, auth.uid(), NULLIF(p_gate_location, '')
    ) RETURNING id INTO v_movement_id;

    PERFORM public.gate_audit(
      CASE WHEN p_direction = 'out' THEN 'security.marked_out' ELSE 'security.marked_in' END,
      'gate_movements', v_movement_id,
      jsonb_build_object('pass_status', v_pass.status),
      jsonb_build_object('pass_id', v_pass.id, 'pass_number', v_pass.pass_number, 'pass_status', v_new_status, 'at', v_now)
    );

    RETURN jsonb_build_object('movement_id', v_movement_id, 'recorded_at', v_now, 'pass_status', v_new_status);
  END IF;

  -- ── Staff: against the personal QR ───────────────────────────────────
  IF p_staff_id IS NULL THEN
    RAISE EXCEPTION 'gate: nothing to record against';
  END IF;

  SELECT s.id, s.is_active, s.institution_id, s.profile_id, s.email, s.institution_email
    INTO v_staff
    FROM public.staff s
   WHERE s.id = p_staff_id;
  IF v_staff.id IS NULL THEN
    RAISE EXCEPTION 'gate: team member not found';
  END IF;
  IF v_staff.is_active IS FALSE THEN
    RAISE EXCEPTION 'gate: this team member is no longer active';
  END IF;

  -- Same direction twice in a day is the invalid sequence the requirement
  -- names (IN → IN, OUT → OUT). The first movement of a day may be either.
  SELECT direction INTO v_last_dir
    FROM public.gate_movements
   WHERE staff_id = v_staff.id AND movement_date = v_today
   ORDER BY recorded_at DESC
   LIMIT 1;
  IF v_last_dir = p_direction THEN
    RAISE EXCEPTION 'gate: last record today is already %; the next must be %',
      upper(v_last_dir), CASE WHEN v_last_dir = 'in' THEN 'OUT' ELSE 'IN' END;
  END IF;

  -- Staff profiles link is best-effort: staff.profile_id, else the email bridge.
  INSERT INTO public.gate_movements (
    person_type, profile_id, staff_id, institution_id, direction,
    recorded_at, movement_date, recorded_by, gate_location, reason
  ) VALUES (
    'staff',
    COALESCE(v_staff.profile_id,
             (SELECT p.id FROM public.profiles p
               WHERE lower(p.email) IN (lower(COALESCE(v_staff.institution_email, '')), lower(COALESCE(v_staff.email, '')))
               LIMIT 1)),
    v_staff.id, v_staff.institution_id, p_direction,
    v_now, v_today, auth.uid(), NULLIF(p_gate_location, ''), NULLIF(p_reason, '')
  ) RETURNING id INTO v_movement_id;

  PERFORM public.gate_audit(
    CASE WHEN p_direction = 'out' THEN 'security.marked_out' ELSE 'security.marked_in' END,
    'gate_movements', v_movement_id, NULL,
    jsonb_build_object('staff_id', v_staff.id, 'at', v_now, 'reason', p_reason)
  );

  RETURN jsonb_build_object('movement_id', v_movement_id, 'recorded_at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.gate_record_movement(text, uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_record_movement(text, uuid, uuid, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5d. gate_update_movement_reason — staff reason, audited (requirement §9)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_update_movement_reason(p_movement_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_me  uuid := auth.uid();
  v_is_me boolean;
BEGIN
  SELECT m.*, s.profile_id AS staff_profile_id, s.email AS staff_email, s.institution_email AS staff_inst_email
    INTO v_row
    FROM public.gate_movements m
    LEFT JOIN public.staff s ON s.id = m.staff_id
   WHERE m.id = p_movement_id
   FOR UPDATE OF m;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'gate: movement not found';
  END IF;
  IF v_row.person_type <> 'staff' THEN
    RAISE EXCEPTION 'gate: only team-member movements carry a reason';
  END IF;

  v_is_me := (v_row.profile_id = v_me) OR (v_row.staff_profile_id = v_me) OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_me
       AND lower(p.email) IN (lower(COALESCE(v_row.staff_inst_email, '')), lower(COALESCE(v_row.staff_email, '')))
  );
  IF NOT (v_is_me OR public.gate_can_record()) THEN
    RAISE EXCEPTION 'gate: not authorized to update this reason' USING ERRCODE = '42501';
  END IF;

  UPDATE public.gate_movements
     SET reason = NULLIF(p_reason, ''), reason_updated_at = now(), reason_updated_by = v_me
   WHERE id = p_movement_id;

  PERFORM public.gate_audit('staff.reason_updated', 'gate_movements', p_movement_id,
    jsonb_build_object('reason', v_row.reason),
    jsonb_build_object('reason', NULLIF(p_reason, ''), 'updated_by', v_me, 'updated_at', now()));
END;
$$;
REVOKE ALL ON FUNCTION public.gate_update_movement_reason(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_update_movement_reason(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5e. gate_person_snapshot — what security may see after a scan (§5, §8)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_person_snapshot(p_profile_id uuid DEFAULT NULL, p_staff_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.gate_can_scan() THEN
    RAISE EXCEPTION 'gate: not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_staff_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'person_type', 'staff',
      'staff_id', s.id,
      'profile_id', s.profile_id,
      'full_name', trim(concat_ws(' ', s.first_name, s.last_name)),
      'staff_code', s.staff_id,
      'email', COALESCE(s.institution_email, s.email),
      'mobile', s.phone,
      'photo_url', s.profile_picture,
      'department', d.department_name,
      'designation', s.designation,
      'institution_id', s.institution_id,
      'is_active', s.is_active,
      'last_direction', (SELECT m.direction FROM public.gate_movements m
                          WHERE m.staff_id = s.id AND m.movement_date = (timezone('Asia/Kolkata', now()))::date
                          ORDER BY m.recorded_at DESC LIMIT 1),
      'last_movement_at', (SELECT m.recorded_at FROM public.gate_movements m
                            WHERE m.staff_id = s.id ORDER BY m.recorded_at DESC LIMIT 1)
    ) INTO v_out
    FROM public.staff s
    LEFT JOIN public.departments d ON d.id = s.department_id
    WHERE s.id = p_staff_id;
    RETURN v_out;
  END IF;

  SELECT jsonb_build_object(
    'person_type', 'learner',
    'profile_id', p.id,
    'learner_profile_id', lp.id,
    'full_name', COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name),
    'roll_number', lp.roll_number,
    'register_number', lp.register_number,
    'jkkn_id', (SELECT ji.jkkn_id FROM public.jkkn_identities ji WHERE ji.learner_profile_id = lp.id AND ji.retired_at IS NULL LIMIT 1),
    'email', COALESCE(lp.college_email, lp.student_email, p.email),
    'mobile', COALESCE(lp.student_mobile, p.phone_number),
    'photo_url', lp.student_photo_url,
    'institution_id', lp.institution_id,
    'lifecycle_status', lp.lifecycle_status
  ) INTO v_out
  FROM public.profiles p
  LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
  WHERE p.id = p_profile_id;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.gate_person_snapshot(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_person_snapshot(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5f. gate_search_people — the security search bar (§4)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_search_people(p_query text, p_limit int DEFAULT 12)
RETURNS TABLE (
  person_type text, profile_id uuid, learner_profile_id uuid, staff_id uuid,
  full_name text, code text, email text, photo_url text, subtitle text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_q text := trim(COALESCE(p_query, '')); v_like text;
BEGIN
  IF NOT public.gate_can_scan() THEN
    RAISE EXCEPTION 'gate: not authorized' USING ERRCODE = '42501';
  END IF;
  IF length(v_q) < 2 THEN RETURN; END IF;
  v_like := '%' || v_q || '%';

  RETURN QUERY
  -- A pass number resolves straight to its learner.
  SELECT 'learner'::text, p.id, lp.id, NULL::uuid,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name),
         COALESCE(lp.roll_number, lp.register_number), COALESCE(lp.college_email, lp.student_email, p.email),
         lp.student_photo_url, ('Pass ' || gp.pass_number)::text
    FROM public.hostel_gate_passes gp
    JOIN public.profiles p ON p.id = gp.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
   WHERE gp.pass_number ILIKE v_like
  UNION ALL
  SELECT 'learner'::text, p.id, lp.id, NULL::uuid,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name),
         COALESCE(lp.roll_number, lp.register_number), COALESCE(lp.college_email, lp.student_email, p.email),
         lp.student_photo_url, COALESCE(lp.roll_number, '')::text
    FROM public.learners_profiles lp
    JOIN public.profiles p ON p.learner_id = lp.id
   WHERE lp.roll_number ILIKE v_like
      OR lp.register_number ILIKE v_like
      OR lp.college_email ILIKE v_like
      OR lp.student_email ILIKE v_like
      OR p.email ILIKE v_like
      OR concat_ws(' ', lp.first_name, lp.last_name) ILIKE v_like
      OR EXISTS (SELECT 1 FROM public.jkkn_identities ji WHERE ji.learner_profile_id = lp.id AND ji.jkkn_id = v_q)
  UNION ALL
  SELECT 'staff'::text, s.profile_id, NULL::uuid, s.id,
         trim(concat_ws(' ', s.first_name, s.last_name)), s.staff_id, COALESCE(s.institution_email, s.email),
         s.profile_picture, COALESCE(s.designation, 'Team member')::text
    FROM public.staff s
   WHERE s.is_active IS DISTINCT FROM false
     AND (s.staff_id ILIKE v_like OR s.email ILIKE v_like OR s.institution_email ILIKE v_like
          OR concat_ws(' ', s.first_name, s.last_name) ILIKE v_like)
  LIMIT GREATEST(1, LEAST(p_limit, 30));
END;
$$;
REVOKE ALL ON FUNCTION public.gate_search_people(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_search_people(text, int) TO authenticated;

-- Resolve a scanned pass QR / staff QR to who it belongs to.
CREATE OR REPLACE FUNCTION public.gate_resolve_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_t text := trim(COALESCE(p_token, '')); v_id uuid; v_pass record;
BEGIN
  IF NOT public.gate_can_scan() THEN
    RAISE EXCEPTION 'gate: not authorized' USING ERRCODE = '42501';
  END IF;
  IF v_t LIKE 'GS:%' THEN
    BEGIN v_id := substr(v_t, 4)::uuid; EXCEPTION WHEN others THEN RETURN NULL; END;
    IF EXISTS (SELECT 1 FROM public.staff WHERE id = v_id) THEN
      RETURN jsonb_build_object('kind', 'staff', 'staff_id', v_id);
    END IF;
    RETURN NULL;
  END IF;
  IF v_t LIKE 'QR-%' OR v_t LIKE 'GP-%' THEN
    SELECT gp.id, gp.learner_id INTO v_pass FROM public.hostel_gate_passes gp
     WHERE gp.qr_code = v_t OR gp.pass_number = v_t LIMIT 1;
    IF v_pass.id IS NOT NULL THEN
      RETURN jsonb_build_object('kind', 'pass', 'pass_id', v_pass.id, 'profile_id', v_pass.learner_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.gate_resolve_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_resolve_token(text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5g. gate_today_activity — the three counters on the security home
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_today_activity()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (
    SELECT * FROM public.gate_movements
     WHERE movement_date = (timezone('Asia/Kolkata', now()))::date
  )
  SELECT CASE WHEN public.gate_can_scan() THEN jsonb_build_object(
    'out',     (SELECT count(*) FROM today WHERE direction = 'out'),
    'in',      (SELECT count(*) FROM today WHERE direction = 'in'),
    'outside', (SELECT count(*) FROM public.hostel_gate_passes WHERE status::text IN ('active', 'overdue'))
             + (SELECT count(*) FROM (
                  SELECT DISTINCT ON (staff_id) staff_id, direction FROM today
                   WHERE person_type = 'staff' ORDER BY staff_id, recorded_at DESC) s
                 WHERE s.direction = 'out')
  ) ELSE jsonb_build_object('out', 0, 'in', 0, 'outside', 0) END;
$$;
REVOKE ALL ON FUNCTION public.gate_today_activity() FROM public;
GRANT EXECUTE ON FUNCTION public.gate_today_activity() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5h. gate_in_out_report — CAO report rows (§10, §11)
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gate_in_out_report(
  p_from date,
  p_to date,
  p_person_type text DEFAULT NULL,       -- 'learner' | 'staff' | NULL
  p_institution_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_state text DEFAULT NULL              -- 'outside' | 'completed' | NULL
)
RETURNS TABLE (
  person_type text, person_name text, code text, department text, designation text,
  institution_id uuid, gate_pass_id uuid, pass_number text, pass_status text, reason text,
  approved_by text, out_time timestamptz, in_time timestamptz, movement_date date,
  current_status text, movement_id uuid, reason_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_has_permission('gate_security.reports.view')) THEN
    RAISE EXCEPTION 'gate: not authorized to view reports' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Learners: one row per pass (the pass row IS the learner's in/out record,
  -- so passes recorded from the hostel scan screen appear too).
  SELECT 'learner'::text,
         COALESCE(NULLIF(trim(concat_ws(' ', lp.first_name, lp.last_name)), ''), p.full_name),
         COALESCE(lp.roll_number, lp.register_number),
         d.department_name, NULL::text,
         gp.institution_id, gp.id, gp.pass_number, gp.status::text, COALESCE(gp.reason, gp.destination),
         ap.full_name, gp.out_time, gp.actual_return,
         COALESCE(gp.valid_date, (timezone('Asia/Kolkata', COALESCE(gp.out_time, gp.approved_at, gp.created_at)))::date),
         CASE gp.status::text WHEN 'active' THEN 'Outside' WHEN 'overdue' THEN 'Outside (late)'
              WHEN 'returned' THEN 'Completed' WHEN 'issued' THEN 'Approved' ELSE initcap(gp.status::text) END,
         NULL::uuid, NULL::timestamptz
    FROM public.hostel_gate_passes gp
    JOIN public.profiles p ON p.id = gp.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = p.learner_id
    LEFT JOIN public.departments d ON d.id = lp.department_id
    LEFT JOIN public.profiles ap ON ap.id = gp.approved_by
   WHERE (p_person_type IS NULL OR p_person_type = 'learner')
     AND COALESCE(gp.valid_date, (timezone('Asia/Kolkata', COALESCE(gp.out_time, gp.approved_at, gp.created_at)))::date) BETWEEN p_from AND p_to
     AND gp.status::text NOT IN ('requested', 'rejected')
     AND (p_institution_id IS NULL OR gp.institution_id = p_institution_id)
     AND (p_department_id IS NULL OR lp.department_id = p_department_id)
     AND (p_state IS NULL
          OR (p_state = 'outside'   AND gp.status::text IN ('active', 'overdue'))
          OR (p_state = 'completed' AND gp.status::text = 'returned'))
  UNION ALL
  -- Staff: one row per movement.
  SELECT 'staff'::text,
         trim(concat_ws(' ', s.first_name, s.last_name)), s.staff_id,
         d.department_name, s.designation,
         m.institution_id, NULL::uuid, NULL::text, NULL::text, m.reason,
         NULL::text,
         CASE WHEN m.direction = 'out' THEN m.recorded_at END,
         CASE WHEN m.direction = 'in'  THEN m.recorded_at END,
         m.movement_date,
         CASE WHEN last_m.direction = 'out' THEN 'Outside' ELSE 'Inside' END,
         m.id, m.reason_updated_at
    FROM public.gate_movements m
    JOIN public.staff s ON s.id = m.staff_id
    LEFT JOIN public.departments d ON d.id = s.department_id
    LEFT JOIN LATERAL (
      SELECT direction FROM public.gate_movements x
       WHERE x.staff_id = m.staff_id AND x.movement_date = m.movement_date
       ORDER BY x.recorded_at DESC LIMIT 1
    ) last_m ON true
   WHERE m.person_type = 'staff'
     AND (p_person_type IS NULL OR p_person_type = 'staff')
     AND m.movement_date BETWEEN p_from AND p_to
     AND (p_institution_id IS NULL OR m.institution_id = p_institution_id)
     AND (p_department_id IS NULL OR s.department_id = p_department_id)
     AND (p_state IS NULL
          OR (p_state = 'outside'   AND last_m.direction = 'out')
          OR (p_state = 'completed' AND last_m.direction = 'in'))
  ORDER BY 14 DESC, 12 DESC NULLS LAST, 13 DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.gate_in_out_report(date, date, text, uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gate_in_out_report(date, date, text, uuid, uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 6. Grants — merge, never replace (see 20260903041500 for why)
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_hit int;
BEGIN
  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'gate_security.scan.view', true,
           'gate_security.movements.record', true
         ),
         updated_at = now()
   WHERE role_key IN ('gate_security', 'warden', 'chief_warden');
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RAISE NOTICE 'gate_security scan+record granted to % roles', v_hit;

  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'gate_security.reports.view', true,
           'gate_security.reports.export', true
         ),
         updated_at = now()
   WHERE role_key IN ('cao');
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RAISE NOTICE 'gate_security reports granted to % roles', v_hit;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 7. Verification
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_missing text[];
BEGIN
  SELECT array_agg(f) INTO v_missing FROM unnest(ARRAY[
    'issue_gate_pass_for_service_request', 'gate_record_movement', 'gate_update_movement_reason',
    'gate_person_snapshot', 'gate_search_people', 'gate_resolve_token', 'gate_today_activity',
    'gate_in_out_report', 'next_gate_pass_number', 'gate_can_scan', 'gate_can_record', 'gate_audit'
  ]) AS f
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public' AND p.proname = f);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'gate migration incomplete, missing: %', v_missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_types' AND column_name = 'issues_gate_pass') THEN
    RAISE EXCEPTION 'service_types.issues_gate_pass missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'hostel_gate_passes' AND column_name = 'service_request_id') THEN
    RAISE EXCEPTION 'hostel_gate_passes.service_request_id missing';
  END IF;
  RAISE NOTICE 'gate pass + gate security migration verified';
END $$;

COMMIT;
