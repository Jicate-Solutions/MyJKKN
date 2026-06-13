-- create_lead_activity: single-round-trip activity writer for the admission lead
-- detail page. Replaces the client's 3 serial calls (auth.getUser + INSERT under
-- RLS + a separate admission_leads UPDATE through the heavy adm_leads_update RLS).
-- SECURITY DEFINER so the lead activity-timestamp bump bypasses the expensive
-- per-row RLS, but it FIRST re-checks authorization, mirroring the activity-table
-- policy adm_lead_activities_all (super-admin / admin / admission.leads.view).
-- auth.uid() is the CALLER even under SECURITY DEFINER (it reads the request JWT).
CREATE OR REPLACE FUNCTION public.create_lead_activity(
  p_lead_id uuid,
  p_activity_type text,
  p_subject text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS public.admission_lead_activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_row public.admission_lead_activities;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('admission.leads.view')) THEN
    RAISE EXCEPTION 'not authorized to log lead activities'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admission_lead_activities
    (lead_id, activity_type, subject, description, outcome, scheduled_at, created_by)
  VALUES
    (p_lead_id, p_activity_type, p_subject, p_description, p_outcome, p_scheduled_at, v_uid)
  RETURNING * INTO v_row;

  -- Bump activity timestamps on the lead in the SAME call. last_contact_at only
  -- for genuine contact activities (matches the prior client-side gate).
  UPDATE public.admission_leads
     SET last_activity_at = v_now,
         updated_at       = v_now,
         last_contact_at  = CASE
           WHEN p_activity_type IN ('call','email','meeting','sms','whatsapp') THEN v_now
           ELSE last_contact_at
         END
   WHERE id = p_lead_id;

  RETURN v_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_lead_activity(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_lead_activity(uuid, text, text, text, text, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
