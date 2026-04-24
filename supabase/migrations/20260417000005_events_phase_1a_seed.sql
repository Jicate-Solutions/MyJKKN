-- ============================================================================
-- General Events Module — Phase 1A, Migration 5 of 5
-- File: 20260417000005_events_phase_1a_seed.sql
-- Purpose: Seed 12 event categories + 'Creative Asset' resource sub-category + 5 retro-load events
-- Spec: specs/myjkkn-events-module-spec-v2-resource-first.md (decisions Q17, Q19, retro-load section)
-- Date: 2026-04-17
-- Idempotency: ON CONFLICT DO NOTHING on (slug) where applicable; check existence on others
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A. Seed 12 event categories (full chat-derived taxonomy)
-- ----------------------------------------------------------------------------

INSERT INTO public.event_categories (
  id, name, slug, description,
  approval_chain_template, required_docs_config,
  default_visibility, default_od_trigger, default_cap_behavior,
  priority_order, is_active
)
VALUES
  -- Cultural / festival
  (gen_random_uuid(), 'Festival / Cultural', 'festival',
   'Cultural festivals, fests, celebrations (Pongal, Onam, Annual Day, Sarvam Galatta)',
   '[{"role":"hod","step":1},{"role":"principal","step":2},{"role":"coo","step":3}]'::jsonb,
   '{"pre":["poster","budget"],"post":["attendance_count","photos","feedback_summary"]}'::jsonb,
   'all_jkkn', false, 'waitlist', 10, true),

  -- Seminar / workshop
  (gen_random_uuid(), 'Seminar / Workshop', 'seminar_workshop',
   'Academic seminars, technical workshops, webinars',
   '[{"role":"hod","step":1},{"role":"principal","step":2}]'::jsonb,
   '{"pre":["poster","speaker_cv","budget"],"post":["attendance_count","photos","feedback_summary","social_links"]}'::jsonb,
   'institution', true, 'waitlist', 20, true),

  -- Guest lecture
  (gen_random_uuid(), 'Guest Lecture', 'guest_lecture',
   'Invited guest talks by industry experts, alumni, academics',
   '[{"role":"hod","step":1},{"role":"principal","step":2}]'::jsonb,
   '{"pre":["poster","speaker_cv","speaker_consent"],"post":["attendance_count","photos","feedback_summary"]}'::jsonb,
   'institution', true, 'waitlist', 30, true),

  -- Exhibition / expo
  (gen_random_uuid(), 'Exhibition / Expo', 'exhibition',
   'Project exhibitions, science expos, admission expos, showcases',
   '[{"role":"hod","step":1},{"role":"principal","step":2},{"role":"coo","step":3}]'::jsonb,
   '{"pre":["poster","budget","floor_plan"],"post":["attendance_count","photos","stall_list"]}'::jsonb,
   'public', false, 'allow_overflow', 40, true),

  -- Graduation / convocation
  (gen_random_uuid(), 'Graduation / Convocation', 'graduation',
   'Convocations, valedictory functions, graduation ceremonies',
   '[{"role":"principal","step":1},{"role":"coo","step":2},{"role":"ceo","step":3},{"role":"md","step":4}]'::jsonb,
   '{"pre":["poster","budget","invitee_list","chief_guest_consent"],"post":["attendance_count","photos","speech_archive"]}'::jsonb,
   'public', false, 'strict_cap', 50, true),

  -- Competition / contest
  (gen_random_uuid(), 'Competition / Contest', 'competition',
   'Contests, hackathons, debates, quizzes, judging events',
   '[{"role":"hod","step":1},{"role":"principal","step":2}]'::jsonb,
   '{"pre":["poster","rules","judges_list","budget"],"post":["attendance_count","photos","results","feedback_summary"]}'::jsonb,
   'institution', true, 'strict_cap', 60, true),

  -- Alumni
  (gen_random_uuid(), 'Alumni', 'alumni',
   'Alumni meets, alumni insights talks, reunions',
   '[{"role":"hod","step":1},{"role":"principal","step":2},{"role":"coo","step":3}]'::jsonb,
   '{"pre":["poster","invitee_list","budget"],"post":["attendance_count","photos","alumni_list","feedback_summary"]}'::jsonb,
   'all_jkkn', false, 'waitlist', 70, true),

  -- Inauguration / launch
  (gen_random_uuid(), 'Inauguration / Launch', 'inauguration',
   'New facility/program/initiative launches, foundation stones, ribbon cuttings',
   '[{"role":"principal","step":1},{"role":"coo","step":2},{"role":"ceo","step":3},{"role":"md","step":4}]'::jsonb,
   '{"pre":["poster","budget","invitee_list","chief_guest_consent"],"post":["attendance_count","photos","press_release"]}'::jsonb,
   'public', false, 'allow_overflow', 80, true),

  -- Orientation / induction
  (gen_random_uuid(), 'Orientation / Induction', 'orientation',
   'Freshers orientation, induction programs, onboarding events',
   '[{"role":"hod","step":1},{"role":"principal","step":2}]'::jsonb,
   '{"pre":["agenda","speaker_list","budget"],"post":["attendance_count","photos","feedback_summary"]}'::jsonb,
   'institution', false, 'allow_overflow', 90, true),

  -- Award / recognition
  (gen_random_uuid(), 'Award / Recognition', 'award',
   'Award ceremonies, prize distributions, felicitations',
   '[{"role":"principal","step":1},{"role":"coo","step":2}]'::jsonb,
   '{"pre":["poster","awardee_list","budget","certificates_template"],"post":["attendance_count","photos","awardee_list_signed"]}'::jsonb,
   'all_jkkn', false, 'waitlist', 100, true),

  -- Industry / placement
  (gen_random_uuid(), 'Industry / Placement', 'industry',
   'Industry visits, placement drives, recruiter interactions',
   '[{"role":"hod","step":1},{"role":"principal","step":2},{"role":"coo","step":3}]'::jsonb,
   '{"pre":["poster","company_brief","mou","budget"],"post":["attendance_count","photos","placement_outcome","feedback_summary"]}'::jsonb,
   'institution', true, 'strict_cap', 110, true),

  -- Sports (non-marathon)
  (gen_random_uuid(), 'Sports (non-marathon)', 'sports_general',
   'Sports tournaments, inter-institution meets, athletic events (not marathon)',
   '[{"role":"hod","step":1},{"role":"principal","step":2}]'::jsonb,
   '{"pre":["poster","rules","participant_list","first_aid_plan"],"post":["attendance_count","photos","results","incident_log"]}'::jsonb,
   'all_jkkn', true, 'waitlist', 120, true)

ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- B. Seed 'Creative Asset' resource sub-category (Q17 — designer briefs as resources)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  parent_id UUID;
  digital_assets_id UUID;
