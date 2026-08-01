// types/tournament.ts
// Sports Tournament types — PR1 (entity + divisions).
// A tournament IS an `events` row with event_type='sports_tournament'.
// REUSES SportLevel / TEAM_SPORTS / INDIVIDUAL_SPORTS / JKKN_SPORTS from
// types/health-sports.ts — do NOT define parallel sport enums here.
// Created: 2026-06-22 (Sports Tournament PR1).

import type { SportLevel } from '@/types/health-sports';
import type { Event, EventStatus } from '@/types/events';

// ============================================================================
// Enums & Constants
// ============================================================================

// ─── Tournament status model (2026-07-15) ───────────────────────────────────
// A tournament deliberately uses only TWO of the shared EventStatus values:
//   'draft' — closed. The public register page blocks 'draft', so Draft is what
//             closes registration (it replaces Cancel for tournaments).
//   'live'  — open for registration; surfaced to students. Labelled "Active".
//
// The other EventStatus values (planning / preparation / execution / post_event
// / archived / cancelled) are NOT removed: `events` is shared with marathon,
// induction, startup-studio and others that still use them, and they remain in
// the events_status_check constraint. Tournaments simply never offer them.
//
// IMPORTANT: do NOT gate tournament transitions on EVENT_STATUS_TRANSITIONS —
// its draft entry is ['planning','cancelled'], so draft→live would be rejected
// ("Invalid status transition"). Gate on TOURNAMENT_STATUS_TRANSITIONS below.
// (Front-end-only status changes that miss a server-side allow-list are a known
// recurring bug class in this repo.)

/** The DB value a tournament stores while it is open. Shown to users as "Active". */
export const TOURNAMENT_ACTIVE_STATUS = 'live' as const satisfies EventStatus;

/** The only two statuses a tournament may be set to. */
export const TOURNAMENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: TOURNAMENT_ACTIVE_STATUS, label: 'Active' },
] as const satisfies readonly { value: EventStatus; label: string }[];

/**
 * Tournament-only transitions. Legacy rows (created before the 2-state model)
 * are tolerated so they can be moved onto it rather than being stranded.
 */
export const TOURNAMENT_STATUS_TRANSITIONS: Partial<Record<EventStatus, EventStatus[]>> = {
  draft: ['live'],
  live: ['draft'],
  planning: ['draft', 'live'],
  preparation: ['draft', 'live'],
  execution: ['draft', 'live'],
  post_event: ['draft', 'live'],
  archived: ['draft', 'live'],
  cancelled: ['draft', 'live'],
};

/** Draft vs Active — every non-draft tournament status reads as Active. */
export function tournamentStatusLabel(status: string): string {
  return status === 'draft' ? 'Draft' : 'Active';
}

/** True when the tournament is open (i.e. anything that isn't a draft). */
export function isTournamentActive(status: string): boolean {
  return status !== 'draft';
}

/** How a division's matches are organised. Matches the DB CHECK constraint. */
export type TournamentFormat = 'knockout' | 'round_robin' | 'league' | 'pools_ko';

export const TOURNAMENT_FORMATS: { value: TournamentFormat; label: string }[] = [
  { value: 'knockout', label: 'Knockout' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'league', label: 'League' },
  { value: 'pools_ko', label: 'Pools + Knockout' },
];

/** Eligibility gender bands a division can be restricted to. */
export type DivisionGender = 'male' | 'female' | 'mixed' | 'open';

export const DIVISION_GENDERS: { value: DivisionGender; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'male', label: "Men's" },
  { value: 'female', label: "Women's" },
  { value: 'mixed', label: 'Mixed' },
];

/**
 * Cross-institution scope of a tournament — maps directly to the existing
 * `events.scope` column (CHECK: chapter|institution|all_jkkn). For tournaments
 * we expose the two meaningful options:
 *   - 'institution' → Intra-College (host institution only)
 *   - 'all_jkkn'    → Inter-College / District / State / National (all JKKN)
 */
