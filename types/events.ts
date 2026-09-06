// types/events.ts
// Core event types shared across all event sub-modules

// ============================================================================
// Enums & Constants
// ============================================================================

export type EventType = 'marathon' | 'cultural_fest' | 'seminar' | 'workshop' | 'sports_day' | 'conference' | 'sports_tournament';

// Cross-institution levers (exist on the live `events` table; CHECK-constrained in DB).
export type EventScope = 'chapter' | 'institution' | 'all_jkkn';
export type EventVisibility = 'public' | 'all_jkkn' | 'institution' | 'invited';
/**
 * Which kind of organisation an EXTERNAL participant represents on the public
 * tournament registration form. 'school' shows "School / club" backed by the
 * school_master directory picker; 'college' shows "College" as free text.
 * Defaults to 'school' in the DB so existing tournaments are unaffected.
 */
export type ParticipantOrgType = 'school' | 'college';

export type EventStatus = 'draft' | 'planning' | 'preparation' | 'execution' | 'live' | 'post_event' | 'archived' | 'cancelled';

export type RegistrationStatus = 'pending' | 'registered' | 'confirmed' | 'checked_in' | 'cancelled' | 'disqualified' | 'no_show' | 'waitlisted';

export type ParticipantType = 'internal' | 'external';

export type PaymentStatus = 'not_required' | 'pending' | 'paid' | 'refunded' | 'waived' | 'failed';

export type EventPaymentTransactionStatus = 'initiated' | 'processing' | 'success' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  planning: 'Planning',
  preparation: 'Preparation',
  execution: 'Execution',
  live: 'Live',
  post_event: 'Post Event',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['preparation', 'cancelled'],
  preparation: ['execution', 'cancelled'],
  execution: ['live', 'cancelled'],
  live: ['post_event'],
  post_event: ['archived'],
  archived: [],
  cancelled: ['draft'],
};

// ── General events (wizard-created rows with no dedicated console) ───────────
// Lectures, cultural programmes, convocations, … run a two-state model —
// Draft (hidden, registration closed) <-> Active (visible, open) — mirroring
// tournaments (see TOURNAMENT_STATUS_* in types/tournament.ts).
//
// They are gated on their OWN map because EVENT_STATUS_TRANSITIONS above has no
// draft -> live edge: validating a one-click activation against it rejects the
// write ("Invalid status transition") on every attempt. That exact bug already
// shipped once in the tournament module. Do NOT widen the shared map to suit
// these — marathon and induction genuinely walk its full 8-state pipeline, and
// a draft -> live edge there would let them skip it silently.

/** The DB value a general event stores while it is open. Shown to users as "Active". */
export const GENERAL_EVENT_ACTIVE_STATUS = 'live' as const satisfies EventStatus;

/**
 * General-event transitions. Rows that reached another status before this model
 * shipped (the live table holds several `archived` ones) are tolerated so they
 * can be moved onto it — under the shared map `archived` is terminal, which
 * would strand them with no reachable status at all.
 */
export const GENERAL_EVENT_STATUS_TRANSITIONS: Partial<Record<EventStatus, EventStatus[]>> = {
  draft: ['live'],
  live: ['draft'],
  planning: ['draft', 'live'],
  preparation: ['draft', 'live'],
  execution: ['draft', 'live'],
  post_event: ['draft', 'live'],
  archived: ['draft', 'live'],
  cancelled: ['draft', 'live'],
};

/** Draft vs Active — every non-draft general-event status reads as Active. */
export function generalEventStatusLabel(status: string): string {
  return status === 'draft' ? 'Draft' : 'Active';
}

/** True when the event is open (i.e. anything that isn't a draft). */
export function isGeneralEventActive(status: string): boolean {
  return status !== 'draft';
}

