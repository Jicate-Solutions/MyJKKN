-- ============================================================================
-- Migration: 20260902010000_id_card_validity_policy
-- Card validity becomes config, not a hardcoded date.
-- ============================================================================
-- Until now every printed card said "31 May <next year>", from a placeholder
-- in lib/id-cards/render-data.ts whose own comment admitted it was standing in
-- "until a dedicated id_card validity policy key exists". This is that key.
--
-- The Director's rules:
--   • a learner's card is valid for their WHOLE COURSE (batches.end_date)
--   • a team member's card is valid for the academic year
--   • a learner with no batch falls back to the yearly rule
--
-- Held as platform_policies rows (the ONE canonical config table) so a college
-- can be moved back to yearly learner cards without a deploy.
--
-- Idempotent. Safe to re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Seed the three global policy rows
-- ----------------------------------------------------------------------------
-- data_type must be one of ('number','string','boolean','array','object','enum')
-- per platform_policies_data_type_check. 'text'/'integer'/'jsonb' are rejected.
INSERT INTO public.platform_policies (
  policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system, is_active
) VALUES
  (
    'id_card.validity.learner_mode', 'global', NULL,
    to_jsonb('course_end'::TEXT),
    'How long a learner''s ID card is valid. course_end = until the course finishes (batches.end_date); yearly = until the academic-year end. Learners with no batch always fall back to yearly.',
    'enum', '["course_end","yearly"]'::jsonb, FALSE, TRUE
  ),
  (
    'id_card.validity.team_member_mode', 'global', NULL,
    to_jsonb('yearly'::TEXT),
    'How long a team member''s ID card is valid. Team-member cards are re-issued each academic year.',
    'enum', '["yearly"]'::jsonb, FALSE, TRUE
  ),
  (
    'id_card.validity.year_end_mmdd', 'global', NULL,
    to_jsonb('05-31'::TEXT),
    'Academic-year end as MM-DD. Drives the yearly rule: a card runs to the next occurrence of this date. Default 05-31 (academic years run June to May).',
    'string', NULL, FALSE, TRUE
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Reader function: fn_get_id_card_policy(uuid) — now returns `validity`
-- ----------------------------------------------------------------------------
-- CREATE OR REPLACE of the existing reader (20260507150000_id_card_substrate).
-- Everything it returned before is returned unchanged; `validity` is additive,
-- so a caller that predates this migration is unaffected.
CREATE OR REPLACE FUNCTION public.fn_get_id_card_policy(
  p_institution_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_printer_model            TEXT;
  v_sides                    INTEGER;
  v_ribbon_type              TEXT;
  v_magstripe_enabled        BOOLEAN;
  v_magstripe_hardware       BOOLEAN;
  v_chip_enabled             BOOLEAN;
  v_chip_hardware            BOOLEAN;
  v_rfid_enabled             BOOLEAN;
  v_rfid_hardware            BOOLEAN;
  v_station_endpoint_url     TEXT;
  v_photo_fallback           JSONB;
  v_learner_mode             TEXT;
  v_team_member_mode         TEXT;
  v_year_end_mmdd            TEXT;
BEGIN
  SELECT (value #>> '{}')::TEXT INTO v_printer_model
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.model' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::INTEGER INTO v_sides
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.sides' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::TEXT INTO v_ribbon_type
  FROM public.platform_policies
  WHERE policy_key = 'id_card.printer.ribbon_type' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_magstripe_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.magstripe_enabled' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_magstripe_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.magstripe_hardware_present' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_chip_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.chip_enabled' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_chip_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.chip_hardware_present' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_rfid_enabled
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.rfid_enabled' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::BOOLEAN INTO v_rfid_hardware
  FROM public.platform_policies
  WHERE policy_key = 'id_card.encoding.rfid_hardware_present' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT CASE WHEN value IS NULL OR value = 'null'::jsonb THEN NULL ELSE value #>> '{}' END
  INTO v_station_endpoint_url
  FROM public.platform_policies
  WHERE policy_key = 'id_card.station.endpoint_url' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT value INTO v_photo_fallback
  FROM public.platform_policies
  WHERE policy_key = 'id_card.photo_fallback' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  -- Card validity (2026-09-02). Same institution > global precedence.
  SELECT (value #>> '{}')::TEXT INTO v_learner_mode
  FROM public.platform_policies
  WHERE policy_key = 'id_card.validity.learner_mode' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::TEXT INTO v_team_member_mode
  FROM public.platform_policies
  WHERE policy_key = 'id_card.validity.team_member_mode' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  SELECT (value #>> '{}')::TEXT INTO v_year_end_mmdd
  FROM public.platform_policies
  WHERE policy_key = 'id_card.validity.year_end_mmdd' AND is_active = TRUE
    AND ((p_institution_id IS NOT NULL AND scope_type = 'institution' AND scope_id = p_institution_id) OR scope_type = 'global')
  ORDER BY CASE WHEN scope_type = 'institution' THEN 0 ELSE 1 END LIMIT 1;

  v_printer_model        := COALESCE(v_printer_model, 'primacy_2');
  v_sides                := COALESCE(v_sides, 2);
  v_ribbon_type          := COALESCE(v_ribbon_type, 'YMCKOK');
  v_magstripe_enabled    := COALESCE(v_magstripe_enabled, FALSE);
  v_magstripe_hardware   := COALESCE(v_magstripe_hardware, FALSE);
  v_chip_enabled         := COALESCE(v_chip_enabled, FALSE);
  v_chip_hardware        := COALESCE(v_chip_hardware, FALSE);
  v_rfid_enabled         := COALESCE(v_rfid_enabled, FALSE);
  v_rfid_hardware        := COALESCE(v_rfid_hardware, FALSE);
  v_photo_fallback       := COALESCE(v_photo_fallback, '["learners_profiles.student_photo_url","placeholder"]'::jsonb);
  -- Defaults ARE the Director's rules, so an unseeded database still behaves
  -- correctly rather than reverting to the old placeholder.
  v_learner_mode         := COALESCE(v_learner_mode, 'course_end');
  v_team_member_mode     := COALESCE(v_team_member_mode, 'yearly');
  v_year_end_mmdd        := COALESCE(v_year_end_mmdd, '05-31');

  v_result := jsonb_build_object(
    'printer_model',         v_printer_model,
    'sides',                 v_sides,
    'encoding', jsonb_build_object(
      'magstripe_enabled',           v_magstripe_enabled,
      'magstripe_hardware_present',  v_magstripe_hardware,
      'chip_enabled',                v_chip_enabled,
      'chip_hardware_present',       v_chip_hardware,
      'rfid_enabled',                v_rfid_enabled,
      'rfid_hardware_present',       v_rfid_hardware
    ),
    'station_endpoint_url',  v_station_endpoint_url,
    'ribbon_type',           v_ribbon_type,
    'photo_fallback',        v_photo_fallback,
    'validity', jsonb_build_object(
      'learner_mode',      v_learner_mode,
      'team_member_mode',  v_team_member_mode,
      'year_end_mmdd',     v_year_end_mmdd
    )
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_get_id_card_policy(UUID) IS
  'Returns the resolved ID card policy as JSONB with shape IdCardPolicy, including the card-validity rules. Scope precedence: institution > global.';

-- Standing rule: a SECURITY DEFINER function must lock anon explicitly.
-- The Supabase ALTER DEFAULT PRIVILEGES grant to anon is separate from PUBLIC,
-- so revoking PUBLIC alone leaves it callable with the public anon key.
REVOKE EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_get_id_card_policy(UUID) TO service_role;
