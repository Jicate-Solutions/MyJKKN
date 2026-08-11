/**
 * Physical-room eligibility rules — types.
 *
 * A rule reserves a set of rooms (block + optional floor + optional explicit
 * room set) for learners matching an academic predicate (institution required;
 * degree/department/program nullable = "any"; semester_ids empty = "any").
 * Fail-closed: a room covered by >=1 rule admits only matching learners;
 * uncovered rooms stay open. Enforced by fn_learner_eligible_for_room.
 */

export interface RoomEligibilityRule {
  id: string;
  institution_id: string;
  block_id: string;
  floor: number | null;
  degree_id: string | null;
  department_id: string | null;
  program_id: string | null;
  /**
   * Eligible semesters, IN FILL-PRIORITY ORDER. Empty = any semester.
   * fn_auto_allocate_classic places element 1's learners before element 2's,
   * so the array's order is load-bearing — never sort it for display.
   */
  semester_ids: string[];
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
  /** Resolved names, index-aligned with semester_ids (same fill order). */
  semester_names: string[];
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
  /** Ordered; empty/omitted = any semester. */
  semester_ids?: string[];
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
  semester_ids?: string[];
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
  /** Planned bed count (hostel_rooms.capacity, NOT NULL). */
  capacity: number;
  /** Live occupied beds (active residents, from v_hostel_room_occupancy). */
  occupied: number;
  /** Free beds = max(capacity - occupied, 0). */
  available: number;
}