// ── Induction ────────────────────────────────────────────────────────────────
// Added 2026-08-18. Until now the induction module had NO status writer at all:
// fn_induction_create_program hardcodes `status = 'draft'` and nothing anywhere
// — no service, no RPC, no UI — ever wrote another value. Every induction
// created through the module was stuck in Draft permanently, and the detail
// console only rendered the badge. Exactly the hole GeneralEventService was
// created to close for wizard events.
//
// Its OWN map, for two reasons:
//
//   • EVENT_STATUS_TRANSITIONS has no draft -> live edge (draft goes to
//     'planning'), so validating a one-click activation against it rejects every
//     attempt. That bug already shipped twice here — tournaments, then general
//     events. The note above it says not to widen it, and this does not.
//
//   • Not GENERAL_EVENT_STATUS_TRANSITIONS either, despite the identical shape
//     today. That map belongs to wizard-created events; sharing it would couple
//     two lifecycles that have no reason to move together, and the first time
//     one needed a state the other didn't, the change would land on both.
//
// Draft <-> Live is the whole model on purpose: those are the only two values
// any induction has ever held. If the programme later needs a "Completed" phase
// (the Scorecard and Loop Playbook sections would be its natural home), it is
// one entry here plus one label below — not a redesign.

/** The DB value an induction stores while it is running. Shown as "Live". */
export const INDUCTION_ACTIVE_STATUS = 'live' as const satisfies EventStatus;

/**
 * Induction transitions. The legacy arms exist so a row that reached another
 * status before this model shipped can be moved onto it — under the shared map
 * `archived` is terminal, which would strand such a row with no reachable
 * status at all. Same tolerance GENERAL_EVENT_STATUS_TRANSITIONS documents.
 */
export const INDUCTION_STATUS_TRANSITIONS: Partial<Record<EventStatus, EventStatus[]>> = {
  draft: ['live'],
  live: ['draft'],
  planning: ['draft', 'live'],
  preparation: ['draft', 'live'],
  execution: ['draft', 'live'],
  post_event: ['draft', 'live'],
  archived: ['draft', 'live'],
  cancelled: ['draft', 'live'],
};

/**
 * Label for an induction status.
 *
 * NOT generalEventStatusLabel(): that collapses every non-draft value to
 * "Active", which would report a legacy `archived` or `cancelled` induction as
 * running. Draft and Live get their own words; anything else keeps its real
 * EVENT_STATUS_LABELS name so the row cannot lie about where it is.
 */
export function inductionStatusLabel(status: string): string {
  if (status === 'draft') return 'Draft';
  if (status === INDUCTION_ACTIVE_STATUS) return 'Live';
  return EVENT_STATUS_LABELS[status as EventStatus] ?? status;
}

// ============================================================================
// Core Entities
// ============================================================================

