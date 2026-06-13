-- =====================================================================
-- PDE Phase 7 — Embodied Practice Rubrics
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 5 platform_policies rows under the `pde.rubrics.embodied.*`
-- namespace — one per JKKN college discipline that emphasizes hands-on
-- bodily skill (Medical, Pharmacy, Nursing, Dental, Engineering).
--
-- Each row's value is a JSONB object describing the rubric for that
-- discipline: list of skills, the evidence required to count a skill
-- as demonstrated, who is allowed to validate it, the scoring band
-- (0..100), the passing threshold, minimum yearly demonstrations,
-- and validity period in months.
--
-- Pattern: every governance decision = row in platform_policies. Director
-- (or designated faculty governance role) edits via
-- /pde/admin/rubrics/embodied UI → behavior changes on next demonstration
-- submission. Zero deploys, zero developer round-trips.
--
-- Read at runtime via fn_get_policy('pde.rubrics.embodied.<discipline>',
-- institution_id). Scope: global (institution overrides will come later
-- via the same UI).
--
-- Idempotent: ON CONFLICT DO UPDATE against the existing unique index
-- uq_platform_policies_key_scope (policy_key, scope_type, scope_id).
-- UPDATE (not DO NOTHING) is used because a prior session seeded these
-- keys with a divergent schema (older `skills` array shape); this
-- migration is the canonical schema (`discipline` + `rubric` + min
-- demonstrations + validity period) consumed by the
-- /pde/admin/rubrics/embodied editor and the runtime gate logic.
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
    'pde.rubrics.embodied.medical',
    'global',
    NULL,
    '{"discipline": "Medical", "rubric": [{"skill": "History taking & clinical interview", "evidence_required": "Observed encounter with simulated/real patient; completed structured note", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "General physical examination", "evidence_required": "OSCE station completion with examiner checklist signed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Suturing (basic + interrupted)", "evidence_required": "Simulator pad demo + faculty sign-off on 5 sutures with even tension", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "IV cannulation", "evidence_required": "Successful first-attempt cannulation on mannequin or supervised patient; documented", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Basic life support (BLS)", "evidence_required": "AHA/equivalent BLS station pass on simulator within time", "validator_role": "simulator", "scoring_band": [0, 100], "passing_threshold": 80}], "min_demonstrations_per_year": 3, "validity_period_months": 24}'::jsonb,
    'object',
    'PDE Phase 7 — Embodied Practice rubric for Medical (MBBS). Skills emphasize OSCE-style clinical demonstration: history-taking, physical exam, suturing, IV cannulation, BLS. Director-editable via /pde/admin/rubrics/embodied.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.embodied.pharmacy',
    'global',
    NULL,
    '{"discipline": "Pharmacy", "rubric": [{"skill": "Prescription audit & verification", "evidence_required": "Audit log of 10 prescriptions with documented discrepancy notes reviewed by faculty", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Compounding (extemporaneous preparation)", "evidence_required": "Faculty-witnessed compounding of 3 dosage forms (suspension/ointment/capsule) to spec", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Drug-drug interaction reasoning", "evidence_required": "Written case analysis defended in viva; correctly identifies major + moderate interactions", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Dispensing & patient counselling", "evidence_required": "Role-play encounter with checklist (5 rights, counselling points covered); faculty signed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Sterile product handling (laminar flow basics)", "evidence_required": "Demonstrated aseptic technique in lab without contamination at swab check", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 75}], "min_demonstrations_per_year": 3, "validity_period_months": 24}'::jsonb,
    'object',
    'PDE Phase 7 — Embodied Practice rubric for Pharmacy (B.Pharm / Pharm.D). Skills emphasize prescription audit, compounding, drug-interaction reasoning, counselling, sterile handling. Director-editable via /pde/admin/rubrics/embodied.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.embodied.nursing',
    'global',
    NULL,
    '{"discipline": "Nursing", "rubric": [{"skill": "Vital signs measurement & interpretation", "evidence_required": "Faculty-observed BP/pulse/temp/SpO2 reading + interpretation note on 3 patients", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Wound care & dressing", "evidence_required": "Supervised dressing change with aseptic technique; pre/post photos documented", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "IV therapy & medication administration", "evidence_required": "5-rights checklist completed under supervision; calculation log signed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 75}, {"skill": "Patient handling & transfer (ergonomics)", "evidence_required": "Lab demo of bed-to-chair transfer using correct body mechanics; observed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Basic life support (BLS)", "evidence_required": "AHA/equivalent BLS station pass on simulator within time", "validator_role": "simulator", "scoring_band": [0, 100], "passing_threshold": 80}, {"skill": "Bedside communication (handover)", "evidence_required": "SBAR handover role-play scored by peer + faculty", "validator_role": "peer", "scoring_band": [0, 100], "passing_threshold": 65}], "min_demonstrations_per_year": 4, "validity_period_months": 24}'::jsonb,
    'object',
    'PDE Phase 7 — Embodied Practice rubric for Nursing (B.Sc Nursing / GNM). Skills emphasize bedside procedures, wound care, IV therapy, patient handling, vitals, SBAR handover. Director-editable via /pde/admin/rubrics/embodied.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.embodied.dental',
    'global',
    NULL,
    '{"discipline": "Dental", "rubric": [{"skill": "Cavity preparation (Class I/II)", "evidence_required": "Phantom-head exercise + faculty sign-off on conservation of tooth structure", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Scaling & root planing", "evidence_required": "Supervised scaling on patient with calculus removed; tactile check passed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Impression taking (alginate)", "evidence_required": "Two acceptable impressions (no voids, accurate margins) verified by faculty", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Prosthetic fitting (removable partial)", "evidence_required": "Try-in completed with adjustments noted; faculty-checked occlusion + retention", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "OSCE simulation (dental emergency)", "evidence_required": "Time-bound station handling of avulsed tooth / pulpal emergency on simulator", "validator_role": "simulator", "scoring_band": [0, 100], "passing_threshold": 75}], "min_demonstrations_per_year": 3, "validity_period_months": 24}'::jsonb,
    'object',
    'PDE Phase 7 — Embodied Practice rubric for Dental (BDS). Skills emphasize cavity prep, scaling, impressions, prosthetic fitting, dental-emergency OSCE. Director-editable via /pde/admin/rubrics/embodied.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.embodied.engineering',
    'global',
    NULL,
    '{"discipline": "Engineering", "rubric": [{"skill": "Lab demonstration (discipline-specific experiment)", "evidence_required": "Completed lab exercise with observations + signed lab manual; results within tolerance", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 65}, {"skill": "Prototype build (working device or assembly)", "evidence_required": "Demo of working prototype meeting spec; bill of materials + photo log committed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Hardware debugging (multimeter + scope)", "evidence_required": "Diagnosed fault in a seeded broken board within time bound; faculty-witnessed", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 70}, {"skill": "Safety procedure adherence (lab + workshop)", "evidence_required": "Pre-experiment safety checklist signed; zero PPE/safety violations across 5 sessions", "validator_role": "faculty", "scoring_band": [0, 100], "passing_threshold": 80}, {"skill": "Peer code/design review (engineering judgement)", "evidence_required": "Two reviews submitted on peer projects with substantive critique and tracked rubric", "validator_role": "peer", "scoring_band": [0, 100], "passing_threshold": 60}], "min_demonstrations_per_year": 3, "validity_period_months": 24}'::jsonb,
    'object',
    'PDE Phase 7 — Embodied Practice rubric for Engineering (B.E. / B.Tech). Skills emphasize lab demos, prototype builds, hardware debugging, safety adherence, peer review. Director-editable via /pde/admin/rubrics/embodied.',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO UPDATE SET
  value = EXCLUDED.value,
  data_type = EXCLUDED.data_type,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.rubrics.embodied.%' ORDER BY policy_key;
-- Expected: 5 rows.
