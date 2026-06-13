-- ============================================================================
-- 20260520160000 — capture_admission_lead: fall back to auth.uid() for
--                  changed_by when p_lead.created_by is missing
-- ============================================================================
-- Why: The RPC reads `v_user_id := NULLIF(p_lead->>'created_by', '')::UUID;`
-- and uses it as `changed_by` on the initial admission_lead_stage_history row
-- ("Moved to New"). But none of the callers pass `created_by` in p_lead:
--   - capture_gate_entry_lead passes `captured_by` but NOT `created_by`
--   - LeadService.captureLead (TS) builds p_lead from form data — also omits
-- Result: every fresh lead's first stage_history row has changed_by=NULL,
-- which the timeline renders as the literal text "System". Officers reading
-- the activity feed see "System moved this lead to New" instead of the real
-- author.
--
-- Fix: Wrap v_user_id assignment with COALESCE(..., auth.uid()) so the RPC
-- falls back to the calling session's authenticated UID when the caller
-- doesn't include `created_by` in the payload. This is safe because:
--   - p_lead.created_by, when present, takes precedence (existing callers
--     that DO pass it keep working unchanged)
--   - auth.uid() inside SECURITY DEFINER respects the calling session's JWT
--   - When the RPC is called outside an authenticated session (service_role,
--     direct psql), auth.uid() returns NULL — same as today's behaviour.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.capture_admission_lead(
  p_lead    JSONB,
  p_capture JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_institution_id   UUID;
  v_phone            TEXT;
  v_normalized       TEXT;
  v_existing         public.admission_leads%ROWTYPE;
  v_new              public.admission_leads%ROWTYPE;
  v_lead_id          UUID;
  v_capture_id       UUID;
  v_action           TEXT;
  v_reactivated      BOOLEAN := FALSE;
  v_user_id          UUID;
  v_campaign_link_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (
       public.is_super_admin()
       OR public.is_admin()
       OR public.user_has_permission('admission.leads.create')
     ) THEN
    RAISE EXCEPTION 'Insufficient permission to capture admission leads'
      USING ERRCODE = '42501';
  END IF;

  v_institution_id := (p_lead->>'institution_id')::UUID;
  v_phone          := p_lead->>'phone';
  -- 2026-05-20 fix: fall back to auth.uid() so the "Moved to New" stage
  -- history row carries the real author when the caller doesn't pass
  -- created_by (gate_entry RPC, captureLead TS). Without the COALESCE,
  -- changed_by was always NULL and the activity timeline rendered "System".
  v_user_id        := COALESCE(NULLIF(p_lead->>'created_by', '')::UUID, auth.uid());

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'institution_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'phone is required and must contain at least 10 digits'
      USING ERRCODE = '22023';
  END IF;

  v_normalized := right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 10);

  SELECT *
  INTO v_existing
  FROM public.admission_leads
  WHERE institution_id = v_institution_id
    AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 10) = v_normalized
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_lead_id := v_existing.id;
    v_action  := 'merged';

    IF v_existing.funnel_stage IN ('lost', 'dormant') THEN
      v_reactivated := TRUE;
      UPDATE public.admission_leads
      SET funnel_stage     = 'new'::public.funnel_stage,
          stage_changed_at = now(),
          previous_stage   = v_existing.funnel_stage,
          last_activity_at = now(),
          updated_at       = now()
      WHERE id = v_existing.id;
    END IF;

    UPDATE public.admission_leads
    SET last_activity_at = now(),
        updated_at       = now(),
        first_name   = COALESCE(NULLIF(first_name, ''), NULLIF(p_lead->>'first_name', '')),
        last_name    = COALESCE(last_name,              NULLIF(p_lead->>'last_name',  '')),
        email        = COALESCE(email,                  NULLIF(p_lead->>'email',       '')),
        parent_name  = COALESCE(parent_name,            NULLIF(p_lead->>'parent_name', '')),
        parent_phone = COALESCE(parent_phone,           NULLIF(p_lead->>'parent_phone', ''))
    WHERE id = v_existing.id;

  ELSE
    v_new := jsonb_populate_record(
      NULL::public.admission_leads,
      p_lead || jsonb_build_object(
        'created_at',     now(),
        'updated_at',     now(),
        'first_touch_at', COALESCE((p_lead->>'first_touch_at')::TIMESTAMPTZ, now()),
        'funnel_stage',   COALESCE((p_lead->>'funnel_stage')::public.funnel_stage, 'new'::public.funnel_stage),
        'is_hot_lead',    COALESCE((p_lead->>'is_hot_lead')::BOOLEAN, FALSE),
        'is_priority',    COALESCE((p_lead->>'is_priority')::BOOLEAN, FALSE),
        'score',          COALESCE((p_lead->>'score')::NUMERIC, 0),
        'is_active',      COALESCE((p_lead->>'is_active')::BOOLEAN, TRUE)
      )
    );

    INSERT INTO public.admission_leads (
      id, institution_id, email, phone, alternate_phone, date_of_birth,
      gender, address_line1, city, state, pincode, country,
      interested_programs, source, source_detail, referrer_id, publisher_id,
      funnel_stage, priority, score, engagement_score, quality_score,
      counselor_id, assigned_at, last_contact_at, next_followup_at,
      notes, tags, is_duplicate, duplicate_of, created_at, updated_at,
      created_by, is_hot_lead, is_priority, is_active, is_dormant, is_lost,
      district, parent_name, parent_phone, parent_email, parent_opted_in,
      assigned_counselor_id, ownership_mode, preferred_channel, preferred_campus,
      academic_year, entry_date, student_interest_level, parent_decision_status,
      last_activity_at, total_messages_sent, messages_this_week, last_message_at,
      stage, stage_changed_at, previous_stage, score_category, score_updated_at,
      combined_score, score_breakdown, conversion_probability,
      lost_reason, lost_at, dormant_at,
      learner_profile_id, degree_id, department_id, program_id, application_number,
      first_name, last_name,
      referral_type, referred_by_id, referred_by_name,
      expo_event_id, captured_by, wa_opt_in, wa_opt_in_at, wa_opt_in_source, wa_opt_out_at,
      first_touch_at, rescued_at, rescued_by, rescue_broadcast_id,
      twelfth_group, admission_year_id, alternative_programs, stall_id, visit_type
    ) VALUES (
      COALESCE(v_new.id, gen_random_uuid()),
      v_new.institution_id, v_new.email, v_new.phone, v_new.alternate_phone, v_new.date_of_birth,
      v_new.gender, v_new.address_line1, v_new.city, v_new.state, v_new.pincode, v_new.country,
      v_new.interested_programs, v_new.source, v_new.source_detail, v_new.referrer_id, v_new.publisher_id,
      v_new.funnel_stage, v_new.priority, v_new.score, v_new.engagement_score, v_new.quality_score,
      v_new.counselor_id, v_new.assigned_at, v_new.last_contact_at, v_new.next_followup_at,
      v_new.notes, v_new.tags, v_new.is_duplicate, v_new.duplicate_of, v_new.created_at, v_new.updated_at,
      v_new.created_by, v_new.is_hot_lead, v_new.is_priority, v_new.is_active, v_new.is_dormant, v_new.is_lost,
      v_new.district, v_new.parent_name, v_new.parent_phone, v_new.parent_email, v_new.parent_opted_in,
      v_new.assigned_counselor_id, v_new.ownership_mode, v_new.preferred_channel, v_new.preferred_campus,
      v_new.academic_year, v_new.entry_date, v_new.student_interest_level, v_new.parent_decision_status,
      v_new.last_activity_at, v_new.total_messages_sent, v_new.messages_this_week, v_new.last_message_at,
      v_new.stage, v_new.stage_changed_at, v_new.previous_stage, v_new.score_category, v_new.score_updated_at,
      v_new.combined_score, v_new.score_breakdown, v_new.conversion_probability,
      v_new.lost_reason, v_new.lost_at, v_new.dormant_at,
      v_new.learner_profile_id, v_new.degree_id, v_new.department_id, v_new.program_id, v_new.application_number,
      v_new.first_name, v_new.last_name,
      v_new.referral_type, v_new.referred_by_id, v_new.referred_by_name,
      v_new.expo_event_id, v_new.captured_by, v_new.wa_opt_in, v_new.wa_opt_in_at, v_new.wa_opt_in_source, v_new.wa_opt_out_at,
      v_new.first_touch_at, v_new.rescued_at, v_new.rescued_by, v_new.rescue_broadcast_id,
      v_new.twelfth_group, v_new.admission_year_id, v_new.alternative_programs, v_new.stall_id, v_new.visit_type
    )
    RETURNING id INTO v_lead_id;

    v_action := 'created';

    INSERT INTO public.admission_lead_stage_history
      (lead_id, from_stage, to_stage, changed_by, notes, created_at)
    VALUES (v_lead_id, NULL, 'new'::public.funnel_stage, v_user_id, NULL, now());
  END IF;

  v_campaign_link_id := NULLIF(p_capture->>'campaign_link_id', '')::uuid;

  -- Soft-validate: invalid/inactive link drops attribution but keeps the lead
  IF v_campaign_link_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.admission_campaign_links
        WHERE id = v_campaign_link_id AND is_active = true
     ) THEN
    v_campaign_link_id := NULL;
  END IF;

  INSERT INTO public.admission_lead_source_captures (
    lead_id, institution_id, source, source_detail,
    captured_at, captured_by, expo_event_id, stall_id,
    utm_source, utm_medium, utm_campaign, referrer_id,
    raw_payload, created_by, campaign_link_id
  ) VALUES (
    v_lead_id,
    v_institution_id,
    (p_capture->>'source')::public.lead_source,
    NULLIF(p_capture->>'source_detail', ''),
    COALESCE((p_capture->>'captured_at')::TIMESTAMPTZ, now()),
    NULLIF(p_capture->>'captured_by', '')::UUID,
    NULLIF(p_capture->>'expo_event_id', '')::UUID,
    NULLIF(p_capture->>'stall_id', '')::UUID,
    NULLIF(p_capture->>'utm_source', ''),
    NULLIF(p_capture->>'utm_medium', ''),
    NULLIF(p_capture->>'utm_campaign', ''),
    NULLIF(p_capture->>'referrer_id', '')::UUID,
    COALESCE(p_capture->'raw_payload', '{}'::JSONB),
    v_user_id,
    v_campaign_link_id
  )
  RETURNING id INTO v_capture_id;

  RETURN jsonb_build_object(
    'lead_id',          v_lead_id,
    'capture_id',       v_capture_id,
    'action',           v_action,
    'reactivated',      v_reactivated,
    'attributed_link',  v_campaign_link_id
  );
END;
$function$;
