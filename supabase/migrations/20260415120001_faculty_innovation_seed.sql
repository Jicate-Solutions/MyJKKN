-- ============================================================================
-- Faculty Innovation Portfolio Module — Day-1 Retro-load Seed
-- Spec §7: Dr. P.K. Meena Priya's 3 clinical initiatives (2026-04-15 10:17 IST email)
-- Created: 2026-04-15
--
-- IDEMPOTENT — uses a deterministic UUID via md5() hash of the natural key
-- so re-running this migration never creates duplicates.
--
-- Applied learning #10: day-1 retro-load; module ships with real data.
-- ============================================================================

DO $$
DECLARE
  v_inventor_id     UUID := '4f2107c9-1485-4fab-abe8-567cf6145d7c'; -- Dr. P.K. Meena Priya
  v_institution_id  UUID;
  v_now             TIMESTAMPTZ := NOW();
BEGIN
  -- Resolve the inventor's institution_id from their profile (fail-safe)
  SELECT institution_id INTO v_institution_id
  FROM public.profiles
  WHERE id = v_inventor_id
  LIMIT 1;

  -- If profile or institution is missing, skip silently — safer than failing
  -- (e.g. on a fresh staging DB without this user yet).
  IF v_inventor_id IS NULL OR v_institution_id IS NULL THEN
    RAISE NOTICE 'Faculty Innovation seed skipped: inventor % or institution not found', v_inventor_id;
    RETURN;
  END IF;

  -- Seed 1: AIR — AI-assisted Interpretation of Radiographs ----------------
  INSERT INTO public.faculty_initiatives (
    id, institution_id, original_inventor_id, inventor_id,
    title, abstract, category, status,
    approval_authority, approval_sub_authority,
    clinical_details,
    source, source_note,
    created_by, updated_by,
    submitted_at, last_status_change_at, last_status_change_by
  )
  VALUES (
    -- Deterministic UUID from the title so re-runs are idempotent
    ('00000000-0000-0000-0000-' || substr(md5('fi-seed:AIR:' || v_inventor_id::text), 1, 12))::uuid,
    v_institution_id,
    v_inventor_id, v_inventor_id,
    'AIR — AI-assisted Interpretation of Radiographs',
    'Deep-learning model for automated interpretation of IOPA, OPG and TMJ radiographs. '
      || 'Validated using the AIR Index against expert radiologist ground-truth; demonstrates good diagnostic '
      || 'accuracy on a curated dental-imaging test set. Seeking institutional guidance on scaling across '
      || 'JKKN Dental College and neighboring dental clinics.',
    'clinical', 'under_review',
    'dean', 'liaison_' || v_institution_id::text,
    jsonb_build_object(
      'validation_methodology', 'AIR Index against radiologist ground-truth',
      'modality',               ARRAY['IOPA', 'OPG', 'TMJ'],
      'current_maturity',       'validated_prototype',
      'next_step',              'clinic_pilot'
    ),
    'retro_load',
    'Email 2026-04-15 10:17 IST — retro-loaded via faculty-innovation-module-spec §7.',
    v_inventor_id, v_inventor_id,
    v_now, v_now, v_inventor_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- Seed 2: Nico-Nivritti — Tobacco cessation app --------------------------
  INSERT INTO public.faculty_initiatives (
    id, institution_id, original_inventor_id, inventor_id,
    title, abstract, category, status,
    approval_authority, approval_sub_authority,
    clinical_details,
    source, source_note,
    created_by, updated_by,
    submitted_at, last_status_change_at, last_status_change_by
  )
  VALUES (
    ('00000000-0000-0000-0000-' || substr(md5('fi-seed:NicoNivritti:' || v_inventor_id::text), 1, 12))::uuid,
    v_institution_id,
    v_inventor_id, v_inventor_id,
    'Nico-Nivritti — AI-driven Tobacco Cessation Doctor-Patient App',
    'AI-powered mobile + web platform that pairs tobacco-using patients with trained counselors, '
      || 'delivers personalized cessation plans, tracks craving episodes and relapse signals, and routes '
      || 'high-risk cases to on-call clinicians. Currently in prototype stage; seeking institutional support '
      || 'for a supervised clinical pilot.',
    'clinical', 'under_review',
    'dean', 'liaison_' || v_institution_id::text,
    jsonb_build_object(
      'current_maturity', 'prototype',
      'target_users',     'patients + counselors + clinicians',
      'pilot_need',       'supervised_clinical_pilot',
      'modality',         'mobile + web'
    ),
    'retro_load',
    'Email 2026-04-15 10:17 IST — retro-loaded via faculty-innovation-module-spec §7.',
    v_inventor_id, v_inventor_id,
    v_now, v_now, v_inventor_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- Seed 3: Nicotine transdermal patch (provisional patent filed) ----------
  INSERT INTO public.faculty_initiatives (
    id, institution_id, original_inventor_id, inventor_id,
    title, abstract, category, status,
    approval_authority, approval_sub_authority,
    clinical_details, research_details,
    source, source_note,
    created_by, updated_by,
    submitted_at, last_status_change_at, last_status_change_by
  )
  VALUES (
    ('00000000-0000-0000-0000-' || substr(md5('fi-seed:NicotinePatch:' || v_inventor_id::text), 1, 12))::uuid,
    v_institution_id,
    v_inventor_id, v_inventor_id,
    'Personalized Nicotine Transdermal Patch',
    'Controlled-release personalised nicotine transdermal patch for tobacco cessation. '
      || 'Provisional patent filed. Requires MVP build and collaboration with JKKN College of Pharmacy for '
      || 'formulation, regulatory affairs, and human-factors design. Seeking Director-level endorsement for '
      || 'cross-college resource allocation.',
    'ip_bearing', 'under_review',
    'ip_cell', 'central',
    jsonb_build_object(
      'intended_use',     'tobacco_cessation',
      'delivery',         'transdermal_patch',
      'collab_need',      'JKKN_College_of_Pharmacy'
    ),
    jsonb_build_object(
      'ip_status',        'provisional_patent_filed',
      'collaborators',    ARRAY['JKKN College of Pharmacy'],
      'needs',            ARRAY['MVP build', 'Formulation partner', 'Regulatory review']
    ),
    'retro_load',
    'Email 2026-04-15 10:17 IST — retro-loaded via faculty-innovation-module-spec §7. '
      || 'Week-2: link ip_filings record with filing_type=patent_provisional, filing_status=filed.',
    v_inventor_id, v_inventor_id,
    v_now, v_now, v_inventor_id
  )
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Faculty Innovation seed complete: 3 initiatives for inventor % in institution %',
    v_inventor_id, v_institution_id;
END $$;

-- ============================================================================
-- END seed migration
-- ============================================================================
