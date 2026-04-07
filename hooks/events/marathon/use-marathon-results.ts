// hooks/events/marathon/use-marathon-results.ts
// React Query hooks for marathon results and certificates.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonResultsService,
  type CreateResultDto,
} from '@/lib/services/events/marathon/marathon-results-service';
import {
  MarathonCertificateService,
} from '@/lib/services/events/marathon/marathon-certificate-service';
import type { MarathonResult } from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-results'] as const,
  results: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
  result: (id: string) => [...KEYS.all, 'detail', id] as const,
  gpsCount: (eventId: string) => [...KEYS.all, 'gps-count', eventId] as const,
  certStats: (eventId: string) => [...KEYS.all, 'cert-stats', eventId] as const,
  certList: (eventId: string) => [...KEYS.all, 'cert-list', eventId] as const,
};

// ============================================================================
// Results Queries
// ============================================================================

/** Fetch all results for an event. */
export function useMarathonResults(eventId: string) {
  return useQuery<MarathonResult[]>({
    queryKey: KEYS.results(eventId),
    queryFn: () => MarathonResultsService.getResults(eventId),
    enabled: !!eventId,
  });
}

/** Fetch a single result by ID. */
export function useMarathonResult(id: string) {
  return useQuery<MarathonResult | null>({
    queryKey: KEYS.result(id),
    queryFn: () => MarathonResultsService.getResult(id),
    enabled: !!id,
  });
}

/** Count available GPS tracks for import. */
export function useGPSTrackCount(eventId: string) {
  return useQuery<number>({
    queryKey: KEYS.gpsCount(eventId),
    queryFn: () => MarathonResultsService.getGPSTrackCount(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Results Mutations
// ============================================================================

/** Import results from GPS tracking data. */
export function useImportFromGPS() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => MarathonResultsService.importFromGPS(eventId),
    onSuccess: (result, eventId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.results(eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.gpsCount(eventId) });
      const summary = `Imported: ${result.imported} | Skipped: ${result.skipped}${result.errors.length > 0 ? ` | Errors: ${result.errors.length}` : ''}`;
      toast.success(`GPS import completed. ${summary}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'GPS import failed');
    },
  });
}

/** Manually create a result. */
export function useCreateResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateResultDto) => MarathonResultsService.createResult(dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: KEYS.results(result.event_id) });
      toast.success(`Result added for BIB ${result.bib_number}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add result');
    },
  });
}

/** Update an existing result. */
export function useUpdateResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MarathonResult> }) =>
      MarathonResultsService.updateResult(id, dto),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: KEYS.results(result.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.result(result.id) });
      toast.success('Result updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update result');
    },
  });
}

/** Recalculate all rankings for an event. */
export function useRecalculateRankings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) => MarathonResultsService.recalculateRankings(eventId),
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.results(eventId) });
      toast.success('Rankings recalculated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to recalculate rankings');
    },
  });
}

/** Mark a result as DNF. */
export function useMarkDNF() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string; eventId: string }) =>
      MarathonResultsService.markDNF(id),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.results(variables.eventId) });
      toast.success(`BIB ${result.bib_number} marked as DNF`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark DNF');
    },
  });
}

/** Disqualify a result. */
export function useDisqualifyResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string; eventId: string }) =>
      MarathonResultsService.disqualify(id, reason),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.results(variables.eventId) });
      toast.success(`BIB ${result.bib_number} disqualified`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disqualify');
    },
  });
}

// ============================================================================
// Certificate Queries
// ============================================================================

/** Get certificate generation stats for an event. */
export function useCertificateStats(eventId: string) {
  return useQuery({
    queryKey: KEYS.certStats(eventId),
    queryFn: () => MarathonCertificateService.getCertificateStats(eventId),
    enabled: !!eventId,
  });
}

/** Get list of all generated certificates for an event. */
export function useCertificateList(eventId: string) {
  return useQuery({
    queryKey: KEYS.certList(eventId),
    queryFn: () => MarathonCertificateService.getCertificateList(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Certificate Mutations
// ============================================================================

/** Generate certificates for all eligible finishers. */
export function useGenerateCertificates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      MarathonCertificateService.generateCertificates(eventId),
    onSuccess: (result, eventId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.certStats(eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.certList(eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.results(eventId) });
      toast.success(`${result.generated} certificates generated`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to generate certificates');
    },
  });
}
