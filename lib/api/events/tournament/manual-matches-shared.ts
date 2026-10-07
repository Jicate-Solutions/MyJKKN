// Shared by the manual-match handlers (manual-matches, manual-matches-match).
// Not a route module: it exports helpers, not HTTP methods.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canManageTournament } from '@/lib/services/events/tournament/organizer-access';
import type { ManualMatchDto } from '@/types/tournament';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
export const isUuidOrNull = (v: unknown) => v === null || isUuid(v);

export type SessionClient = Awaited<ReturnType<typeof createClient>>;

export async function guard(eventId: string): Promise<{ auth: SessionClient } | { res: NextResponse }> {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { res: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const canManage = await canManageTournament(auth, eventId);
  if (canManage !== true) {
    return { res: NextResponse.json({ error: 'Forbidden — sports.tournaments.manage required' }, { status: 403 }) };
  }
  return { auth };
}

export async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  const raw: unknown = await request.json().catch(() => null);
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

/** Validates the match fields shared by add and edit. Returns an error message or null. */
export function invalidMatch(dto: Partial<ManualMatchDto>): string | null {
  if (!isUuid(dto.division_id)) return 'division_id must be a uuid';
  if (!Number.isInteger(dto.round_no) || (dto.round_no as number) < 1 || (dto.round_no as number) > 20) {
    return 'round_no must be a whole number from 1 to 20';
  }
  if (dto.round_label != null && typeof dto.round_label !== 'string') return 'round_label must be text';
  if (!isUuid(dto.side_a_entry_id) || !isUuid(dto.side_b_entry_id)) return 'pick both sides';
  return null;
}

/** The match must be in this tournament (and, for an edit, in the stated division). */
export async function matchInEvent(auth: SessionClient, eventId: string, matchId: string) {
  const { data } = await auth
    .from('tournament_matches')
    .select('id, division_id')
    .eq('id', matchId)
    .eq('event_id', eventId)
    .maybeSingle();
  return data as { id: string; division_id: string } | null;
}

