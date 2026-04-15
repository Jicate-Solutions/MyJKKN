-- =============================================================================
-- Campus Living Module - Add Foreign Key Constraints to profiles
-- Created: 2026-02-22
-- Description: Adds missing FK constraints from learner_id (and other user
--              reference columns) to profiles(id) across all campus living tables.
--              The original migration (20260222000015) created these columns
--              as UUID NOT NULL without REFERENCES clauses.
-- =============================================================================

-- ============================================================
-- 1. learner_id -> profiles(id) constraints
-- ============================================================

-- hostel_allocations.learner_id
ALTER TABLE hostel_allocations
  ADD CONSTRAINT hostel_allocations_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_roommate_preferences.learner_id
ALTER TABLE hostel_roommate_preferences
  ADD CONSTRAINT hostel_roommate_preferences_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_attendance.learner_id
ALTER TABLE hostel_attendance
  ADD CONSTRAINT hostel_attendance_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_leave_requests.learner_id
ALTER TABLE hostel_leave_requests
  ADD CONSTRAINT hostel_leave_requests_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_gate_passes.learner_id
ALTER TABLE hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_visitors.learner_id (the learner being visited)
ALTER TABLE hostel_visitors
  ADD CONSTRAINT hostel_visitors_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_maintenance_requests.learner_id
ALTER TABLE hostel_maintenance_requests
  ADD CONSTRAINT hostel_maintenance_requests_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_deposits.learner_id
ALTER TABLE hostel_deposits
  ADD CONSTRAINT hostel_deposits_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_waitlist.learner_id
ALTER TABLE hostel_waitlist
  ADD CONSTRAINT hostel_waitlist_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_known_visitors.learner_id
ALTER TABLE hostel_known_visitors
  ADD CONSTRAINT hostel_known_visitors_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_risk_alerts.learner_id (nullable - FK still works, NULLs are allowed)
ALTER TABLE hostel_risk_alerts
  ADD CONSTRAINT hostel_risk_alerts_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_incident_parties.person_id (references a profile)
ALTER TABLE hostel_incident_parties
  ADD CONSTRAINT hostel_incident_parties_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES profiles(id);

-- anti_ragging_affidavits.learner_id
ALTER TABLE anti_ragging_affidavits
  ADD CONSTRAINT anti_ragging_affidavits_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- mess_meal_records.learner_id
ALTER TABLE mess_meal_records
  ADD CONSTRAINT mess_meal_records_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- mess_student_billing.learner_id
ALTER TABLE mess_student_billing
  ADD CONSTRAINT mess_student_billing_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- mess_feedback.learner_id
ALTER TABLE mess_feedback
  ADD CONSTRAINT mess_feedback_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- mess_meal_bookings.learner_id
ALTER TABLE mess_meal_bookings
  ADD CONSTRAINT mess_meal_bookings_learner_id_fkey
  FOREIGN KEY (learner_id) REFERENCES profiles(id);

-- hostel_beds.current_occupant_id (nullable - references a learner profile)
ALTER TABLE hostel_beds
  ADD CONSTRAINT hostel_beds_current_occupant_id_fkey
  FOREIGN KEY (current_occupant_id) REFERENCES profiles(id);

-- ============================================================
-- 2. Staff/admin reference columns -> profiles(id)
-- ============================================================

-- hostel_blocks.warden_id (nullable)
ALTER TABLE hostel_blocks
  ADD CONSTRAINT hostel_blocks_warden_id_fkey
  FOREIGN KEY (warden_id) REFERENCES profiles(id);

-- hostel_blocks.deputy_warden_id (nullable)
ALTER TABLE hostel_blocks
  ADD CONSTRAINT hostel_blocks_deputy_warden_id_fkey
  FOREIGN KEY (deputy_warden_id) REFERENCES profiles(id);

-- hostel_wardens.staff_id
ALTER TABLE hostel_wardens
  ADD CONSTRAINT hostel_wardens_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES profiles(id);

-- hostel_wardens.user_id
ALTER TABLE hostel_wardens
  ADD CONSTRAINT hostel_wardens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id);

