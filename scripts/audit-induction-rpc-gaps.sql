-- ============================================================================
-- Induction RPC gap audit
--
-- Lists every fn_induction_* function the APPLICATION CODE calls that does
-- NOT exist in this database. Read-only: it creates nothing and changes
-- nothing, it only reports.
--
-- Run this ONCE in the Supabase SQL editor instead of discovering missing
-- functions one runtime error at a time. Every name it returns is a page
-- that will fail with "Could not find the function ... in the schema cache".
--
-- Generated from the code by grepping lib/services/induction, the induction
-- route tree and hooks/induction. Regenerate after adding new RPC calls.
-- ============================================================================

WITH expected(fn) AS (VALUES
  ('fn_induction_admin_assign_fresher'),
  ('fn_induction_admin_mentor_mentees'),
  ('fn_induction_admin_set_mentor_trained'),
  ('fn_induction_admin_unassign_fresher'),
  ('fn_induction_admin_unassigned_freshers'),
  ('fn_induction_appoint_feedback_volunteer'),
  ('fn_induction_assign_coordinator'),
  ('fn_induction_assign_event_coordinator'),
  ('fn_induction_assignable_event_staff'),
  ('fn_induction_assignable_peer_mentors'),
  ('fn_induction_assignable_staff'),
  ('fn_induction_attendance_coverage'),
  ('fn_induction_auto_enroll'),
  ('fn_induction_auto_split_batches'),
  ('fn_induction_autobalance_feedback_volunteers'),
  ('fn_induction_can_manage_coordinators'),
  ('fn_induction_can_manage_event'),
  ('fn_induction_can_manage_event_coordinators'),
  ('fn_induction_can_manage_training'),
  ('fn_induction_close_session_poll'),
  ('fn_induction_close_session_pulse'),
  ('fn_induction_count_monthly_checkins'),
  ('fn_induction_create_program'),
  ('fn_induction_create_training_session'),
  ('fn_induction_day_feedback_summary'),
  ('fn_induction_day_roster'),
  ('fn_induction_delete_session'),
  ('fn_induction_emit_naac_evidence'),
  ('fn_induction_event_session_shares'),
  ('fn_induction_feedback_by_learner_college'),
  ('fn_induction_feedback_method_mix'),
  ('fn_induction_generate_monthly_checkins'),
  ('fn_induction_get_poll_for_answering'),
  ('fn_induction_get_session_poll'),
  ('fn_induction_guest_speakers_directory'),
  ('fn_induction_is_any_event_coordinator'),
  ('fn_induction_is_event_coordinator'),
  ('fn_induction_list_coordinators'),
  ('fn_induction_list_event_coordinators'),
  ('fn_induction_list_feedback_volunteers'),
  ('fn_induction_list_sessions'),
  ('fn_induction_list_training_sessions'),
  ('fn_induction_mark_attendance'),
  ('fn_induction_mark_day_attendance'),
  ('fn_induction_mentor_complete_self_training'),
  ('fn_induction_mentor_helpfulness_crosscheck'),
  ('fn_induction_my_day_feedback'),
  ('fn_induction_my_enrollments'),
  ('fn_induction_my_feedback'),
  ('fn_induction_my_feedback_group'),
  ('fn_induction_my_mentor_checkins'),
  ('fn_induction_my_program_feedback'),
  ('fn_induction_my_referrals'),
  ('fn_induction_my_session_attendance'),
  ('fn_induction_my_session_comments'),
  ('fn_induction_my_sessions_feedback'),
  ('fn_induction_my_training_status'),
  ('fn_induction_my_volunteer_sessions'),
  ('fn_induction_open_session_poll'),
  ('fn_induction_open_session_pulse'),
  ('fn_induction_poll_question_totals_for_learner'),
  ('fn_induction_poll_vote_broadcast'),
  ('fn_induction_preview_enroll'),
  ('fn_induction_program_feedback_summary'),
  ('fn_induction_remove_coordinator'),
  ('fn_induction_remove_event_coordinator'),
  ('fn_induction_remove_feedback_volunteer'),
  ('fn_induction_running_colleges'),
  ('fn_induction_scorecard'),
  ('fn_induction_scorecard_leadership'),
  ('fn_induction_search_facilitators'),
  ('fn_induction_search_learner_speakers'),
  ('fn_induction_session_feedback_roster'),
  ('fn_induction_session_feedback_summary'),
  ('fn_induction_session_loop_summary'),
  ('fn_induction_session_poll_export'),
  ('fn_induction_session_poll_for_learner'),
  ('fn_induction_session_poll_responders'),
  ('fn_induction_session_poll_totals'),
  ('fn_induction_session_pulse_for_learner'),
  ('fn_induction_session_pulse_totals'),
  ('fn_induction_session_roster'),
  ('fn_induction_session_share_add'),
  ('fn_induction_session_share_remove'),
  ('fn_induction_session_shareable_institutions'),
  ('fn_induction_sessions_led'),
  ('fn_induction_set_current_poll_question'),
  ('fn_induction_set_playbook_verdict'),
  ('fn_induction_set_session_speakers'),
  ('fn_induction_shared_session_change_audience'),
  ('fn_induction_submit_advocacy'),
  ('fn_induction_submit_day_feedback'),
  ('fn_induction_submit_feedback'),
  ('fn_induction_submit_feedback_proxy'),
  ('fn_induction_submit_mentor_month_feedback'),
  ('fn_induction_submit_poll_response'),
  ('fn_induction_submit_program_feedback'),
  ('fn_induction_submit_referral'),
  ('fn_induction_topic_catalog'),
  ('fn_induction_training_mark_attended'),
  ('fn_induction_upsert_session'),
  ('fn_induction_upsert_session_poll'),
  ('fn_induction_volunteer_mark_attendance'),
  ('fn_induction_volunteer_submit_feedback')
),
present AS (
  SELECT p.proname AS fn
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.proname LIKE 'fn_induction_%'
)
SELECT e.fn AS missing_function
FROM expected e
LEFT JOIN present pr ON pr.fn = e.fn
WHERE pr.fn IS NULL
ORDER BY e.fn;

-- Expected functions counted by this audit: 104