export type TournamentScope = 'institution' | 'all_jkkn';

// ============================================================================
// Core Entities
// ============================================================================

/** A competition category within a tournament (e.g. "U-19 Boys Volleyball"). */
export interface TournamentDivision {
  id: string;
  event_id: string;
  sport: string;
  gender: DivisionGender | string | null;
  age_band: string | null;
  format: TournamentFormat;
  level: SportLevel | null;
  max_teams: number | null;
  eligibility: Record<string, unknown>;
  config: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A tournament = an `events` row + its divisions (loaded together for detail). */
export type Tournament = Event & {
  divisions?: TournamentDivision[];
};

// ============================================================================
// DTOs
// ============================================================================

/** Fields used to create the parent `events` row for a tournament. */
export interface CreateTournamentDto {
  institution_id: string;
  name: string;
  description?: string;
  scope?: TournamentScope;
  /** Defaults derived from scope when omitted (see service). */
  visibility?: 'public' | 'all_jkkn' | 'institution' | 'invited';
  start_date?: string;
  end_date?: string;
  registration_open_date?: string;
  registration_close_date?: string;
  venue?: string;
  is_public?: boolean;
  allow_external_registration?: boolean;
  year?: number;
  /** Optional divisions seeded at creation. At least one is recommended. */
  divisions?: CreateDivisionDto[];
}

/** Fields used to create a single division (event_id filled by the service). */
export interface CreateDivisionDto {
  sport: string;
  gender?: DivisionGender | string;
  age_band?: string;
  format?: TournamentFormat;
  level?: SportLevel;
  max_teams?: number;
  eligibility?: Record<string, unknown>;
  config?: Record<string, unknown>;
  sort_order?: number;
}

export interface UpdateDivisionDto {
  sport?: string;
  gender?: DivisionGender | string | null;
  age_band?: string | null;
  format?: TournamentFormat;
  level?: SportLevel | null;
  max_teams?: number | null;
  eligibility?: Record<string, unknown>;
  config?: Record<string, unknown>;
  sort_order?: number;
  is_active?: boolean;
}

// ============================================================================
// PR2 — Registration (entries) + rosters
// ============================================================================

/** Whether a division entry is a single competitor or a team with a roster. */
export type EntryType = 'individual' | 'team';

/** Lifecycle status of a tournament entry. */
export type EntryStatus = 'registered' | 'confirmed' | 'withdrawn' | 'disqualified';

export const ENTRY_STATUSES: { value: EntryStatus; label: string }[] = [
  { value: 'registered', label: 'Registered' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'disqualified', label: 'Disqualified' },
];

/** Roster member role within a team. Matches the DB CHECK constraint. */
export type TeamMemberRole = 'captain' | 'player' | 'substitute' | 'coach' | 'manager';

export const TEAM_MEMBER_ROLES: { value: TeamMemberRole; label: string }[] = [
  { value: 'captain', label: 'Captain' },
  { value: 'player', label: 'Player' },
  { value: 'substitute', label: 'Substitute' },
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Manager' },
];

/**
 * Eligibility rules a division can enforce at registration. Stored in
 * `tournament_divisions.eligibility` (JSONB) and validated server-side in the
 * register API route against the registrant's learners_profiles record.
 */
export interface EligibilityRules {
  students_only?: boolean;   // entry/members must be JKKN learners (have a learner_id)
  gender?: DivisionGender;   // 'male' | 'female' restrict; 'open' | 'mixed' = any
  min_age?: number;          // inclusive, computed from date_of_birth as of today
  max_age?: number;          // inclusive
}

/** A roster member of a team entry. */
export interface TournamentTeamMember {
  id: string;
  entry_id: string;
  learner_id: string | null;
  member_name: string;
  jersey_no: string | null;
  role: TeamMemberRole;
  created_at: string;
  updated_at: string;
}

/** A competitor (team OR individual) entered into a division. */
export interface TournamentEntry {
  id: string;
  event_id: string;
  division_id: string;
  registration_id: string | null;
  entry_type: EntryType;
  entry_name: string;
  institution_id: string | null;
  institution_name: string | null;
  is_external: boolean;
  captain_learner_id: string | null;
  seed: number | null;
  status: EntryStatus;
  final_rank: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined (organizer view, server-side only — NOT exposed to the public scoreboard):
  payment_status?: string | null;
  payment_amount?: number | null;
  members?: TournamentTeamMember[];
}

/** One roster member supplied at registration time. */
export interface CreateTeamMemberDto {
  learner_id?: string | null;
  member_name: string;
  jersey_no?: string | null;
  role?: TeamMemberRole;
}

/**
 * Register an entry into a division. For an individual the participant fields
 * describe the competitor; for a team, entry_name is the team name and `members`
 * is the roster. External entries set is_external + institution_name (no
 * institution_id, no learner_id).
 */
export interface CreateEntryDto {
  division_id: string;
  entry_type: EntryType;
  entry_name: string;                 // individual name OR team name
  institution_id?: string | null;
  institution_name?: string | null;
  is_external?: boolean;

