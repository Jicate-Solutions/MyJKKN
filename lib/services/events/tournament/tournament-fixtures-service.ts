// lib/services/events/tournament/tournament-fixtures-service.ts
// Client service for fixtures/bracket + match scheduling (Sports Tournament PR3).
// Thin fetch wrappers over /api/events/tournament/[eventId]/{fixtures,matches}.
// Created: 2026-06-22 (Sports Tournament PR3).

import type {
  TournamentMatch,
  ScheduleMatchDto,
  GenerateFixturesResult,
} from '@/types/tournament';

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
}
