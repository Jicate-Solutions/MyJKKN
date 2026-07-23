-- =====================================================================
-- PDE Rubrics — Cultural & Civic Literacy (Phase 9, NEP 2020-aligned)
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.rubrics.cultural_civic.*`
-- namespace. These rubrics define how JKKN students earn the cultural &
-- civic literacy slice of their Principal Development Engine (PDE) score.
--
-- Alignment:
--   * NEP 2020 §4.6-4.7 — promotion of Indian Knowledge Systems (IKS),
--     mother-tongue / regional language as medium of expression.
--   * NEP 2020 §4.23 — fundamental duties, constitutional values, civic
--     engagement, voter education embedded in school + higher-ed.
--   * NEP 2020 §11.8 — credit for community service / panchayat work as
--     part of the holistic development record.
--
-- JKKN context (Tamil Nadu rootedness):
--   Tamil is the primary language for JKKN. Sanskrit / Hindi / regional
--   sister-languages are recognised but Tamil leads the approved list and
--   is named explicitly as `primary_language_for_jkkn`. Local-community
--   project rubric leans on village outreach, panchayat collaboration,
--   and self-help-group engagement — formats native to Tamil Nadu rural
--   institutional life. Tradition attunement explicitly recognises
--   classical (Bharatanatyam / Carnatic / Tamil literature) and folk
--   forms.
--
-- Pattern: every rubric = row in platform_policies. Director edits via
-- /pde/admin/rubrics/cultural-civic UI → effective on next demonstration
-- submission. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.rubrics.cultural_civic.<key>',
-- institution_id). Scope: global (institution overrides will come later
-- via the same UI).
-- Idempotent: ON CONFLICT DO NOTHING against the existing unique index
-- uq_platform_policies_key_scope (policy_key, scope_type, scope_id).
-- =====================================================================

INSERT INTO platform_policies (
  policy_key,
  scope_type,
  scope_id,
  value,
  data_type,
  description,
  validation_schema,
  is_system,
  is_active
) VALUES
  (
    'pde.rubrics.cultural_civic.indian_language_proficiency',
    'global',
    NULL,
    '{"approved_languages": ["tamil", "hindi", "sanskrit", "telugu", "malayalam", "kannada"], "primary_language_for_jkkn": "tamil", "evidence_required": "graded_assessment", "skill_dimensions": ["reading_fluency", "writing_clarity", "spoken_articulation", "comprehension"], "validator_role": "language_faculty", "min_proficiency_level": "B2_or_equivalent", "scoring_band": {"pass_threshold": 70, "distinction_threshold": 90}}'::jsonb,
    'object',
    'NEP 2020 §4.6-4.7 rubric — Indian-language proficiency credit. Tamil is the primary language for JKKN. Evidence = graded assessment across reading/writing/spoken/comprehension dimensions. Validated by language faculty. Pass at 70, distinction at 90; min CEFR-equivalent proficiency B2.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.cultural_civic.local_community_project',
    'global',
    NULL,
    '{"evidence_required": "project_report_with_community_endorsement", "min_duration_weeks": 8, "approved_contexts": ["village_outreach", "ngo_partnership", "panchayat_collaboration", "local_govt_internship", "self_help_group_engagement"], "validator_role": "faculty", "deliverables": ["project_proposal", "execution_log", "community_endorsement_signed", "impact_metrics", "reflection_essay"], "scoring_band": {"pass_threshold": 70, "distinction_threshold": 90}}'::jsonb,
    'object',
    'NEP 2020 §11.8 rubric — local community project credit. Minimum 8-week engagement in village outreach, panchayat collaboration, NGO partnership, local-govt internship, or self-help-group work (Tamil Nadu rural-institutional formats). Faculty-validated. Evidence chain: proposal → execution log → signed community endorsement → impact metrics → reflection.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.cultural_civic.tradition_attunement',
    'global',
    NULL,
    '{"evidence_required": "demonstration_or_curated_artifact", "approved_domains": ["classical_music", "classical_dance", "traditional_craft", "folk_art", "ancient_text_study", "regional_history", "yoga_or_martial_arts"], "min_engagement_hours": 60, "validator_role": "domain_faculty_or_certified_practitioner", "deliverables": ["public_demonstration_or_artifact", "reflection_on_lineage", "mentor_endorsement"], "scoring_band": {"pass_threshold": 65, "distinction_threshold": 85}}'::jsonb,
    'object',
    'NEP 2020 §4.6 (IKS) rubric — tradition attunement credit. Minimum 60 hours of engagement across classical music/dance, traditional craft, folk art, ancient-text study, regional history, or yoga / martial arts. Recognises Tamil classical and folk forms (Bharatanatyam, Carnatic, Silambam, Tamil literature). Validated by domain faculty OR certified practitioner. Lineage reflection required.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.cultural_civic.civic_engagement',
    'global',
    NULL,
    '{"evidence_required": "documented_participation", "approved_activities": ["voter_education_drive", "rti_filing", "local_governance_observation", "policy_advocacy", "election_volunteer", "constitutional_literacy_program"], "min_activities": 2, "min_total_hours": 40, "validator_role": "faculty", "deliverables": ["activity_log", "reflection_essay", "supervisor_endorsement"], "scoring_band": {"pass_threshold": 70, "distinction_threshold": 90}}'::jsonb,
    'object',
    'NEP 2020 §4.23 rubric — civic engagement credit. Minimum 2 activities and 40 total hours across voter education, RTI filing, local-governance observation, policy advocacy, election-volunteer work, or constitutional-literacy programs. Faculty-validated. Documents the fundamental-duties + constitutional-values strand of the holistic development record.',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.rubrics.cultural_civic.%' ORDER BY policy_key;
-- Expected: 4 rows.
