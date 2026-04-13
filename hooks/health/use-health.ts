// hooks/health/use-health.ts
// React Query hooks for the Health Module
// Created: 2026-04-12

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { HealthService } from '@/lib/services/health/health-service';
import type {
  HealthDashboardData,
  HealthProfile,
  HealthProfileFormData,
  MoodCheckinData,
  LeaderboardEntry,
  LeaderboardType,
} from '@/types/health';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  dashboard: (learnerId: string) => ['health-dashboard', learnerId] as const,
  profile: (learnerId: string) => ['health-profile', learnerId] as const,
  todayLog: (learnerId: string) => ['health-today-log', learnerId] as const,
  streaks: (learnerId: string) => ['health-streaks', learnerId] as const,
  leaderboard: (type: LeaderboardType, instId?: string) => ['health-leaderboard', type, instId] as const,
  consent: (learnerId: string) => ['health-consent', learnerId] as const,
};

// ============================================================================
// Consent
// ============================================================================

export function useHealthConsent(learnerId: string | undefined) {
  return useQuery({
    queryKey: KEYS.consent(learnerId || ''),
    queryFn: () => HealthService.hasConsented(learnerId!),
    enabled: !!learnerId,
  });
}

export function useGiveConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) => HealthService.giveConsent(learnerId),
    onSuccess: (_, learnerId) => {
      qc.invalidateQueries({ queryKey: KEYS.consent(learnerId) });
      qc.invalidateQueries({ queryKey: KEYS.dashboard(learnerId) });
    },
  });
}

// ============================================================================
// Dashboard
// ============================================================================

export function useHealthDashboard(learnerId: string | undefined, institutionId?: string) {
  return useQuery<HealthDashboardData>({
    queryKey: KEYS.dashboard(learnerId || ''),
    queryFn: () => HealthService.getDashboardData(learnerId!, institutionId),
    enabled: !!learnerId,
    refetchInterval: 30_000, // Auto-refresh every 30s
  });
}

// ============================================================================
// Profile
// ============================================================================

export function useHealthProfile(learnerId: string | undefined) {
  return useQuery<HealthProfile>({
    queryKey: KEYS.profile(learnerId || ''),
    queryFn: () => HealthService.getOrCreateProfile(learnerId!),
    enabled: !!learnerId,
  });
}

export function useUpdateHealthProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, data }: { learnerId: string; data: Partial<HealthProfileFormData> }) =>
      HealthService.updateProfile(learnerId, data),
    onSuccess: (_, { learnerId }) => {
      qc.invalidateQueries({ queryKey: KEYS.profile(learnerId) });
      qc.invalidateQueries({ queryKey: KEYS.dashboard(learnerId) });
      toast.success('Health profile updated');
    },
    onError: () => toast.error('Failed to update profile'),
  });
}

// ============================================================================
// Mood Check-in
// ============================================================================

export function useMoodCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, data }: { learnerId: string; data: MoodCheckinData }) =>
      HealthService.upsertMoodCheckin(learnerId, data),
    onSuccess: (_, { learnerId }) => {
      qc.invalidateQueries({ queryKey: KEYS.dashboard(learnerId) });
      qc.invalidateQueries({ queryKey: KEYS.streaks(learnerId) });
      qc.invalidateQueries({ queryKey: KEYS.todayLog(learnerId) });
      toast.success('Mood check-in saved!');
    },
    onError: () => toast.error('Failed to save check-in'),
  });
}

// ============================================================================
// Steps
// ============================================================================

export function useUpdateSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, steps }: { learnerId: string; steps: number }) =>
      HealthService.updateSteps(learnerId, steps),
    onSuccess: (_, { learnerId }) => {
      qc.invalidateQueries({ queryKey: KEYS.dashboard(learnerId) });
      toast.success('Steps updated');
    },
    onError: () => toast.error('Failed to update steps'),
  });
}

// ============================================================================
// Water
// ============================================================================

export function useUpdateWater() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ learnerId, glasses }: { learnerId: string; glasses: number }) =>
      HealthService.updateWater(learnerId, glasses),
    onSuccess: (_, { learnerId }) => {
      qc.invalidateQueries({ queryKey: KEYS.dashboard(learnerId) });
    },
  });
}

// ============================================================================
// Leaderboard
// ============================================================================

export function useHealthLeaderboard(type: LeaderboardType, institutionId?: string) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: KEYS.leaderboard(type, institutionId),
    queryFn: () => HealthService.getLeaderboard(type, institutionId),
    refetchInterval: 60_000,
  });
}
