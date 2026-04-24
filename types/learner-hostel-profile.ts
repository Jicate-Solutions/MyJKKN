// Types for the `learner_hostel_profiles` side-table.
//
// The table sits 1:1 on top of `learners_profiles` and carries the five
// warden-writable hostel fields that are intentionally kept OFF the main
// admission table (to avoid mixing admission-owned columns with warden-owned
// columns on a single row — see specs/warden-edit-hostel-fields-spec.md).
//
// `hostel_type` is NOT here — it stays on `learners_profiles.hostel_type`
// because billing's fee plumbing already reads it from that column. The
// edit drawer updates that column separately via LearnerHosteliteService.
//
// Type lives in its own file rather than `types/campus-living.ts` because
// Agent B owns campus-living.ts in the parallel dispatch; this file is
// the Agent-E lock.

export interface LearnerHostelProfile {
  id: string;
  learner_id: string;
  hostel_emergency_contact_name: string | null;
  hostel_emergency_contact_phone: string | null;
  hostel_emergency_contact_relation: string | null;
  hostel_medical_notes: string | null;
  hostel_parent_phone: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// Upsert payload — all mutable fields optional, learner_id required (the
// primary key conflict target). Nulls are preserved (allows clearing a
// previously-set field by passing null explicitly).
export interface UpsertLearnerHostelProfileDTO {
  learner_id: string;
  hostel_emergency_contact_name?: string | null;
  hostel_emergency_contact_phone?: string | null;
  hostel_emergency_contact_relation?: string | null;
  hostel_medical_notes?: string | null;
  hostel_parent_phone?: string | null;
}
