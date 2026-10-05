-- Clinical duty: geotagged self-attendance for HR-approved off-campus staff.
--
-- Staff on clinical/hospital duty work where no biometric device exists, so they
-- read as absent. HR approves WHO is eligible (individual, department or whole
-- institution); an eligible person punches IN then OUT from the app; the punch
-- is accepted only inside an HR-defined duty site (geofence). The day lands in
-- hr_attendance_records (source 'clinical_geotag') -- the one table My
-- Attendance, the monthly report and payroll read -- and is judged against the
-- person's normal shift timing by the existing evaluator after the OUT punch.
--
-- Walls: no client INSERT policy on hr_clinical_punches or on
-- hr_attendance_records for this path -- fn_hr_clinical_punch is the only
-- writer. It derives the caller from auth.uid() (no id parameter) and takes
-- time from the server clock, so neither the person nor the time can be spoofed
-- by the client; only the coordinates are client-reported.

-- 1. Duty sites ---------------------------------------------------------------
CREATE TABLE public.hr_clinical_duty_sites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 120),
  lat            numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  radius_m       integer NOT NULL CHECK (radius_m BETWEEN 30 AND 2000),
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_clinical_duty_sites_inst_idx ON public.hr_clinical_duty_sites (institution_id) WHERE is_active;
ALTER TABLE public.hr_clinical_duty_sites ENABLE ROW LEVEL SECURITY;

-- 2. Eligibility ----------------------------------------------------------------
CREATE TABLE public.hr_clinical_duty_eligibilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type      text NOT NULL CHECK (scope_type IN ('staff', 'department', 'institution')),
  employee_id     uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  department_id   uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected', 'revoked')),
  reason          text,
  valid_from      date NOT NULL DEFAULT CURRENT_DATE,
  valid_until     date,
  site_ids        uuid[],            -- NULL = every active site of the institution
  requested_by    uuid REFERENCES auth.users(id),
  granted_directly boolean NOT NULL DEFAULT false,
  decided_by      uuid REFERENCES auth.users(id),
  decided_at      timestamptz,
  decision_note   text,
  revoked_by      uuid REFERENCES auth.users(id),
  revoked_at      timestamptz,
  revoke_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_cde_scope_chk CHECK (
    (scope_type = 'staff'       AND employee_id IS NOT NULL AND department_id IS NULL) OR
    (scope_type = 'department'  AND department_id IS NOT NULL AND employee_id IS NULL) OR
    (scope_type = 'institution' AND employee_id IS NULL AND department_id IS NULL)),
  CONSTRAINT hr_cde_dates_chk CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX hr_cde_employee_idx    ON public.hr_clinical_duty_eligibilities (employee_id)   WHERE employee_id IS NOT NULL;
CREATE INDEX hr_cde_department_idx  ON public.hr_clinical_duty_eligibilities (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX hr_cde_institution_idx ON public.hr_clinical_duty_eligibilities (institution_id);
CREATE INDEX hr_cde_status_idx      ON public.hr_clinical_duty_eligibilities (status, valid_until);
-- One live request/grant per person: a second pending/approved row for the same
-- staff would make "approve" ambiguous.
CREATE UNIQUE INDEX hr_cde_one_live_staff_uniq
  ON public.hr_clinical_duty_eligibilities (employee_id)
  WHERE scope_type = 'staff' AND status IN ('pending', 'approved');
ALTER TABLE public.hr_clinical_duty_eligibilities ENABLE ROW LEVEL SECURITY;

-- 3. Punch audit (immutable; written only by fn_hr_clinical_punch) ---------------
CREATE TABLE public.hr_clinical_punches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  work_date   date NOT NULL,
  punch_type  text NOT NULL CHECK (punch_type IN ('in', 'out')),
  punched_at  timestamptz NOT NULL DEFAULT now(),
  site_id     uuid NOT NULL REFERENCES public.hr_clinical_duty_sites(id),
  lat         numeric(9,6) NOT NULL,
  lng         numeric(9,6) NOT NULL,
  accuracy_m  integer NOT NULL,
  distance_m  integer NOT NULL,
  CONSTRAINT hr_clinical_punches_one_per_type UNIQUE (employee_id, work_date, punch_type)
);
CREATE INDEX hr_clinical_punches_site_idx ON public.hr_clinical_punches (site_id);
ALTER TABLE public.hr_clinical_punches ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_hr_clinical_duty_sites_updated
  BEFORE UPDATE ON public.hr_clinical_duty_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_hr_cde_updated
  BEFORE UPDATE ON public.hr_clinical_duty_eligibilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Helpers ---------------------------------------------------------------------
