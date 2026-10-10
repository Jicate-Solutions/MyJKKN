// hooks/events/use-tournament-fixtures.ts
// React Query hooks for fixtures/bracket + scheduling (Sports Tournament PR3).
// Created: 2026-06-22 (Sports Tournament PR3).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TournamentFixturesService, type UpdateHeatDto } from '@/lib/services/events/tournament/tournament-fixtures-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ScheduleMatchDto,
  RecordResultDto,
  SetMatchSideDto,
  SetFixtureModeDto,
  ManualMatchDto,
} from '@/types/tournament';

const KEYS = {
  matches: (eventId: string) => ['tournament-matches', eventId] as const,
  heats: (eventId: string) => ['tournament-heats', eventId] as const,
};

export function useTournamentMatches(eventId: string) {
  return useQuery({
    queryKey: KEYS.matches(eventId),
    queryFn: () => TournamentFixturesService.listMatches(eventId),
    enabled: !!eventId,
  });
}

export function useGenerateFixtures(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ divisionId, regenerate }: { divisionId: string; regenerate?: boolean }) =>
      TournamentFixturesService.generate(eventId, divisionId, regenerate),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.success(`Generated ${res.matches_created} match${res.matches_created === 1 ? '' : 'es'}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to generate fixtures'),
  });
}

export function useGenerateKnockoutFromPools(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ divisionId, regenerate }: { divisionId: string; regenerate?: boolean }) =>
      TournamentFixturesService.generateKnockoutFromPools(eventId, divisionId, regenerate),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.success(`Knockout generated — ${res.matches_created} match${res.matches_created === 1 ? '' : 'es'}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to generate knockout'),
  });
}

export function useScheduleMatch(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, dto }: { matchId: string; dto: ScheduleMatchDto }) =>
      TournamentFixturesService.schedule(eventId, matchId, dto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      if (res.warning) toast(res.warning, { icon: '⚠️' });
      else toast.success('Match scheduled');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to schedule match'),
  });
}

export function useSetMatchSide(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, dto }: { matchId: string; dto: SetMatchSideDto }) =>
      TournamentFixturesService.setMatchSide(eventId, matchId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      // A side swapped out of the bracket is withdrawn, so entries change too.
      qc.invalidateQueries({ queryKey: ['tournament-entries', eventId] });
      toast.success('Fixture updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update the fixture'),
  });
}

/** Fixture mode lives on the division row, so the tournament (with divisions) refreshes too. */
function invalidateBracket(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
  // ['tournaments', 'detail', id] (use-tournaments) carries the divisions' config.
  qc.invalidateQueries({ queryKey: ['tournaments', 'detail', eventId] });
}

export function useSetFixtureMode(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SetFixtureModeDto) => TournamentFixturesService.setFixtureMode(eventId, dto),
    onSuccess: (res) => {
      invalidateBracket(qc, eventId);
      toast.success(
        res.mode === 'manual'
          ? 'Manual fixtures on. Add and edit matches yourself.'
          : `Fixtures generated: ${res.matches_created ?? 0} matches`
      );
    },
    onError: (e: Error) => {
      invalidateBracket(qc, eventId);
      toast.error(e.message || 'Failed to change the fixture mode');
    },
  });
}

export function useSaveManualMatch(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, matchId }: { dto: ManualMatchDto; matchId?: string }) =>
      TournamentFixturesService.saveManualMatch(eventId, dto, matchId),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.success(v.matchId ? 'Match updated' : 'Match added');
    },
    onError: (e: Error) => {
      // A stale-side refusal means the list on screen is old: refresh it so the
      // next try starts from what is really there.
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.error(e.message || 'Failed to save the match');
    },
  });
}

export function useDeleteManualMatch(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      matchId,
      expected,
    }: {
      matchId: string;
      expected: { expected_side_a: string | null; expected_side_b: string | null };
    }) => TournamentFixturesService.deleteManualMatch(eventId, matchId, expected),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.success('Match deleted');
    },
    onError: (e: Error) => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.error(e.message || 'Failed to delete the match');
    },
  });
}

export function useRecordResult(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, dto }: { matchId: string; dto: RecordResultDto }) =>
      TournamentFixturesService.recordResult(eventId, matchId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      toast.success('Result recorded');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to record result'),
  });
}

export function useAwardAchievements(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (divisionId: string) =>
      TournamentFixturesService.awardAchievements(eventId, divisionId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.matches(eventId) });
      if (res.achievements_written > 0) {
        toast.success(
          `${res.achievements_written} achievement${res.achievements_written === 1 ? '' : 's'} awarded to athlete profiles`
        );
      } else {
        toast('Finalized — no JKKN learners linked to the placed entries.', { icon: 'ℹ️' });
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to award achievements'),
  });
}

/**
 * Divisions (of those given) that have EVER had a recorded result — the marks
 * the #4304 lock keeps after a rollback or delete. Read on the caller's session:
 * a mark is visible exactly when its division is (20271010180000).
 */
export function useDivisionResultMarks(eventId: string, divisionIds: string[]) {
  const ids = [...divisionIds].sort();
  return useQuery({
    queryKey: ['tournament-division-result-marks', eventId, ids] as const,
    queryFn: async (): Promise<string[]> => {
      if (ids.length === 0) return [];
      const { data, error } = await (createClientSupabaseClient() as any)
        .from('tournament_division_result_marks')
        .select('division_id')
        .in('division_id', ids);
      if (error) throw new Error(error.message || 'Could not check recorded results');
      return ((data ?? []) as { division_id: string }[]).map((r) => r.division_id);
    },
    enabled: !!eventId,
  });
}

// ── Heats ──────────────────────────────────────────────────────────────────

export function useTournamentHeats(eventId: string) {
  return useQuery({
    queryKey: KEYS.heats(eventId),
    queryFn: () => TournamentFixturesService.listHeats(eventId),
    enabled: !!eventId,
  });
}

export function useGenerateHeats(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { divisionId: string; heatSize: number; regenerate?: boolean }) =>
      TournamentFixturesService.generateHeats(eventId, v.divisionId, v.heatSize, v.regenerate),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.heats(eventId) });
      toast.success(`Created ${res.heats_created} heat${res.heats_created === 1 ? '' : 's'}`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to generate heats'),
  });
}

export function useAddHeat(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (divisionId: string) => TournamentFixturesService.addHeat(eventId, divisionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.heats(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to add heat'),
  });
}

export function useUpdateHeat(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { heatId: string; dto: UpdateHeatDto }) =>
      TournamentFixturesService.updateHeat(eventId, v.heatId, v.dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.heats(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to update heat'),
  });
}

export function useDeleteHeat(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (heatId: string) => TournamentFixturesService.deleteHeat(eventId, heatId),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.heats(eventId) }),
    onError: (e: Error) => toast.error(e.message || 'Failed to delete heat'),
  });
}

export function useFinalizeHeats(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (divisionId: string) => TournamentFixturesService.finalizeHeats(eventId, divisionId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.heats(eventId) });
      toast.success(
        res.achievements_written > 0
          ? `Finalized — ${res.achievements_written} achievement${res.achievements_written === 1 ? '' : 's'} awarded`
          : 'Finalized — no JKKN learners linked to the placed entries.',
      );
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to finalize'),
  });
}
