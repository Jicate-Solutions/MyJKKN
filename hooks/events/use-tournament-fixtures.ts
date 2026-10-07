// hooks/events/use-tournament-fixtures.ts
// React Query hooks for fixtures/bracket + scheduling (Sports Tournament PR3).
// Created: 2026-06-22 (Sports Tournament PR3).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TournamentFixturesService } from '@/lib/services/events/tournament/tournament-fixtures-service';
import type {
  ScheduleMatchDto,
  RecordResultDto,
  SetMatchSideDto,
  SetFixtureModeDto,
  ManualMatchDto,
} from '@/types/tournament';

const KEYS = {
  matches: (eventId: string) => ['tournament-matches', eventId] as const,
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
    onError: (e: Error) => toast.error(e.message || 'Failed to save the match'),
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
    onError: (e: Error) => toast.error(e.message || 'Failed to delete the match'),
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
