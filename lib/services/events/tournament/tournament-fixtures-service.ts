// lib/services/events/tournament/tournament-fixtures-service.ts
// Client service for fixtures/bracket + match scheduling (Sports Tournament PR3).
// Thin fetch wrappers over /api/events/tournament/[eventId]/{fixtures,matches}.
// Created: 2026-06-22 (Sports Tournament PR3).

import type {
  TournamentMatch,
  ScheduleMatchDto,
  SetMatchSideDto,
  SetFixtureModeDto,
  ManualMatchDto,
  GenerateFixturesResult,
  RecordResultDto,
  TournamentHeat,
} from '@/types/tournament';

export interface UpdateHeatDto {
  scheduled_at?: string | null;
  venue_text?: string | null;
  add_entry_ids?: string[];
  remove_entry_ids?: string[];
  results?: Array<{
    heat_entry_id: string;
    position?: number | null;
    mark?: string | null;
    mark_value?: number | null;
    result_status?: 'ok' | 'dns' | 'dnf' | 'dq';
  }>;
}

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 207) {
    throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
  }
  return body as T;
}

export class TournamentFixturesService {
  /** Generate (or regenerate) the bracket/schedule for a division. */
  static async generate(
    eventId: string,
    divisionId: string,
    regenerate = false
  ): Promise<GenerateFixturesResult> {
    const res = await fetch(`/api/events/tournament/${eventId}/fixtures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division_id: divisionId, regenerate }),
    });
    return asJson<GenerateFixturesResult>(res);
  }

  /** Build the knockout stage from finished pool standings (pools_ko divisions). */
  static async generateKnockoutFromPools(
    eventId: string,
    divisionId: string,
    regenerate = false
  ): Promise<GenerateFixturesResult> {
    const res = await fetch(`/api/events/tournament/${eventId}/fixtures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division_id: divisionId, regenerate, mode: 'pool_knockout' }),
    });
    return asJson<GenerateFixturesResult>(res);
  }

  /** List all matches for a tournament (joined with entry/winner names). */
  static async listMatches(eventId: string): Promise<TournamentMatch[]> {
    const res = await fetch(`/api/events/tournament/${eventId}/matches`, { cache: 'no-store' });
    const data = await asJson<{ matches: TournamentMatch[] }>(res);
    return data.matches ?? [];
  }

  /** Schedule a match (time + optional venue/court + optional official). */
  static async schedule(
    eventId: string,
    matchId: string,
    dto: ScheduleMatchDto
  ): Promise<{ match: TournamentMatch; clash: unknown[] | null; warning: string | null }> {
    const res = await fetch(`/api/events/tournament/${eventId}/matches/${matchId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    return asJson<{ match: TournamentMatch; clash: unknown[] | null; warning: string | null }>(res);
  }

  /**
   * Put an entry into one side of an unplayed knockout match, or fill the empty
   * side of a bye. The server holds every rule (fn_tournament_set_match_side).
   */
  static async setMatchSide(
    eventId: string,
    matchId: string,
    dto: SetMatchSideDto
  ): Promise<{ match: TournamentMatch }> {
    const res = await fetch(`/api/events/tournament/${eventId}/matches/${matchId}/side`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    return asJson<{ match: TournamentMatch }>(res);
  }

  /** Switch a division to manual fixtures, or back to auto (which regenerates the bracket). */
  static async setFixtureMode(
    eventId: string,
    dto: SetFixtureModeDto
  ): Promise<{ mode: string; matches_created?: number }> {
    const res = await fetch(`/api/events/tournament/${eventId}/fixture-mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    return asJson<{ mode: string; matches_created?: number }>(res);
  }

  /** Add (matchId omitted) or edit a match in a manual-mode division. */
  static async saveManualMatch(
    eventId: string,
    dto: ManualMatchDto,
    matchId?: string
  ): Promise<{ match: TournamentMatch }> {
    const url = matchId
      ? `/api/events/tournament/${eventId}/manual-matches/${matchId}`
      : `/api/events/tournament/${eventId}/manual-matches`;
    const res = await fetch(url, {
      method: matchId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    return asJson<{ match: TournamentMatch }>(res);
  }

  /** Delete a match without a result from a manual-mode division. */
  static async deleteManualMatch(
    eventId: string,
    matchId: string,
    expected: { expected_side_a: string | null; expected_side_b: string | null }
  ): Promise<{ ok: true }> {
    const res = await fetch(`/api/events/tournament/${eventId}/manual-matches/${matchId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expected),
    });
    return asJson<{ ok: true }>(res);
  }

  /** Record a match result (advances the knockout winner). */
  static async recordResult(
    eventId: string,
    matchId: string,
    dto: RecordResultDto
  ): Promise<{ match: TournamentMatch }> {
    const res = await fetch(`/api/events/tournament/${eventId}/matches/${matchId}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    return asJson<{ match: TournamentMatch }>(res);
  }

  /** Finalize a division: award achievements to JKKN learners on placed entries. */
  static async awardAchievements(
    eventId: string,
    divisionId: string
  ): Promise<{ achievements_written: number }> {
    const res = await fetch(`/api/events/tournament/${eventId}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ division_id: divisionId }),
    });
    return asJson<{ achievements_written: number }>(res);
  }

  // ── Heats (athletics-style group rounds) ────────────────────────────────

  static async listHeats(eventId: string): Promise<TournamentHeat[]> {
    const res = await fetch(`/api/events/tournament/${eventId}/heats`, { cache: 'no-store' });
    const data = await asJson<{ heats: TournamentHeat[] }>(res);
    return data.heats ?? [];
  }

  private static async postHeats<T>(eventId: string, body: object): Promise<T> {
    const res = await fetch(`/api/events/tournament/${eventId}/heats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return asJson<T>(res);
  }

  /** Split the division's active entries into heats of `heatSize` athletes. */
  static generateHeats(eventId: string, divisionId: string, heatSize: number, regenerate = false) {
    return this.postHeats<{ heats_created: number }>(eventId, {
      action: 'generate',
      division_id: divisionId,
      heat_size: heatSize,
      regenerate,
    });
  }

  /** Add an empty heat (fully manual building). */
  static addHeat(eventId: string, divisionId: string) {
    return this.postHeats<{ heats_created: number }>(eventId, { action: 'add_heat', division_id: divisionId });
  }

  /** Rank the division, stamp final ranks and award the top 3. */
  static finalizeHeats(eventId: string, divisionId: string) {
    return this.postHeats<{ achievements_written: number }>(eventId, {
      action: 'finalize',
      division_id: divisionId,
    });
  }

  static async updateHeat(eventId: string, heatId: string, dto: UpdateHeatDto): Promise<void> {
    const res = await fetch(`/api/events/tournament/${eventId}/heats/${heatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    await asJson<{ ok: boolean }>(res);
  }

  static async deleteHeat(eventId: string, heatId: string): Promise<void> {
    const res = await fetch(`/api/events/tournament/${eventId}/heats/${heatId}`, { method: 'DELETE' });
    await asJson<{ ok: boolean }>(res);
  }
}
