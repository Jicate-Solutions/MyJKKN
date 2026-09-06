// lib/services/health/wellness-leaderboard-service.ts
// Service for the Wellness Programs COMPETITIVE section-level completion leaderboard.
// Reads the privacy-guarded RPC fn_health_program_section_leaderboard.
// Created: 2026-06-15
//
// PRIVACY: the RPC ranks SECTIONS only — no names, no non-participant data, and
// sections below the director-set min size are hidden. This service is a thin
// pass-through; it must never request or expose individual-level rows.
//
// NOTE: the new RPC isn't in types/supabase.ts yet → (supabase as any).rpc(...),
// matching the existing wellness-programs-service.ts pattern (avoids TS2589).

import { createClientSupabaseClient } from '@/lib/supabase/client';

/** One ranked section on the leaderboard (aggregate only — never a person). */
export interface SectionLeaderboardRow {
  section_id: string;
  section_label: string;
  /** Participating members in this section (denominator). */
  members: number;
  /** Percent of participating members who completed all published days. */
  completion_pct: number;
  /** 1-based rank (ties share a rank — dense ranking). */
  rank: number;
}

/** Return shape of fn_health_program_section_leaderboard(program_id). */
export interface SectionLeaderboard {
  program_id: string;
  /** Privacy floor: sections smaller than this are hidden. */
  min_section_size: number;
  /** Published days the board ranks on (fair mid-week). */
  days_total: number;
  completion_rule: string;
  /** The viewer's own section, derived server-side — used only to highlight. */
  your_section_id: string | null;
  sections: SectionLeaderboardRow[];
}

const supabase = createClientSupabaseClient();

export class WellnessLeaderboardService {
  /**
   * Fetch the competitive section leaderboard for a program.
   * The RPC enforces the permission gate and the min-section-size privacy floor.
   */
  static async getSectionLeaderboard(programId: string): Promise<SectionLeaderboard> {
    const { data, error } = await (supabase as any).rpc(
      'fn_health_program_section_leaderboard',
      { p_program_id: programId }
    );
    if (error) throw error;
    return data as SectionLeaderboard;
  }
}