  // Individual competitor identity / contact (also used as the payer):
  learner_id?: string | null;
  participant_phone?: string | null;
  participant_email?: string | null;
  participant_gender?: string | null;
  participant_age?: number | null;

  // Team:
  captain_learner_id?: string | null;
  members?: CreateTeamMemberDto[];

  // Payment intent: 'online' generates a gateway link; 'offline' marks unpaid
  // (organizer collects cash and marks paid later); omitted for free divisions.
  payment_mode?: 'online' | 'offline';
  notes?: string | null;

  // Answers to this tournament's custom registration fields (Dynamic Form Builder).
  custom_fields?: Record<string, unknown> | null;
}

/** Result of a register call: the created entry, plus Razorpay order details when a payment was initiated. */
export interface RegisterEntryResult {
  entry: TournamentEntry;
  payment_url?: string | null;
  transaction_id?: string | null;
  razorpay_order_id?: string | null;
  razorpay_key_id?: string | null;
  amount_paise?: number | null;
  customer?: { name?: string; email?: string; phone?: string } | null;
}

export interface UpdateEntryDto {
  entry_name?: string;
  seed?: number | null;
  status?: EntryStatus;
  final_rank?: number | null;
  notes?: string | null;
}

// ============================================================================
// Dynamic Registration Form Builder
// ============================================================================

/** A registration form field's input type. Independent of Admission's own
 * FormFieldType union by design (decision #6: independent schema, not a
 * shared cross-module table) — kept as an identical value set for consistency. */
export type FormFieldType =
  | 'text'
  | 'number'
  | 'phone'
  | 'email'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'textarea'
  | 'file'
  | 'image'
  /** Display-only: the organizer attaches an image, registrants just see it. */
  | 'image_display'
  | 'checkbox'
  | 'radio';

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'select', label: 'Dropdown (single choice)' },
  { value: 'multi_select', label: 'Dropdown (multiple choice)' },
  { value: 'date', label: 'Date' },
  { value: 'textarea', label: 'Long text' },
  { value: 'file', label: 'File upload (PDF / Word / image)' },
  { value: 'image', label: 'Image upload (with preview)' },
  { value: 'image_display', label: 'Image (display only — no answer)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio (single choice)' },
];

/** Field types whose answer is an EventFormUpload object, not a scalar. */
export const UPLOAD_FIELD_TYPES = new Set<FormFieldType>(['file', 'image']);

/**
 * Field types that COLLECT NOTHING — they render content and store no answer.
 *
 * Everything that walks the answer set has to skip these, or a display image
 * gets treated as an unanswered question: required-checks would block submit on
 * a field with no input, and the responses table would grow an always-empty
 * column.
 */
