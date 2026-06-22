// types/tournament.ts
// Sports Tournament types — PR1 (entity + divisions).
// A tournament IS an `events` row with event_type='sports_tournament'.
// REUSES SportLevel / TEAM_SPORTS / INDIVIDUAL_SPORTS / JKKN_SPORTS from
// types/health-sports.ts — do NOT define parallel sport enums here.
// Created: 2026-06-22 (Sports Tournament PR1).

import type { SportLevel } from '@/types/health-sports';
import type { Event } from '@/types/events';

// ============================================================================
// Enums & Constants
// ============================================================================

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
}

/** Result of a register call: the created entry, plus a payment link when online. */
export interface RegisterEntryResult {
  entry: TournamentEntry;
  payment_url?: string | null;
  transaction_id?: string | null;
}

export interface UpdateEntryDto {
  entry_name?: string;
  seed?: number | null;
  status?: EntryStatus;
  final_rank?: number | null;
  notes?: string | null;
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

