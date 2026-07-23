-- ============================================================================
-- Migration: 20260606_hr_leave_part1_seeds
-- Wave 3 (M5a) — Seed 4 leave policies × 2 institutions (Part 1 of leave batch)
-- ============================================================================
-- HR Policy Manual replacement substrate: seed the first 4 of 7 leave policies
-- (Part 1: casual+outpass+permission, half-pay, compensatory, vacation).
-- Part 2 (M5b) will seed: medical, on_duty, special_leave.
--
-- Per Director lock (2026-05-15): scope_type='institution', is_system=true,
-- classification='major', publication_state='published'.
-- Director-tweakable via /admin/hr/policies/leave/* admin pages (this PR) —
-- no deploy needed.
--
-- Companion JSONB shapes: specs/hr-policy-jsonb-structures-2026-05-15.md
--   §19 — hr.leave.casual_outpass_permission
--   §20 — hr.leave.half_pay (Dental {"applies": false})
--   §21 — hr.leave.compensatory
--   §22 — hr.leave.vacation (per-institution × role_type)
--
-- TIER 0 — safe-additive (INSERT only with ON CONFLICT DO NOTHING).
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Resolve institution UUIDs once per migration run.
-- Engineering: matched by name LIKE '%Engineering%' (CET).
-- Dental:      matched by name LIKE '%Dental College%' (DCH).
-- Pattern mirrors 20260602_hr_institution_substrate_seeds.sql.
-- ---------------------------------------------------------------------------

DO $migration$
DECLARE
  v_engg_id UUID;
  v_dental_id UUID;
  v_expected_rows INT;
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
    RAISE EXCEPTION 'Cannot seed HR leave policies: neither Engineering nor Dental institution exists in public.institutions.';
  END IF;

  -- -------------------------------------------------------------------------
  -- 1. hr.leave.casual_outpass_permission (spec §19)
  --    Three logical sub-policies bundled into one row:
  --      casual_leave           — quota by working-days-per-week + grant rules
  --      outpass                — short campus exit during working hours
  --      permission_short_time_off — paid permission slots per month
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.casual_outpass_permission', 'institution', v_engg_id,
       jsonb_build_object(
         'casual_leave', jsonb_build_object(
           'quota_by_working_days_per_week', jsonb_build_object('6', 12, '5', 6, '4', 0),
           'max_per_request_days', 3,
           'advance_notice_days', 3,
           'requires_principal_approval_above_days', 2,
           'lapses_at_year_end', true,
           'carry_forward_allowed', false,
           'encashable', false,
           'lop_after_quota_exhausted', true,
           'eligible_after_probation', false,
           'eligible_during_probation', true,
           'sandwich_holidays_counted', false,
           'half_day_allowed', true,
           'prefix_suffix_holiday_allowed', true,
           'cannot_combine_with', jsonb_build_array('vacation', 'on_duty'),
           'min_service_months_to_avail', 0,
           'notes', 'CL granted on personal grounds; not encashable; not carried forward.'
         ),
         'outpass', jsonb_build_object(
           'allowed_per_month', 2,
           'max_duration_hours', 4,
           'requires_hod_approval', true,
           'deducted_from_casual_leave_if_exceeded', true,
           'must_return_same_day', true,
           'notes', 'Short campus exit during working hours for personal errands.'
         ),
         'permission_short_time_off', jsonb_build_object(
           'allowed_per_month', 2,
           'max_duration_hours', 2,
           'requires_hod_approval', true,
           'paid', true,
           'late_arrival_counted', true,
           'early_leaving_counted', true,
           'notes', 'Paid short permission slots (late arrival / early leaving / personal slot).'
         )
       ),
       'Engineering: casual leave + outpass + permission/short-time-off rules.',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.casual_outpass_permission', 'institution', v_dental_id,
       jsonb_build_object(
         'casual_leave', jsonb_build_object(
           'quota_by_working_days_per_week', jsonb_build_object('6', 12, '5', 6, '4', 0),
           'max_per_request_days', 3,
           'advance_notice_days', 3,
           'requires_principal_approval_above_days', 2,
           'lapses_at_year_end', true,
           'carry_forward_allowed', false,
           'encashable', false,
           'lop_after_quota_exhausted', true,
           'eligible_after_probation', false,
           'eligible_during_probation', true,
           'sandwich_holidays_counted', false,
           'half_day_allowed', true,
           'prefix_suffix_holiday_allowed', true,
           'cannot_combine_with', jsonb_build_array('vacation', 'on_duty'),
           'min_service_months_to_avail', 0,
           'notes', 'CL granted on personal grounds; not encashable; not carried forward.'
         ),
         'outpass', jsonb_build_object(
           'allowed_per_month', 2,
           'max_duration_hours', 4,
           'requires_hod_approval', true,
           'deducted_from_casual_leave_if_exceeded', true,
           'must_return_same_day', true,
           'notes', 'Short campus exit during working hours for personal errands.'
         ),
         'permission_short_time_off', jsonb_build_object(
           'allowed_per_month', 2,
           'max_duration_hours', 2,
           'requires_hod_approval', true,
           'paid', true,
           'late_arrival_counted', true,
           'early_leaving_counted', true,
           'notes', 'Paid short permission slots (late arrival / early leaving / personal slot).'
         )
       ),
       'Dental: casual leave + outpass + permission/short-time-off rules.',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. hr.leave.half_pay (spec §20)
  --    Engineering-only per Director lock: Dental row {"applies": false}.
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.half_pay', 'institution', v_engg_id,
       jsonb_build_object(
         'applies', true,
         'days_per_year', 6,
         'min_service_years_to_avail', 1,
         'requires_principal_approval', true,
         'commutable_to_full_pay_with_medical_cert', true,
         'carry_forward_allowed', true,
         'carry_forward_max_days', 30,
         'encashable_at_retirement', true,
         'eligible_for_teaching', true,
         'eligible_for_non_teaching', true,
         'notes', 'Half-pay leave: 50%% salary; commutable to full pay against medical certificate.'
       ),
       'Engineering: half-pay leave rules (6 days/year; commutable on medical cert).',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.half_pay', 'institution', v_dental_id,
       jsonb_build_object(
         'applies', false,
         'notes', 'Half-pay leave does not apply at JKKN Dental College (Director lock 2026-05-15).'
       ),
       'Dental: half-pay leave does not apply.',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. hr.leave.compensatory (spec §21)
  --    Institution-scope per Director lock.
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.compensatory', 'institution', v_engg_id,
       jsonb_build_object(
         'ratio_per_holiday_worked', 1,
         'expiry_months', 3,
         'fractional_allowed', false,
         'requires_pre_approval', true,
         'requires_principal_approval', true,
         'eligible_for_teaching', true,
         'eligible_for_non_teaching', true,
         'min_hours_worked_to_qualify', 6,
         'cannot_combine_with', jsonb_build_array('casual_leave'),
         'lapses_after_expiry', true,
         'encashable', false,
         'notes', 'Comp-off granted 1:1 for full working day on a designated holiday; expires in 3 months.'
       ),
       'Engineering: compensatory off rules (1:1 ratio; 3-month expiry).',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.compensatory', 'institution', v_dental_id,
       jsonb_build_object(
         'ratio_per_holiday_worked', 1,
         'expiry_months', 3,
         'fractional_allowed', false,
         'requires_pre_approval', true,
         'requires_principal_approval', true,
         'eligible_for_teaching', true,
         'eligible_for_non_teaching', true,
         'min_hours_worked_to_qualify', 6,
         'cannot_combine_with', jsonb_build_array('casual_leave'),
         'lapses_after_expiry', true,
         'encashable', false,
         'notes', 'Comp-off granted 1:1 for full working day on a designated holiday; expires in 3 months.'
       ),
       'Dental: compensatory off rules (1:1 ratio; 3-month expiry).',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. hr.leave.vacation (spec §22)
  --    Per-institution × role_type variants.
  --    Engineering: teaching=14, non_teaching=14.
  --    Dental:      teaching=7,  non_teaching=7.
  -- -------------------------------------------------------------------------
  IF v_engg_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.vacation', 'institution', v_engg_id,
       jsonb_build_object(
         'summer_winter_as_semester_vacations', true,
         'by_role_type', jsonb_build_object(
           'teaching', jsonb_build_object(
             'days_per_year', 14,
             'must_be_taken_in_official_vacation_window', true,
             'split_across_summer_winter_allowed', true,
             'principal_approval_required', true,
             'attendance_during_window_mandatory_if_assigned', true,
             'encashable', false,
             'carry_forward_allowed', false,
             'notes', 'Faculty vacation aligned with official semester breaks.'
           ),
           'non_teaching', jsonb_build_object(
             'days_per_year', 14,
             'must_be_taken_in_official_vacation_window', false,
             'split_across_summer_winter_allowed', true,
             'principal_approval_required', true,
             'attendance_during_window_mandatory_if_assigned', true,
             'encashable', false,
             'carry_forward_allowed', false,
             'notes', 'Non-teaching staff vacation; scheduled by HOD.'
           )
         )
       ),
       'Engineering: annual vacation rules (teaching=14, non_teaching=14).',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  IF v_dental_id IS NOT NULL THEN
    INSERT INTO public.platform_policies
      (policy_key, scope_type, scope_id, value, description, data_type, is_system,
       classification, publication_state)
    VALUES
      ('hr.leave.vacation', 'institution', v_dental_id,
       jsonb_build_object(
         'summer_winter_as_semester_vacations', false,
         'by_role_type', jsonb_build_object(
           'teaching', jsonb_build_object(
             'days_per_year', 7,
             'must_be_taken_in_official_vacation_window', true,
             'split_across_summer_winter_allowed', false,
             'principal_approval_required', true,
             'attendance_during_window_mandatory_if_assigned', true,
             'encashable', false,
             'carry_forward_allowed', false,
             'notes', 'Dental faculty vacation; shorter window vs semester-based institutions.'
           ),
           'non_teaching', jsonb_build_object(
             'days_per_year', 7,
             'must_be_taken_in_official_vacation_window', false,
             'split_across_summer_winter_allowed', false,
             'principal_approval_required', true,
             'attendance_during_window_mandatory_if_assigned', true,
             'encashable', false,
             'carry_forward_allowed', false,
             'notes', 'Dental non-teaching staff vacation; scheduled by HOD.'
           )
         )
       ),
       'Dental: annual vacation rules (teaching=7, non_teaching=7).',
       'object', true, 'major', 'published')
    ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;
  END IF;

  -- -------------------------------------------------------------------------
  -- Smoke test: count seeded rows. Expected = 8 (4 keys × 2 institutions),
  -- but if either institution UUID was NULL we still pass with the count
  -- matching the institutions that WERE resolved (each contributes 4 rows).
  -- -------------------------------------------------------------------------
  v_expected_rows := 0;
  IF v_engg_id IS NOT NULL THEN
    v_expected_rows := v_expected_rows + 4;
  END IF;
  IF v_dental_id IS NOT NULL THEN
    v_expected_rows := v_expected_rows + 4;
  END IF;

  SELECT COUNT(*)
    INTO v_actual_rows
    FROM public.platform_policies
    WHERE policy_key IN (
      'hr.leave.casual_outpass_permission',
      'hr.leave.half_pay',
      'hr.leave.compensatory',
      'hr.leave.vacation'
    )
    AND scope_type = 'institution'
    AND scope_id IN (
      COALESCE(v_engg_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(v_dental_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  IF v_actual_rows < v_expected_rows THEN
    RAISE EXCEPTION 'HR leave part-1 seed smoke test FAILED: expected at least % rows but got %', v_expected_rows, v_actual_rows;
  END IF;

  RAISE NOTICE 'HR leave part-1 seeds: % policy rows present across % institution(s).', v_actual_rows, v_expected_rows / 4;
END $migration$;