BEGIN
  -- Find or create parent category 'Digital Assets'
  SELECT id INTO digital_assets_id FROM resource_parent_categories WHERE name = 'Digital Assets' LIMIT 1;

  IF digital_assets_id IS NULL THEN
    INSERT INTO resource_parent_categories (name, description, status, display_order)
    VALUES ('Digital Assets', 'Digital deliverables: posters, certificates, banners, social media creatives', 'active', 100)
    RETURNING id INTO digital_assets_id;
  END IF;

  -- Add sub-category 'Creative Asset' if not exists
  IF NOT EXISTS (SELECT 1 FROM resource_sub_categories WHERE name = 'Creative Asset' AND parent_category_id = digital_assets_id) THEN
    INSERT INTO resource_sub_categories (parent_category_id, name, description, status, display_order, inherit_parent_attributes)
    VALUES (digital_assets_id, 'Creative Asset',
            'Posters, certificates, banners, social media graphics designed for events. Designer Jicate is the default caretaker.',
            'active', 10, true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- C. 5 retro-load event placeholders (one per high-volume chat category)
-- These are STUB events with status='completed' for Day-1 module population.
-- Real photos/attendance/etc. backfilled by IQAC team per spec retro-load section.
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  cat_festival     UUID; cat_sports        UUID; cat_alumni    UUID;
  cat_guest_lec    UUID; cat_graduation    UUID;
  default_inst     UUID;
BEGIN
  SELECT id INTO cat_festival     FROM event_categories WHERE slug = 'festival'         LIMIT 1;
  SELECT id INTO cat_sports       FROM event_categories WHERE slug = 'sports_general'   LIMIT 1;
  SELECT id INTO cat_alumni       FROM event_categories WHERE slug = 'alumni'           LIMIT 1;
  SELECT id INTO cat_guest_lec    FROM event_categories WHERE slug = 'guest_lecture'    LIMIT 1;
  SELECT id INTO cat_graduation   FROM event_categories WHERE slug = 'graduation'       LIMIT 1;
  SELECT id INTO default_inst     FROM institutions ORDER BY created_at LIMIT 1;

  -- Skip retro-load if no institution exists yet
  IF default_inst IS NULL THEN
    RAISE NOTICE 'Skipping retro-load: no institution found';
    RETURN;
  END IF;

  -- 1. Festival — Annual Cultural Day (chat 2025-12-05 era)
  IF NOT EXISTS (SELECT 1 FROM events WHERE slug = 'retro-cultural-day-2024') THEN
    INSERT INTO events (
      institution_id, event_type, name, slug, description,
      event_category_id, status, scope, visibility,
      iqac_evidence_status, naac_criteria,
      start_date, end_date, year, is_active, is_public,
      config, registration_config, route_config, branding_config
    ) VALUES (
      default_inst, 'cultural', 'Annual Cultural Day 2024 (Retro)', 'retro-cultural-day-2024',
      'Retro-loaded from JKKN Events Team chat — Annual Day with cultural performances.',
      cat_festival, 'completed', 'institution', 'all_jkkn',
      'pending_validation', ARRAY['8.4','5.4'],
      '2024-12-05 09:00+05:30', '2024-12-05 21:00+05:30', 2024, true, true,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  END IF;

  -- 2. Sports — Inter-Institution Sports Meet (chat 2026-02-14)
  IF NOT EXISTS (SELECT 1 FROM events WHERE slug = 'retro-inter-inst-sports-2026') THEN
    INSERT INTO events (
      institution_id, event_type, name, slug, description,
      event_category_id, status, scope, visibility,
      iqac_evidence_status, naac_criteria,
      start_date, end_date, year, is_active, is_public,
      config, registration_config, route_config, branding_config
    ) VALUES (
      default_inst, 'sports', 'Inter-Institution Sports Meet 2026 (Retro)', 'retro-inter-inst-sports-2026',
      'Retro-loaded — inter-institution sports meet referenced in chat 2026-02-14.',
      cat_sports, 'completed', 'all_jkkn', 'all_jkkn',
      'pending_validation', ARRAY['5.4','9.1'],
      '2026-02-14 08:00+05:30', '2026-02-15 18:00+05:30', 2026, true, true,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  END IF;

  -- 3. Alumni — Alumni Insights CSE (chat 2024-10-24)
  IF NOT EXISTS (SELECT 1 FROM events WHERE slug = 'retro-alumni-insights-cse-2024') THEN
    INSERT INTO events (
      institution_id, event_type, name, slug, description,
      event_category_id, status, scope, visibility,
      iqac_evidence_status, naac_criteria,
      start_date, end_date, year, is_active, is_public,
      config, registration_config, route_config, branding_config
    ) VALUES (
      default_inst, 'alumni', 'Alumni Insights CSE 2024 (Retro)', 'retro-alumni-insights-cse-2024',
      'Retro-loaded from chat 2024-10-24 — alumni session for Computer Science & Engineering learners.',
      cat_alumni, 'completed', 'institution', 'all_jkkn',
      'pending_validation', ARRAY['8.2','5.3'],
      '2024-10-24 14:00+05:30', '2024-10-24 17:00+05:30', 2024, true, false,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  END IF;

  -- 4. Guest Lecture — Tech industry expert
  IF NOT EXISTS (SELECT 1 FROM events WHERE slug = 'retro-guest-lecture-tech-2025') THEN
    INSERT INTO events (
      institution_id, event_type, name, slug, description,
      event_category_id, status, scope, visibility,
      iqac_evidence_status, naac_criteria,
      start_date, end_date, year, is_active, is_public,
      config, registration_config, route_config, branding_config
    ) VALUES (
      default_inst, 'lecture', 'Guest Lecture — Industry Expert (Retro 2025)', 'retro-guest-lecture-tech-2025',
      'Retro-loaded — placeholder for 25 chat-referenced guest lecture sessions.',
      cat_guest_lec, 'completed', 'institution', 'institution',
      'pending_validation', ARRAY['5.4','9.1'],
      '2025-08-15 11:00+05:30', '2025-08-15 13:00+05:30', 2025, true, false,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  END IF;

  -- 5. Graduation — Convocation 2025
  IF NOT EXISTS (SELECT 1 FROM events WHERE slug = 'retro-convocation-2025') THEN
    INSERT INTO events (
      institution_id, event_type, name, slug, description,
      event_category_id, status, scope, visibility,
      iqac_evidence_status, naac_criteria,
      start_date, end_date, year, is_active, is_public,
      config, registration_config, route_config, branding_config
    ) VALUES (
      default_inst, 'convocation', 'Convocation 2025 (Retro)', 'retro-convocation-2025',
      'Retro-loaded — graduation ceremony placeholder.',
      cat_graduation, 'completed', 'institution', 'public',
      'pending_validation', ARRAY['8.2','7.1'],
      '2025-09-20 10:00+05:30', '2025-09-20 18:00+05:30', 2025, true, true,
      '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb
    );
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================
-- DELETE FROM events WHERE slug IN (
--   'retro-cultural-day-2024','retro-inter-inst-sports-2026',
--   'retro-alumni-insights-cse-2024','retro-guest-lecture-tech-2025',
--   'retro-convocation-2025'
-- );
-- DELETE FROM resource_sub_categories WHERE name = 'Creative Asset';
-- DELETE FROM event_categories WHERE slug IN (
--   'festival','seminar_workshop','guest_lecture','exhibition','graduation',
--   'competition','alumni','inauguration','orientation','award','industry','sports_general'
-- );
