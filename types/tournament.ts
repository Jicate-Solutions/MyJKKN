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