-- hostel_allocations.allocated_by (nullable)
ALTER TABLE hostel_allocations
  ADD CONSTRAINT hostel_allocations_allocated_by_fkey
  FOREIGN KEY (allocated_by) REFERENCES profiles(id);

-- hostel_attendance.marked_by (nullable)
ALTER TABLE hostel_attendance
  ADD CONSTRAINT hostel_attendance_marked_by_fkey
  FOREIGN KEY (marked_by) REFERENCES profiles(id);

-- hostel_leave_requests.warden_id (nullable)
ALTER TABLE hostel_leave_requests
  ADD CONSTRAINT hostel_leave_requests_warden_id_fkey
  FOREIGN KEY (warden_id) REFERENCES profiles(id);

-- hostel_leave_requests.chief_warden_id (nullable)
ALTER TABLE hostel_leave_requests
  ADD CONSTRAINT hostel_leave_requests_chief_warden_id_fkey
  FOREIGN KEY (chief_warden_id) REFERENCES profiles(id);

-- hostel_gate_passes.approved_by
ALTER TABLE hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id);

-- hostel_gate_passes.gate_security_out (nullable)
ALTER TABLE hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_gate_security_out_fkey
  FOREIGN KEY (gate_security_out) REFERENCES profiles(id);

-- hostel_gate_passes.gate_security_in (nullable)
ALTER TABLE hostel_gate_passes
  ADD CONSTRAINT hostel_gate_passes_gate_security_in_fkey
  FOREIGN KEY (gate_security_in) REFERENCES profiles(id);

-- hostel_visitors.approved_by (nullable)
ALTER TABLE hostel_visitors
  ADD CONSTRAINT hostel_visitors_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id);

-- hostel_maintenance_requests.verified_by (nullable)
ALTER TABLE hostel_maintenance_requests
  ADD CONSTRAINT hostel_maintenance_requests_verified_by_fkey
  FOREIGN KEY (verified_by) REFERENCES profiles(id);

-- hostel_incidents.reported_by
ALTER TABLE hostel_incidents
  ADD CONSTRAINT hostel_incidents_reported_by_fkey
  FOREIGN KEY (reported_by) REFERENCES profiles(id);

-- hostel_incidents.closed_by (nullable)
ALTER TABLE hostel_incidents
  ADD CONSTRAINT hostel_incidents_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES profiles(id);

-- hostel_inspections.inspector_id
ALTER TABLE hostel_inspections
  ADD CONSTRAINT hostel_inspections_inspector_id_fkey
  FOREIGN KEY (inspector_id) REFERENCES profiles(id);

-- anti_ragging_affidavits.verified_by (nullable)
ALTER TABLE anti_ragging_affidavits
  ADD CONSTRAINT anti_ragging_affidavits_verified_by_fkey
  FOREIGN KEY (verified_by) REFERENCES profiles(id);

-- mess_waste_log.logged_by
ALTER TABLE mess_waste_log
  ADD CONSTRAINT mess_waste_log_logged_by_fkey
  FOREIGN KEY (logged_by) REFERENCES profiles(id);

-- hostel_curfew_exceptions.approved_by
ALTER TABLE hostel_curfew_exceptions
  ADD CONSTRAINT hostel_curfew_exceptions_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES profiles(id);

-- hostel_alert_rules.created_by
ALTER TABLE hostel_alert_rules
  ADD CONSTRAINT hostel_alert_rules_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES profiles(id);

-- hostel_risk_alerts.acknowledged_by (nullable)
ALTER TABLE hostel_risk_alerts
  ADD CONSTRAINT hostel_risk_alerts_acknowledged_by_fkey
  FOREIGN KEY (acknowledged_by) REFERENCES profiles(id);

-- hostel_risk_alerts.resolved_by (nullable)
ALTER TABLE hostel_risk_alerts
  ADD CONSTRAINT hostel_risk_alerts_resolved_by_fkey
  FOREIGN KEY (resolved_by) REFERENCES profiles(id);