-- Is this person approved for clinical duty on this date? Matches an approved,
-- in-date row at staff, department or institution level.
CREATE OR REPLACE FUNCTION public.fn_hr_clinical_eligible(p_employee_id uuid, p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    JOIN public.hr_clinical_duty_eligibilities e ON e.institution_id = s.institution_id
    WHERE s.id = p_employee_id
      AND e.status = 'approved'
      AND e.valid_from <= p_date
      AND (e.valid_until IS NULL OR e.valid_until >= p_date)
      AND (   (e.scope_type = 'staff'       AND e.employee_id   = s.id)
           OR (e.scope_type = 'department'  AND e.department_id = s.department_id)
           OR (e.scope_type = 'institution'))
  );
$function$;

-- The duty sites this person may punch at on a date.
CREATE OR REPLACE FUNCTION public.fn_hr_clinical_allowed_sites(p_employee_id uuid, p_date date)
RETURNS SETOF public.hr_clinical_duty_sites
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT st.*
  FROM public.staff s
  JOIN public.hr_clinical_duty_eligibilities e ON e.institution_id = s.institution_id
  JOIN public.hr_clinical_duty_sites st
    ON st.institution_id = s.institution_id AND st.is_active
   AND (e.site_ids IS NULL OR st.id = ANY (e.site_ids))
  WHERE s.id = p_employee_id
    AND e.status = 'approved'
    AND e.valid_from <= p_date
    AND (e.valid_until IS NULL OR e.valid_until >= p_date)
    AND (   (e.scope_type = 'staff'       AND e.employee_id   = s.id)
         OR (e.scope_type = 'department'  AND e.department_id = s.department_id)
         OR (e.scope_type = 'institution'));
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_clinical_eligible(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_clinical_allowed_sites(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_eligible(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_allowed_sites(uuid, date) TO authenticated, service_role;

-- 5. The punch -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_clinical_punch(
  p_lat        numeric,
  p_lng        numeric,
  p_accuracy_m numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid     uuid := (SELECT auth.uid());
  v_today   date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_staff   record;
  v_site    record;
  v_dist    integer;
  v_rec     record;
  v_type    text;
  v_in_at   timestamptz;
  v_org     uuid;
  v_absent  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to mark attendance.' USING ERRCODE = '28000';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR p_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Your location could not be read. Turn on location access and try again.' USING ERRCODE = '22023';
  END IF;
  IF p_accuracy_m IS NULL OR p_accuracy_m < 0 OR p_accuracy_m > 100 THEN
    RAISE EXCEPTION 'Your location is not accurate enough (% m, needs 100 m or better). Move to an open area and try again.',
      COALESCE(round(p_accuracy_m)::text, 'unknown') USING ERRCODE = '22023';
  END IF;

  -- The caller's own staff record that is approved today. Never a parameter.
  SELECT s.id, s.institution_id INTO v_staff
  FROM public.staff s
  WHERE s.profile_id = v_uid AND s.is_active
    AND public.fn_hr_clinical_eligible(s.id, v_today)
  ORDER BY s.id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not approved for clinical duty attendance.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.fn_hr_institution_included(v_staff.institution_id) THEN
    RAISE EXCEPTION 'Attendance is not managed in HR for your institution.' USING ERRCODE = '42501';
  END IF;

  -- Nearest allowed site (haversine, metres).
  SELECT x.*, round(x.d)::integer AS dist INTO v_site
  FROM (
    SELECT st.id, st.name, st.radius_m,
           2 * 6371000 * asin(sqrt(
             power(sin(radians(st.lat - p_lat) / 2), 2) +
             cos(radians(p_lat)) * cos(radians(st.lat)) *
             power(sin(radians(st.lng - p_lng) / 2), 2))) AS d
    FROM public.fn_hr_clinical_allowed_sites(v_staff.id, v_today) st
  ) x
  ORDER BY x.d LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No clinical duty site is set up for you. Ask HR to add one.' USING ERRCODE = 'P0001';
  END IF;
  v_dist := v_site.dist;
  IF v_dist > v_site.radius_m THEN
    RAISE EXCEPTION 'You are % m from % (allowed within % m). Move to the duty site and try again.',
      v_dist, v_site.name, v_site.radius_m USING ERRCODE = 'P0001';
  END IF;

  -- Serialise this person's punches so a double tap cannot create two rows.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_staff.id::text || ':clinical:' || v_today::text, 0));

  SELECT * INTO v_rec FROM public.hr_attendance_records
  WHERE employee_id = v_staff.id AND work_date = v_today;
  IF FOUND AND v_rec.source <> 'clinical_geotag' THEN
    RAISE EXCEPTION 'Today already has attendance from %. A clinical punch cannot be added.', v_rec.source
      USING ERRCODE = 'P0001';
  END IF;

  SELECT punched_at INTO v_in_at FROM public.hr_clinical_punches
  WHERE employee_id = v_staff.id AND work_date = v_today AND punch_type = 'in';

  IF v_in_at IS NULL THEN
    v_type := 'in';
  ELSIF EXISTS (SELECT 1 FROM public.hr_clinical_punches
                WHERE employee_id = v_staff.id AND work_date = v_today AND punch_type = 'out') THEN
    RAISE EXCEPTION 'You have already punched in and out today.' USING ERRCODE = 'P0001';
  ELSIF now() < v_in_at + interval '1 minute' THEN
    RAISE EXCEPTION 'You punched in a moment ago. Wait a minute before punching out.' USING ERRCODE = 'P0001';
  ELSE
    v_type := 'out';
  END IF;

  INSERT INTO public.hr_clinical_punches
    (employee_id, work_date, punch_type, site_id, lat, lng, accuracy_m, distance_m)
  VALUES
    (v_staff.id, v_today, v_type, v_site.id, p_lat, p_lng, round(p_accuracy_m)::integer, v_dist);

  IF v_type = 'in' THEN
    SELECT id INTO v_org FROM public.hr_organizations WHERE institution_id = v_staff.institution_id LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'Your institution has no HR organisation set up.' USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_absent FROM public.hr_attendance_status_types
    WHERE code = 'ABSENT' AND institution_id IS NULL;

    -- ABSENT until the OUT punch: the evaluator judges the whole day then.
    INSERT INTO public.hr_attendance_records
      (employee_id, hr_organization_id, institution_id, work_date, status_type_id,
       in_at, source, day_calc, gps_lat, gps_lng, gps_accuracy_m, device_status, notes)
    VALUES
      (v_staff.id, v_org, v_staff.institution_id, v_today, v_absent,
       now(), 'clinical_geotag', 'NONE', p_lat, p_lng, round(p_accuracy_m)::integer,
       'clinical_in_progress', 'Clinical duty - ' || v_site.name);
  ELSE
    UPDATE public.hr_attendance_records
       SET out_at = now(), device_status = 'clinical_complete', updated_at = now()
     WHERE employee_id = v_staff.id AND work_date = v_today;
  END IF;

  RETURN jsonb_build_object(
    'employee_id', v_staff.id, 'work_date', v_today, 'punch_type', v_type,
    'punched_at', now(), 'site_name', v_site.name, 'distance_m', v_dist);
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_clinical_punch(numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_punch(numeric, numeric, numeric) TO authenticated, service_role;

-- 6. Decide / revoke (permission checked inside) -----------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_clinical_decide(p_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.attendance.clinical.manage') THEN
    RAISE EXCEPTION 'You do not have permission to decide clinical duty eligibility.' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Give a reason when rejecting.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_clinical_duty_eligibilities
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         decided_by = (SELECT auth.uid()), decided_at = now(), decision_note = p_note
   WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That request is not pending.' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_hr_clinical_revoke(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_permission('hr.attendance.clinical.manage') THEN
    RAISE EXCEPTION 'You do not have permission to revoke clinical duty eligibility.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Give a reason for revoking.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.hr_clinical_duty_eligibilities
     SET status = 'revoked', revoked_by = (SELECT auth.uid()), revoked_at = now(), revoke_reason = p_reason
   WHERE id = p_id AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That grant is not active.' USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_hr_clinical_decide(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fn_hr_clinical_revoke(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_decide(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_hr_clinical_revoke(uuid, text) TO authenticated, service_role;

-- 7. RLS -----------------------------------------------------------------------------
-- Sites: HR managers write; managers and staff of that institution who are
-- eligible read.
CREATE POLICY hr_cds_select ON public.hr_clinical_duty_sites FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('hr.attendance.clinical.manage'))
    OR EXISTS (
         SELECT 1
         FROM unnest((SELECT public.fn_my_staff_ids())) AS sid,
              LATERAL public.fn_hr_clinical_allowed_sites(sid, CURRENT_DATE) a
         WHERE a.id = hr_clinical_duty_sites.id)
  );
CREATE POLICY hr_cds_write ON public.hr_clinical_duty_sites FOR ALL TO authenticated
  USING ((SELECT public.user_has_permission('hr.attendance.clinical.manage')))
  WITH CHECK ((SELECT public.user_has_permission('hr.attendance.clinical.manage')));

-- Eligibility: managers see/write all; staff see their own and may file ONE
-- pending staff-scope request for themselves. Decisions go through the RPCs.
CREATE POLICY hr_cde_select ON public.hr_clinical_duty_eligibilities FOR SELECT TO authenticated
  USING (
    (SELECT public.user_has_permission('hr.attendance.clinical.manage'))
    OR employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    OR requested_by = (SELECT auth.uid())
  );
CREATE POLICY hr_cde_insert ON public.hr_clinical_duty_eligibilities FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.user_has_permission('hr.attendance.clinical.manage'))
    OR (
      scope_type = 'staff'
      AND status = 'pending'
      AND granted_directly = false
      AND requested_by = (SELECT auth.uid())
      AND employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
      AND decided_by IS NULL AND decided_at IS NULL
    )
  );
CREATE POLICY hr_cde_update ON public.hr_clinical_duty_eligibilities FOR UPDATE TO authenticated
  USING ((SELECT public.user_has_permission('hr.attendance.clinical.manage')))
  WITH CHECK ((SELECT public.user_has_permission('hr.attendance.clinical.manage')));

-- Punches: read-only audit. Own rows, or managers / attendance viewers.
CREATE POLICY hr_cp_select ON public.hr_clinical_punches FOR SELECT TO authenticated
  USING (
    employee_id IN (SELECT unnest(public.fn_my_staff_ids()))
    OR (SELECT public.user_has_permission('hr.attendance.clinical.manage'))
    OR (SELECT public.user_has_permission('hr.attendance.view_all'))
  );

-- 8. Permission key + grants (the key means nothing until a role holds it) -----------
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('hr.attendance.clinical.manage', true)
 WHERE role_key IN ('hr_admin', 'hr_head', 'hr_manager') AND is_active;
