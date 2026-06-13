/**
 * Campus-Living Activity Feed types.
 *
 * NOTE on data source — reality vs. spec:
 *   The Wave-2 substrate-survey claimed `user_activity_logs` would be the
 *   source. Information_schema probe + content sample on prod
 *   (kvizhngldtiuufknvehv) on 2026-05-20 showed:
 *     • `user_activity_logs` has NO hostel-related resource_types at all
 *       (only auth/learner/timetable/admission_fee_structure/etc.)
 *     • The actual hostel events live in their own dedicated tables
 *       (hostel_attendance, hostel_leave_requests, hostel_gate_passes,
 *       hostel_maintenance_requests, hostel_incidents).
 *
 *   Per the agent defensive-scaffold rule ("if reality differs from spec,
 *   override and document"), the feed unions across those 5 source tables
 *   and normalises each row into the shared `CampusLivingActivityEvent`
 *   interface below.
 */

export type CampusLivingEventType =
  | 'attendance'
  | 'leave'
  | 'gate_pass'
  | 'maintenance'
  | 'incident';

/**
 * Normalised event shape rendered by the activity feed UI.
 * Every source-table row is mapped into this shape by the service layer.
 */
export interface CampusLivingActivityEvent {
  /** Composite id: `${event_type}:${source_row_id}` — stable + unique */
  id: string;
  /** Source row's primary key (uuid) — used for drill-down deep-links */
  source_id: string;
  /** Which of the 5 event families this row came from */
  event_type: CampusLivingEventType;
  /** Short, human-readable title (e.g. "Maintenance request #MR-1234") */
  title: string;
  /** One-line description summarising the event */
  description: string;
  /** Per-table status enum value, stringified (nullable for attendance) */
  status: string | null;
  /** Owning institution (always present on every source row) */
  institution_id: string;
  /** Hostel block (nullable on hostel_attendance + hostel_gate_passes) */
  block_id: string | null;
  /** Subject of the event (learner_id where present, reporter on incidents) */
  actor_id: string | null;
  /** Event timestamp — uses the most-recent of created_at/check_in_time/etc */
  occurred_at: string;
}

export interface ActivityFeedFilters {
  institution_id?: string;
  /** Restrict to a single event family ('all' / undefined = no filter) */
  event_type?: CampusLivingEventType | 'all';
  block_id?: string;
  /** ISO date string (inclusive lower bound) */
  date_from?: string;
  /** ISO date string (inclusive upper bound) */
  date_to?: string;
}

export interface ActivityFeedPaginatedResponse {
  data: CampusLivingActivityEvent[];
  /** Total events matching the filter across all 5 source tables */
  count: number;
  page: number;
  page_size: number;
}