export const DISPLAY_ONLY_FIELD_TYPES = new Set<FormFieldType>(['image_display']);

/** True when the field asks the registrant for something. */
export function isAnswerableField(type: FormFieldType): boolean {
  return !DISPLAY_ONLY_FIELD_TYPES.has(type);
}

/**
 * What a 'file' / 'image' answer actually stores in
 * events_registrations.custom_fields.
 *
 * An OBJECT, not a URL string, and deliberately not a public URL: the bucket is
 * private, so a stored URL would be dead on arrival. `path` is the storage key —
 * organizers exchange it for a short-lived signed URL when they want to look at
 * the file. name/size/mime are denormalised so a responses list can be rendered
 * without touching storage at all.
 */
export interface EventFormUpload {
  /** Storage key inside the `event-registration-uploads` bucket. */
  path: string;
  /** Original filename, for display and download. */
  name: string;
  /** Bytes. */
  size: number;
  /** Content type as validated server-side, not as claimed by the browser. */
  mime: string;
}

/**
 * Narrow an unknown custom_fields answer to an upload. Returns null for
 * anything that isn't one — including `{}`, which is what a half-finished
 * upload leaves behind and which a naive truthiness check would accept as a
 * completed answer.
 */
export function asFormUpload(value: unknown): EventFormUpload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return typeof v.path === 'string' && v.path.trim() !== ''
    ? {
        path: v.path,
        name: typeof v.name === 'string' ? v.name : 'attachment',
        size: typeof v.size === 'number' ? v.size : 0,
        mime: typeof v.mime === 'string' ? v.mime : 'application/octet-stream',
      }
    : null;
}

export interface FormFieldOption {
  label: string;
  value: string;
}

/** Conditional visibility: show this field only when `field` (another field_key
 * on the same form) satisfies `op` against `value`. */
export interface FormFieldCondition {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'not_empty' | 'empty';
  value: string;
}

