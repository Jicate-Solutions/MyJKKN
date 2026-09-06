-- Add p_admission_year_id to the gate-entry capture RPC so the kiosk can record the
-- (auto-detected, editable) admission year. Threaded into p_lead, which
-- capture_admission_lead already persists. DROP+CREATE because adding an arg changes
-- the function signature; grants re-applied to match the prior (anon/authenticated/service_role).
DROP FUNCTION IF EXISTS public.capture_gate_entry_lead(text, text, uuid, text, uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.capture_gate_entry_lead(
    p_first_name      text,
    p_phone           text,
    p_institution_id  uuid,
    p_last_name       text DEFAULT NULL::text,
    p_program_id      uuid DEFAULT NULL::uuid,
    p_referral_type   text DEFAULT NULL::text,
    p_referred_by_id  uuid DEFAULT NULL::uuid,
    p_referred_by_name text DEFAULT NULL::text,
    p_admission_year_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_result  jsonb;
BEGIN
    IF v_user_id IS NULL OR NOT (
        public.is_super_admin()
        OR public.is_admin(v_user_id)
        OR public.user_has_permission('admission.gate_entry.create')
        OR public.user_has_permission('admission.leads.create')
    ) THEN
        RAISE EXCEPTION 'Insufficient permission to log gate entry'
            USING ERRCODE = '42501';
    END IF;

    IF p_institution_id IS NULL THEN
        RAISE EXCEPTION 'institution_id is required' USING ERRCODE = '23502';
    END IF;
    IF p_first_name IS NULL OR length(trim(p_first_name)) = 0 THEN
        RAISE EXCEPTION 'first_name is required' USING ERRCODE = '23502';
    END IF;
    IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
        RAISE EXCEPTION 'phone is required' USING ERRCODE = '23502';
    END IF;

    v_result := public.capture_admission_lead(
        p_lead := jsonb_build_object(
            'first_name',       trim(p_first_name),
            'last_name',        NULLIF(trim(COALESCE(p_last_name, '')), ''),
            'phone',            trim(p_phone),
            'institution_id',   p_institution_id,
            'source',           'walk_in',
            'program_id',       p_program_id,
            'admission_year_id', p_admission_year_id,
            'referral_type',    p_referral_type,
            'referred_by_id',   p_referred_by_id,
            'referred_by_name', p_referred_by_name,
            'captured_by',      v_user_id
        ),
        p_capture := jsonb_build_object(
            'source',       'gate_entry',
            'captured_by',  v_user_id,
            'captured_at',  now(),
            'raw_payload',  jsonb_build_object('via', 'gate-entry-form')
        )
    );

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.capture_gate_entry_lead(text, text, uuid, text, uuid, text, uuid, text, uuid)
  TO anon, authenticated, service_role;