export interface Event {
  id: string;
  institution_id: string;
  event_type: EventType;
  name: string;
  slug: string;
  description: string | null;
  theme: string | null;
  tagline: string | null;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_open_date: string | null;
  registration_close_date: string | null;
  status: EventStatus;
  config: Record<string, unknown>;
  registration_config: Record<string, unknown>;
  route_config: Record<string, unknown>;
  branding_config: Record<string, unknown>;
  target_registrations: number | null;
  max_registrations: number | null;
  is_public: boolean;
  allow_external_registration: boolean;
  /** Which kind of organisation EXTERNAL participants represent (see ParticipantOrgType). */
  participant_org_type: ParticipantOrgType;
  is_active: boolean;
  previous_event_id: string | null;
  year: number | null;
  edition_number: number | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
  venue: string | null;
  venue_address: string | null;
  venue_coordinates: { lat: number; lng: number } | null;
  // Cross-institution + venue-reservation columns (live on `events`; added to
  // the TS interface 2026-06-22 for the Sports Tournament module's RLS/scope use).
  scope: EventScope | null;
  visibility: EventVisibility | null;
  venue_resource_id: string | null;
  venue_text: string | null;
  // NAAC evidence tags (events.naac_criteria text[] NOT NULL DEFAULT '{}',
  // live since Phase 1A 20260417000001; GIN-indexed). Read by the events →
  // quality-evidence-spine emitter (PR #2408); written by the NAAC criteria
  // field on the tournament edit dialog (Wave 3, 2026-07-26).
  naac_criteria: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  code: string | null;
  description: string | null;
  distance_km: number | null;
  max_participants: number | null;
  min_age: number | null;
  max_age: number | null;
  fee_amount: number;
  early_bird_fee: number | null;
  early_bird_deadline: string | null;
  config: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventExternalParticipant {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  age: number | null;
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  organization: string | null;
  city: string | null;
  state: string | null;
  id_proof_type: string | null;
  id_proof_number: string | null;
  photo_url: string | null;
  linked_profile_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EventRegistration {
  id: string;
  event_id: string;
  category_id: string | null;
  profile_id: string | null;
  learner_id: string | null;
  external_participant_id: string | null;
  participant_type: ParticipantType;
  participant_name: string;
  participant_phone: string | null;
  participant_email: string | null;
  participant_age: number | null;
  participant_gender: string | null;
  institution_id: string | null;
  institution_name: string | null;
  department: string | null;
  bib_number: string | null;
  registration_number: string | null;
  status: RegistrationStatus;
  checked_in: boolean;
  checked_in_at: string | null;
  checked_in_by: string | null;
  payment_status: PaymentStatus;
  payment_amount: number;
  payment_method: string | null;
  payment_reference: string | null;
  discount_code: string | null;
  discount_amount: number;
  custom_data: Record<string, unknown>;
  source: string;
  referral_source: string | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  category?: EventCategory;
  event?: Event;
}

export interface EventPaymentTransaction {
  id: string;
  event_id: string;
  registration_id: string | null;
  transaction_ref: string;
  amount: number;
  currency: string;
  status: EventPaymentTransactionStatus;
  payment_method: string | null;
  gateway_session_id: string | null;
  gateway_transaction_id: string | null;
  gateway_response: Record<string, unknown> | null;
  payer_name: string | null;
  payer_phone: string | null;
  payer_email: string | null;
  discount_code: string | null;
  discount_amount: number;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DTOs
// ============================================================================

export interface CreateEventDto {
  institution_id: string;
  event_type: EventType;
  name: string;
  slug: string;
  description?: string;
  theme?: string;
  tagline?: string;
  event_date?: string;
  start_time?: string;
  /** Pairs with start_time. Both are `time` columns — the hours the event runs
   *  on each of its days, and the hours the room is held for. */
  end_time?: string;
  venue?: string;
  venue_address?: string;
  year?: number;
  target_registrations?: number;
  max_registrations?: number;
  is_public?: boolean;
  allow_external_registration?: boolean;
  participant_org_type?: ParticipantOrgType;
  config?: Record<string, unknown>;
  registration_config?: Record<string, unknown>;
  branding_config?: Record<string, unknown>;
  // Cross-institution + scheduling fields (used by the Sports Tournament module).
  scope?: EventScope;
  visibility?: EventVisibility;
  venue_resource_id?: string;
  venue_text?: string;
  start_date?: string;
  end_date?: string;
  registration_open_date?: string;
  registration_close_date?: string;
  // NAAC evidence tags — see Event.naac_criteria.
  naac_criteria?: string[];
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  status?: EventStatus;
  registration_open_date?: string;
  registration_close_date?: string;
  hero_image_url?: string;
  hero_video_url?: string;
  route_config?: Record<string, unknown>;
}

/**
 * What deleting an event would take with it, counted past RLS by
 * fn_event_delete_blockers. Counting these in the browser reports 0 for anyone
 * who can't see the child rows — a false "safe to delete" on the one check that
 * exists to stop data loss — so the numbers only ever come from that RPC.
 */
export interface EventDeleteBlockers {
  registrations: number;
  payments: number;
  /**
   * Enrolled induction learners. A separate count because an induction never
   * writes events_registrations — freshers arrive through
   * fn_induction_auto_enroll — so the other two are always 0 for one, and the
   * guard used to wave it through with hundreds of learners attached.
   */
  induction_learners: number;
  /** True when the DB will refuse the delete outright (the trigger, not the UI). */
  blocked: boolean;
}

export interface EventFilters {
  institution_id?: string;
  event_type?: EventType;
  status?: EventStatus | EventStatus[];
  is_active?: boolean;
  search?: string;
  year?: number;
}

export interface RegistrationFilters {
  event_id: string;
  status?: RegistrationStatus;
  participant_type?: ParticipantType;
  payment_status?: PaymentStatus;
  category_id?: string;
  institution_id?: string;
  search?: string;
}

// ============================================================================
// Notifications (added 2026-04-16)
// ============================================================================

/**
 * Events-module notification event types. Dispatched via
 * POST /api/events/notify?type=<event_type> and routed into the core
 * `notifications` + `user_notifications` tables with `type = 'events'`.
 *
 * Phase 1 (MVP) ships two event types. Phase 2 will add:
 *   - event_reminder_24h   (cron-driven)
 *   - event_reminder_1h    (cron-driven)
 *   - registration_cancelled
 */
export type EventsNotificationEventType =
  | 'registration_confirmed'
  | 'event_schedule_changed';

// ============================================================================
// Event Proposals (added 2026-04-26 — Stream C chat-bypass workflow-gravity)
// Lightweight proposal intake separate from full `events` records.
// Approved proposals promote to events rows in Phase 1B.
// ============================================================================

export type EventProposalStatus =
  | 'submitted'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export type EventProposalBudgetBand =
  | '0'
  | '<10K'
  | '10K-50K'
  | '50K-1L'
  | '>1L';

export type EventProposalAudience =
  | 'Learners'
  | 'Staff'
  | 'Parents'
  | 'External'
  | 'Mixed';

/** Matches the event_proposals table schema exactly. */
export interface EventProposal {
  id: string;
  institution_id: string;
  // Submitter (pre-filled from auth.uid())
  proposer_id: string;
  sender_role: string | null;
  sender_email: string | null;
  contact_phone: string | null;
  // Visible fields (3 shown by default per spec §5)
  title: string;
  event_date: string | null;  // DATE stored as ISO string
  venue: string | null;
  audience: EventProposalAudience[];
  // Progressive disclosure
  expected_attendance: number | null;
  budget_band: EventProposalBudgetBand | null;
  // Workflow
  status: EventProposalStatus;
  source: string;
  decision_notes: string | null;
  decided_by: string | null;
  decided_at: string | null;
  // Audit
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Payload sent when submitting a new proposal (proposer_id filled server-side). */
export interface CreateEventProposalDto {
  institution_id: string;
  title: string;
  event_date?: string;
  venue?: string;
  audience?: EventProposalAudience[];
  expected_attendance?: number;
  budget_band?: EventProposalBudgetBand;
  contact_phone?: string;
}

export const EVENT_PROPOSAL_STATUS_LABELS: Record<EventProposalStatus, string> = {
  submitted: 'Submitted',
  reviewing: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const EVENT_PROPOSAL_AUDIENCE_OPTIONS: EventProposalAudience[] = [
  'Learners', 'Staff', 'Parents', 'External', 'Mixed',
];

export const EVENT_PROPOSAL_BUDGET_BANDS: { value: EventProposalBudgetBand; label: string }[] = [
  { value: '0',       label: 'No budget' },
  { value: '<10K',    label: 'Under ₹10K' },
  { value: '10K-50K', label: '₹10K – ₹50K' },
  { value: '50K-1L',  label: '₹50K – ₹1L' },
  { value: '>1L',     label: 'Above ₹1L' },
];
