-- ============================================================================
-- Migration: 20260602_hr_institution_substrate_seeds
-- Wave 3 (M1) — Seed 5 institutional HR policies × 2 institutions
-- ============================================================================
-- HR Policy Manual replacement substrate: surface 5 chapters of the printed
-- staff manual (institution meta, facilities, cadres, working schedule,
-- welfare activities) as JSONB rows in `platform_policies`, scoped per
-- institution. Director-tweakable via /admin/hr/policies/* admin pages
-- (shipped in this PR) — no deploy needed.
--
-- Per Director lock (2026-05-15): scope_type='institution', is_system=true.
-- Seeds Engineering + Dental institutions matched by name LIKE pattern (the
-- same pattern used by 20260417000001_compliance_unification_substrate.sql).
--
-- TIER 0 — safe-additive (INSERT only with ON CONFLICT DO NOTHING).
-- Idempotent. Safe to re-apply.
--
-- Companion: lib/policies/keys.ts adds 5 new POLICY_KEYS entries (in a sibling
-- W3-M0 PR). Pages reference policy_keys via string literals during the
-- consolidation window; cleanup PR after M0 lands flips them to constants.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Resolve institution UUIDs once per migration run.
-- Engineering: matched by name LIKE '%Engineering%' (CET — College of
--   Engineering and Technology). Dental: '%Dental College%' (DCH).
-- ---------------------------------------------------------------------------

DO $migration$
DECLARE
  v_engg_id UUID;
  v_dental_id UUID;
  v_inserted INT;
  v_expected_rows INT := 10; -- 5 policy_keys × 2 institutions
  v_actual_rows INT;
BEGIN
  SELECT id INTO v_engg_id
    FROM public.institutions
    WHERE name ILIKE '%Engineering%'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  SELECT id INTO v_dental_id
    FROM public.institutions
    WHERE name ILIKE '%Dental College%'
    ORDER BY created_at ASC NULLS LAST
    LIMIT 1;

  IF v_engg_id IS NULL THEN
    RAISE WARNING 'Engineering institution not found by name LIKE %%Engineering%%; skipping ENGG seeds. Backfill manually once row exists.';
  END IF;
  IF v_dental_id IS NULL THEN
    RAISE WARNING 'Dental institution not found by name LIKE %%Dental College%%; skipping DENTAL seeds. Backfill manually once row exists.';
  END IF;

  IF v_engg_id IS NULL AND v_dental_id IS NULL THEN
    RAISE EXCEPTION 'Cannot seed HR institutional policies: neither Engineering nor Dental institution exists in public.institutions.';
  END IF;

  -- -------------------------------------------------------------------------
  -- 1. hr.institution_meta (spec §1)
  --    { name, vision_text, mission_text, contact: { email, mobile },
  --      address, doc_refs: {...}, manual_meta: {...} }
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.institution_meta', 'institution', v_engg_id,
       jsonb_build_object(
         'name', 'JKKN College of Engineering and Technology',
         'vision_text', 'To be a globally recognised institution that nurtures engineering professionals committed to social progress and ethical leadership.',
         'mission_text', 'Provide quality technical education, foster research, instil entrepreneurship and produce industry-ready engineers grounded in values.',
         'contact', jsonb_build_object('email', 'principal.cet@jkkn.ac.in', 'mobile', '+91-4288-274744'),
         'address', 'Kumarapalayam, Namakkal District, Tamil Nadu - 638183',
         'doc_refs', jsonb_build_object('staff_manual', 'JKKN-CET-Staff-Manual-v2024', 'iso_cert', 'ISO-9001-2015'),
         'manual_meta', jsonb_build_object('approved_by', 'Principal', 'approved_on', '2024-06-01', 'review_cycle_years', 2)
       ),
       'Engineering: institution-level metadata (name, vision, mission, contact, manual refs).',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.institution_meta', 'institution', v_dental_id,
       jsonb_build_object(
         'name', 'JKKN Dental College and Hospital',
         'vision_text', 'To deliver world-class dental education and oral healthcare grounded in compassion, evidence and lifelong learning.',
         'mission_text', 'Train competent, ethical dental professionals; advance oral-health research; serve rural communities through outreach clinics.',
         'contact', jsonb_build_object('email', 'principal.dch@jkkn.ac.in', 'mobile', '+91-4288-274745'),
         'address', 'Kumarapalayam, Namakkal District, Tamil Nadu - 638183',
         'doc_refs', jsonb_build_object('staff_manual', 'JKKN-DCH-Staff-Manual-v2024', 'dci_recognition', 'DCI-Approved'),
         'manual_meta', jsonb_build_object('approved_by', 'Principal', 'approved_on', '2024-07-15', 'review_cycle_years', 2)
       ),
       'Dental: institution-level metadata (name, vision, mission, contact, manual refs).',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. hr.facilities (spec §3)
  --    { library, digital_library, transport, medical, canteen, mess }
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.facilities', 'institution', v_engg_id,
       jsonb_build_object(
         'library',         jsonb_build_object('exists', true, 'volumes', 45000, 'hours', '08:00-20:00'),
         'digital_library', jsonb_build_object('exists', true, 'seats', 120, 'subscriptions', jsonb_build_array('IEEE', 'ASME', 'DELNET')),
         'transport',       jsonb_build_object('available', true, 'routes', 28, 'staff_eligible', true),
         'medical',         jsonb_build_object('on_campus_clinic', true, 'doctor_visiting_days', jsonb_build_array('Mon','Wed','Fri')),
         'canteen',         jsonb_build_object('exists', true, 'subsidised', true, 'hours', '07:30-19:00'),
         'mess',            jsonb_build_object('exists', true, 'veg_only', false, 'monthly_charge_inr', 3200)
       ),
       'Engineering: campus facilities surfaced to staff (library, transport, medical, canteen, mess).',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.facilities', 'institution', v_dental_id,
       jsonb_build_object(
         'library',         jsonb_build_object('exists', true, 'volumes', 18000, 'hours', '08:30-18:30'),
         'digital_library', jsonb_build_object('exists', true, 'seats', 60, 'subscriptions', jsonb_build_array('PubMed', 'ScienceDirect', 'Cochrane')),
         'transport',       jsonb_build_object('available', true, 'routes', 12, 'staff_eligible', true),
         'medical',         jsonb_build_object('on_campus_clinic', true, 'doctor_visiting_days', jsonb_build_array('Tue','Thu','Sat')),
         'canteen',         jsonb_build_object('exists', true, 'subsidised', true, 'hours', '08:00-18:00'),
         'mess',            jsonb_build_object('exists', false, 'veg_only', true, 'monthly_charge_inr', null)
       ),
       'Dental: campus facilities surfaced to staff (library, transport, medical, canteen, mess).',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. hr.cadres (spec §17)
  --    { teaching_cadres, supporting_technical_cadres, non_technical_cadres }
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.cadres', 'institution', v_engg_id,
       jsonb_build_object(
         'teaching_cadres', jsonb_build_array(
           jsonb_build_object('name', 'Professor', 'min_qualification', 'PhD', 'years_experience', 10),
           jsonb_build_object('name', 'Associate Professor', 'min_qualification', 'PhD', 'years_experience', 6),
           jsonb_build_object('name', 'Assistant Professor', 'min_qualification', 'M.E./M.Tech', 'years_experience', 0)
         ),
         'supporting_technical_cadres', jsonb_build_array(
           jsonb_build_object('name', 'Lab Technician', 'min_qualification', 'Diploma', 'years_experience', 0),
           jsonb_build_object('name', 'System Administrator', 'min_qualification', 'B.E./MCA', 'years_experience', 2),
           jsonb_build_object('name', 'Workshop Instructor', 'min_qualification', 'ITI/Diploma', 'years_experience', 1)
         ),
         'non_technical_cadres', jsonb_build_array(
           jsonb_build_object('name', 'Office Assistant', 'min_qualification', '12th Pass', 'years_experience', 0),
           jsonb_build_object('name', 'Accountant', 'min_qualification', 'B.Com', 'years_experience', 2),
           jsonb_build_object('name', 'Driver', 'min_qualification', 'LMV License', 'years_experience', 1)
         )
       ),
       'Engineering: faculty + supporting + non-technical cadre definitions and entry criteria.',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.cadres', 'institution', v_dental_id,
       jsonb_build_object(
         'teaching_cadres', jsonb_build_array(
           jsonb_build_object('name', 'Professor', 'min_qualification', 'MDS + PhD', 'years_experience', 10),
           jsonb_build_object('name', 'Reader', 'min_qualification', 'MDS', 'years_experience', 5),
           jsonb_build_object('name', 'Senior Lecturer', 'min_qualification', 'MDS', 'years_experience', 3),
           jsonb_build_object('name', 'Lecturer', 'min_qualification', 'MDS', 'years_experience', 0)
         ),
         'supporting_technical_cadres', jsonb_build_array(
           jsonb_build_object('name', 'Dental Hygienist', 'min_qualification', 'DDH', 'years_experience', 0),
           jsonb_build_object('name', 'Dental Lab Technician', 'min_qualification', 'Diploma', 'years_experience', 1),
           jsonb_build_object('name', 'Radiographer', 'min_qualification', 'DMRT', 'years_experience', 1)
         ),
         'non_technical_cadres', jsonb_build_array(
           jsonb_build_object('name', 'Receptionist', 'min_qualification', '12th Pass', 'years_experience', 0),
           jsonb_build_object('name', 'Accountant', 'min_qualification', 'B.Com', 'years_experience', 2),
           jsonb_build_object('name', 'Housekeeping Supervisor', 'min_qualification', '10th Pass', 'years_experience', 2)
         )
       ),
       'Dental: faculty + supporting + non-technical cadre definitions and entry criteria.',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. hr.working_schedule (spec §18)
  --    { working_days_per_week, by_role_type: { teaching, non_teaching },
  --      extra_time_loyalty_expected }
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.working_schedule', 'institution', v_engg_id,
       jsonb_build_object(
         'working_days_per_week', 6,
         'by_role_type', jsonb_build_object(
           'teaching', jsonb_build_object(
             'start_time', '08:30', 'end_time', '16:30',
             'lunch_break_minutes', 45,
             'class_load_hours_per_week', 18,
             'office_hours_required', true
           ),
           'non_teaching', jsonb_build_object(
             'start_time', '08:30', 'end_time', '17:00',
             'lunch_break_minutes', 30
           )
         ),
         'extra_time_loyalty_expected', true,
         'second_saturday_holiday', true
       ),
       'Engineering: standard working schedule by role type, with extra-time loyalty expectation.',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.working_schedule', 'institution', v_dental_id,
       jsonb_build_object(
         'working_days_per_week', 6,
         'by_role_type', jsonb_build_object(
           'teaching', jsonb_build_object(
             'start_time', '09:00', 'end_time', '17:00',
             'lunch_break_minutes', 45,
             'clinical_hours_per_week', 24,
             'office_hours_required', true
           ),
           'non_teaching', jsonb_build_object(
             'start_time', '08:30', 'end_time', '17:00',
             'lunch_break_minutes', 30
           )
         ),
         'extra_time_loyalty_expected', true,
         'second_saturday_holiday', true
       ),
       'Dental: standard working schedule by role type (faculty have clinical hours), extra-time expectation.',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 5. hr.welfare_activities (spec §33)
  --    { celebrations, annual_health_checkup, other_activities }
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.welfare_activities', 'institution', v_engg_id,
       jsonb_build_object(
         'celebrations', jsonb_build_array(
           jsonb_build_object('name', 'Teachers Day', 'month', 9, 'mandatory', true),
           jsonb_build_object('name', 'Annual Day', 'month', 2, 'mandatory', true),
           jsonb_build_object('name', 'Pongal', 'month', 1, 'mandatory', true),
           jsonb_build_object('name', 'Independence Day', 'month', 8, 'mandatory', true),
           jsonb_build_object('name', 'Republic Day', 'month', 1, 'mandatory', true)
         ),
         'annual_health_checkup', true,
         'other_activities', jsonb_build_array(
           jsonb_build_object('name', 'Yoga Day', 'frequency', 'annual'),
           jsonb_build_object('name', 'Family Picnic', 'frequency', 'annual'),
           jsonb_build_object('name', 'Birthday Celebration', 'frequency', 'monthly')
         )
       ),
       'Engineering: staff welfare and engagement calendar (celebrations, health-checkup, other).',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system)
    VALUES
      ('hr.welfare_activities', 'institution', v_dental_id,
       jsonb_build_object(
         'celebrations', jsonb_build_array(
           jsonb_build_object('name', 'Dentists Day', 'month', 3, 'mandatory', true),
           jsonb_build_object('name', 'Annual Day', 'month', 2, 'mandatory', true),
           jsonb_build_object('name', 'Pongal', 'month', 1, 'mandatory', true),
           jsonb_build_object('name', 'Independence Day', 'month', 8, 'mandatory', true),
           jsonb_build_object('name', 'Republic Day', 'month', 1, 'mandatory', true)
         ),
         'annual_health_checkup', true,
         'other_activities', jsonb_build_array(
           jsonb_build_object('name', 'Oral Health Camp', 'frequency', 'quarterly'),
           jsonb_build_object('name', 'Staff Picnic', 'frequency', 'annual'),
           jsonb_build_object('name', 'Birthday Celebration', 'frequency', 'monthly')
         )
       ),
       'Dental: staff welfare and engagement calendar (celebrations, health-checkup, other).',
       'object', true)
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- Smoke test: count seeded rows. Expected = 10 (5 keys × 2 institutions),
  -- but if either institution UUID was NULL we still pass with the count
  -- matching the institutions that WERE resolved (each contributes 5 rows).
  -- -------------------------------------------------------------------------
  v_expected_rows := 0;
  IF v_engg_id IS NOT NULL THEN
    v_expected_rows := v_expected_rows + 5;
  END IF;
  IF v_dental_id IS NOT NULL THEN
    v_expected_rows := v_expected_rows + 5;
  END IF;

  SELECT COUNT(*)
    INTO v_actual_rows
    FROM public.platform_policies
    WHERE policy_key IN (
      'hr.institution_meta',
      'hr.facilities',
      'hr.cadres',
      'hr.working_schedule',
      'hr.welfare_activities'
    )
    AND scope_type = 'institution'
    AND scope_id IN (
      COALESCE(v_engg_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(v_dental_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  IF v_actual_rows < v_expected_rows THEN
    RAISE EXCEPTION 'HR institutional seed smoke test FAILED: expected at least % rows but got %', v_expected_rows, v_actual_rows;
  END IF;

  RAISE NOTICE 'HR institutional seeds: % policy rows present across % institution(s).', v_actual_rows, v_expected_rows / 5;
END $migration$;
