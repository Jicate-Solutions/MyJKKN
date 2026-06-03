/**
 * Physical-room eligibility rules — types.
 *
 * A rule reserves a set of rooms (block + optional floor + optional explicit
 * room set) for learners matching an academic predicate (institution required;
 * degree/department/program/semester each nullable = "any"). Fail-closed: a room
 * covered by >=1 rule admits only matching learners; uncovered rooms stay open.
 * Enforced by fn_learner_eligible_for_room(learner_id, room_id).
 */

export interface RoomEligibilityRule {
  id: string;
  institution_id: string;
  block_id: string;
  floor: number | null;
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  semester_id: string | null;
  rule_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Rule enriched with display names + targeted room ids (for table/form). */
export interface RoomEligibilityRuleRow extends RoomEligibilityRule {
  institution_name: string | null;
  block_name: string | null;
  degree_name: string | null;
  department_name: string | null;
  program_name: string | null;
  semester_name: string | null;
  room_ids: string[];
  room_count: number;
}

export interface CreateRoomEligibilityRuleDto {
  institution_id: string;
  block_id: string;
  floor?: number | null;
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  rule_name?: string | null;
  is_active?: boolean;
  /** Explicit room targeting (optional). Empty = whole block/floor. */
  room_ids?: string[];
}

export interface UpdateRoomEligibilityRuleDto {
  floor?: number | null;
  degree_id?: string | null;
  department_id?: string | null;
  program_id?: string | null;
  semester_id?: string | null;
  rule_name?: string | null;
  is_active?: boolean;
  room_ids?: string[];
}

/** Lightweight option for cascade pickers. */
export interface AcademicOption {
  id: string;
  label: string;
}

export interface BlockOption {
  id: string;
  label: string;
}

export interface RoomOption {
  id: string;
  room_number: string;
  floor: number;
  category_id: string | null;
  category_name: string | null;
}