export interface EventRegistrationFormField {
  id: string;
  section_id: string;
  /** Owning form. field_key is unique per (form_id, field_key), NOT per event. */
  form_id: string;
  event_id: string;
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  is_required: boolean;
  display_order: number;
  placeholder: string | null;
  help_text: string | null;
  min_length: number | null;
  max_length: number | null;
  min_value: number | null;
  max_value: number | null;
  pattern: string | null;
  options: FormFieldOption[] | null;
  condition: FormFieldCondition | null;
  /**
   * Public URL of the image an 'image_display' field shows. NULL for every
   * other field type. Public, unlike registrant uploads, because an anonymous
   * visitor renders it with a plain <img src> and a signed URL would expire
   * while the form is still live.
   */
  media_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRegistrationFormSection {
  id: string;
  form_id: string;
  event_id: string;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  fields?: EventRegistrationFormField[];
}

export interface EventRegistrationForm {
  id: string;
  event_id: string;
  /** Organizer-facing label, e.g. "January 2026". */
  name: string;
  /** URL segment for the public link: /…/register?form=<slug>. Unique per event. */
  slug: string;
  description: string | null;
  /**
   * The organizer's manual Active/Inactive switch. NOT the whole answer to
   * "can someone register?" — the window below can override it. Use
   * `isFormOpen()`, never this field alone.
   */
  is_enabled: boolean;
  /** Registration opens at this moment. NULL = as soon as is_enabled is true. */
  starts_at: string | null;
  /** Registration closes at this moment. NULL = no end. */
  ends_at: string | null;
  display_order: number;
  /**
   * Whether this form charges at all. Separate from the amount so a fee can be
   * switched off without destroying the price — and so "free" is distinguishable
   * from "nobody has set a price yet".
   *
   * A fee is collected only when `fee_enabled && fee_amount > 0`. Use
   * `effectiveFee()` rather than testing either field alone.
   */
  fee_enabled: boolean;
  /**
   * Registration fee in INR for THIS form — an event holds many forms and each
   * run can charge differently. Ignored entirely while `fee_enabled` is false.
   * Postgres numeric arrives over PostgREST as a STRING, so callers must
   * Number() it rather than trusting the declared type at runtime.
   */
  fee_amount: number;
  /** Optional label beside the amount, e.g. "Delegate fee". */
  fee_label: string | null;
  created_at: string;
  updated_at: string;
  sections?: EventRegistrationFormSection[];
}

/**
 * Why a form is or isn't accepting registrations right now.
 *
 *   active     open — switched on and inside its window
 *   inactive   the organizer switched it off by hand
 *   scheduled  switched on, but its start date hasn't arrived
 *   expired    its end date has passed
 *
 * The last two are the "auto-inactive" behaviour, and they are DERIVED, never
 * stored. A cron flipping is_enabled would leave an expired form collecting
 * registrations whenever the job failed, would not reopen when someone extended
 * the end date, and would collapse "closed by hand" and "closed by time" into
 * one flag so the UI could no longer say WHY a form is shut.
 */
export type FormRegistrationState = 'active' | 'inactive' | 'scheduled' | 'expired';

/** Shape needed to decide openness — loose so a raw PostgREST row fits. */
export interface FormWindowLike {
  is_enabled?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

/**
 * The ONE place openness is decided. Four gates depend on it — the public page,
 * the submit API, the upload API and the builder's badge — and a rule copied
 * four times is a rule that drifts. Drift here means a closed form still taking
 * money, or an open one turning people away.
 *
 * `now` is injectable so a server gate and a UI badge can agree on a moment
 * rather than each calling Date.now() a few milliseconds apart.
 */
export function formRegistrationState(
  form: FormWindowLike,
  now: Date = new Date()
): FormRegistrationState {
  if (!form.is_enabled) return 'inactive';
  if (form.starts_at) {
    const starts = new Date(form.starts_at);
    // An unparseable date must not silently gate registration open or shut;
    // ignore it rather than guess.
    if (!Number.isNaN(starts.getTime()) && now < starts) return 'scheduled';
  }
  if (form.ends_at) {
    const ends = new Date(form.ends_at);
    if (!Number.isNaN(ends.getTime()) && now > ends) return 'expired';
  }
  return 'active';
}

/** True only when a registration may actually be submitted right now. */
export function isFormOpen(form: FormWindowLike, now?: Date): boolean {
  return formRegistrationState(form, now) === 'active';
}

/** Human label for each state, for badges and error messages. */
export const FORM_STATE_LABELS: Record<FormRegistrationState, string> = {
  active: 'Active',
  inactive: 'Inactive',
  scheduled: 'Scheduled',
  expired: 'Expired',
};

/**
 * What a registrant is actually charged for this form: the amount when the fee
 * is switched on and priced, otherwise 0.
 *
 * The ONE place the "enabled AND > 0" rule lives. Four callers need it — the
 * builder card, the forms list badge, the public page and the submit route — and
 * a rule copied four times is a rule that drifts. A form left enabled with no
 * price is free, not broken.
 *
 * Takes a loose shape on purpose: the submit route reads a raw PostgREST row,
 * where numeric arrives as a STRING ("200.00" — truthy even at zero), so the
 * Number() coercion has to happen HERE rather than being assumed of the caller.
 */
export function effectiveFee(form: {
  fee_enabled?: boolean | null;
  fee_amount?: unknown;
}): number {
  if (!form.fee_enabled) return 0;
  const amount = Number(form.fee_amount ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/** A form in the picker list, with the counts the list needs. */
export interface EventRegistrationFormSummary extends EventRegistrationForm {
  field_count: number;
  response_count: number;
}

export interface CreateFormSectionDto {
  title: string;
  display_order?: number;
}

export interface UpdateFormSectionDto {
  title?: string;
  display_order?: number;
}

export interface CreateFormFieldDto {
  section_id: string;
  field_key: string;
  field_label: string;
  field_type: FormFieldType;
  is_required?: boolean;
  display_order?: number;
  placeholder?: string | null;
  help_text?: string | null;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  options?: FormFieldOption[] | null;
  condition?: FormFieldCondition | null;
}

export interface UpdateFormFieldDto {
  field_key?: string;
  field_label?: string;
  field_type?: FormFieldType;
  is_required?: boolean;
  display_order?: number;
  placeholder?: string | null;
  help_text?: string | null;
  min_length?: number | null;
  max_length?: number | null;
  min_value?: number | null;
  max_value?: number | null;
  pattern?: string | null;
  options?: FormFieldOption[] | null;
  condition?: FormFieldCondition | null;
}

// ============================================================================
// PR3 — Fixtures / bracket engine + matches
// ============================================================================

/** Lifecycle of a single match. Matches the DB CHECK constraint. */
export type MatchStatus =
  | 'pending'        // created, not yet scheduled
  | 'scheduled'      // has a time/venue
  | 'completed'      // result entered (PR4)
  | 'walkover'       // a side did not show (PR4)
  | 'disqualified'   // a side DQ'd (PR4)
  | 'bye';           // auto-advanced (no opponent)

/** A single fixture in a division. */
export interface TournamentMatch {
  id: string;
  event_id: string;
  division_id: string;
  round_no: number;
  round_label: string | null;
  match_no: number;
  bracket_slot: number | null;
  pool: string | null;
  side_a_entry_id: string | null;
  side_b_entry_id: string | null;
  next_match_id: string | null;
  next_slot: 'a' | 'b' | null;
  scheduled_at: string | null;
  session_id: string | null;
  resource_reservation_id: string | null;
  official_human_role_id: string | null;
  status: MatchStatus;
  winner_entry_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined for display (organizer/public view):
  side_a_name?: string | null;
  side_b_name?: string | null;
  winner_name?: string | null;
}

/** Schedule a match: time + optional venue + optional official. */
export interface ScheduleMatchDto {
  scheduled_at: string;          // ISO datetime
  duration_minutes?: number;     // defaults to 60
  venue_text?: string | null;    // free-text venue label
  resource_id?: string | null;   // optional court/ground resource → books a resource_reservation
  official_name?: string | null; // optional umpire/referee (free text)
}

export interface GenerateFixturesResult {
  matches_created: number;
}

// ============================================================================
// PR4 — Results + standings + public scoreboard
// ============================================================================

/** Record a match result. status: completed (winner required) | walkover | disqualified. */
export interface RecordResultDto {
  status: 'completed' | 'walkover' | 'disqualified';
  winner_entry_id?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  sets?: unknown | null;
  notes?: string | null;
}

/** A computed standings row (round-robin / league / pool table). */
export interface StandingsRow {
  division_id: string;
  pool: string | null;
  entry_id: string;
  entry_name: string;
  institution_name: string | null;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
}

/** Public scoreboard payload (fn_tournament_public_scoreboard) — NO PII. */
export interface PublicScoreboard {
  tournament: {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
    venue: string | null;
    venue_text: string | null;
    status: string;
    scope: string;
    visibility: string;
  };
  divisions: Array<{
    id: string;
    sport: string;
    gender: string | null;
    age_band: string | null;
    format: string;
    level: string | null;
  }>;
  entries: Array<{
    id: string;
    division_id: string;
    entry_name: string;
    institution_name: string | null;
    is_external: boolean;
    seed: number | null;
    final_rank: number | null;
    status: string;
  }>;
  matches: Array<{
    id: string;
    division_id: string;
    round_no: number;
    round_label: string | null;
    match_no: number;
    pool: string | null;
    side_a_name: string | null;
    side_b_name: string | null;
    score_a: number | null;
    score_b: number | null;
    status: MatchStatus;
    scheduled_at: string | null;
    winner_name: string | null;
  }>;
  standings: StandingsRow[];
}

