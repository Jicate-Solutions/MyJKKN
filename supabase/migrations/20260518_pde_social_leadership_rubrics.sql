-- =====================================================================
-- PDE Phase 8 — Social & Leadership Trust Rubrics
-- Date: 2026-05-18
-- =====================================================================
-- Seeds 4 platform_policies rows under the `pde.rubrics.social_leadership.*`
-- namespace. Phase 8 of the 7-category PDE framework: what students must
-- DEMONSTRATE about working with humans, leading peers, holding committee
-- positions, organizing communities — the durable value AI cannot replicate
-- (trust, accountability, presence).
--
-- Each rubric defines:
--   - evidence_required: the artifact a student must produce to claim it
--   - min_* thresholds: scope of effort that counts (mentees, team size,
--     duration, meetings attended, participants organized)
--   - validator_role: who signs off (faculty / faculty_coordinator /
--     faculty_advisor)
--   - feedback sources, deliverables, supported contexts
--   - scoring_band: pass + distinction thresholds for the demonstration
--
-- Pattern: every rubric = row in platform_policies. Director edits via
-- /pde/admin/rubrics/social-leadership UI → next demonstration submission
-- uses the new thresholds. Zero deploys.
--
-- Read at runtime via fn_get_policy('pde.rubrics.social_leadership.<key>').
-- Scope: global (per-institution overrides come later via the same UI).
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
    'pde.rubrics.social_leadership.peer_mentor',
    'global',
    NULL,
    '{"evidence_required": "mentee_endorsement_signed", "min_mentees": 2, "min_duration_weeks": 12, "validator_role": "faculty_coordinator", "feedback_collected_from": ["mentees", "faculty_observer"], "scoring_band": {"pass_threshold": 70, "distinction_threshold": 90}}'::jsonb,
    'object',
    'Peer mentor rubric — student demonstrates sustained 1:1 mentorship of at least 2 juniors over 12+ weeks. Evidence is a signed endorsement from each mentee plus faculty-observer feedback. Validator: faculty coordinator.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.social_leadership.team_project_lead',
    'global',
    NULL,
    '{"evidence_required": "team_artifact_with_role_attribution", "min_team_size": 4, "min_duration_weeks": 8, "validator_role": "faculty", "feedback_collected_from": ["teammates", "faculty"], "deliverables": ["working_artifact", "team_retrospective", "individual_contribution_log"], "scoring_band": {"pass_threshold": 70, "distinction_threshold": 90}}'::jsonb,
    'object',
    'Team project lead rubric — student leads a team of 4+ for 8+ weeks. Evidence is the team artifact (working deliverable + retrospective + per-member contribution log) plus teammate and faculty feedback. Validator: faculty.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.social_leadership.committee_role',
    'global',
    NULL,
    '{"evidence_required": "committee_minutes_with_role", "approved_committees": ["student_council", "department_committee", "iqac", "hostel_committee", "cultural_committee", "sports_committee"], "min_meetings_attended": 6, "min_duration_months": 6, "validator_role": "faculty_advisor", "scoring_band": {"pass_threshold": 65, "distinction_threshold": 85}}'::jsonb,
    'object',
    'Committee role rubric — student holds a named role on an approved campus committee for 6+ months and attends 6+ meetings. Evidence is the meeting minutes with the student''s role attributed. Validator: faculty advisor of that committee.',
    NULL,
    false,
    true
  ),
  (
    'pde.rubrics.social_leadership.community_organizer',
    'global',
    NULL,
    '{"evidence_required": "event_or_drive_with_impact_metrics", "min_participants_organized": 10, "validator_role": "faculty", "deliverables": ["event_report", "participant_feedback", "impact_metrics"], "supported_contexts": ["campus_drive", "off_campus_outreach", "online_community"], "scoring_band": {"pass_threshold": 70, "distinction_threshold": 90}}'::jsonb,
    'object',
    'Community organizer rubric — student organizes an event, drive, or sustained online community involving 10+ participants. Evidence is the event report, participant feedback, and quantified impact metrics. Supports campus, off-campus, and online contexts. Validator: faculty.',
    NULL,
    false,
    true
  )
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- Verification (SELECT only — safe against NOT NULL columns):
-- SELECT policy_key, scope_type, value FROM platform_policies
--   WHERE policy_key LIKE 'pde.rubrics.social_leadership.%' ORDER BY policy_key;
-- Expected: 4 rows.
