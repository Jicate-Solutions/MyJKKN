// hooks/events/marathon/use-marathon-sponsors.ts
// React Query hooks for marathon sponsorship CRM.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonSponsorService,
} from '@/lib/services/events/marathon/marathon-sponsor-service';
import type {
  MarathonSponsor,
  MarathonSponsorDeliverable,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-sponsors'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  listByEvent: (eventId: string) => [...KEYS.lists(), eventId] as const,
  details: () => [...KEYS.all, 'detail'] as const,
  detail: (id: string) => [...KEYS.details(), id] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch all sponsors for an event (with deliverable counts).
 */
export function useMarathonSponsors(eventId: string) {
  return useQuery({
    queryKey: KEYS.listByEvent(eventId),
    queryFn: () => MarathonSponsorService.getSponsors(eventId),
    enabled: !!eventId,
  });
}

/**
 * Fetch a single sponsor with deliverables and activity log.
 */
export function useMarathonSponsor(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => MarathonSponsorService.getSponsor(id),
    enabled: !!id,
  });
}

/**
 * Fetch sponsor summary stats for an event.
 */
export function useSponsorSummary(eventId: string) {
  return useQuery({
    queryKey: KEYS.summary(eventId),
    queryFn: () => MarathonSponsorService.getSponsorSummary(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new sponsor.
 */
export function useCreateSponsor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMarathonSponsorDto) =>
      MarathonSponsorService.createSponsor(dto),
    onSuccess: (sponsor) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(sponsor.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(sponsor.event_id) });
      toast.success(`Sponsor "${sponsor.company_name}" added`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create sponsor');
    },
  });
}

/**
 * Update sponsor fields.
 */
export function useUpdateSponsor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MarathonSponsor> }) =>
      MarathonSponsorService.updateSponsor(id, dto),
    onSuccess: (sponsor) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(sponsor.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(sponsor.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(sponsor.event_id) });
      toast.success('Sponsor updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update sponsor');
    },
  });
}

/**
 * Delete a sponsor.
 */
export function useDeleteSponsor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonSponsorService.deleteSponsor(id).then(() => ({ id, eventId })),
    onSuccess: ({ eventId }) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(eventId) });
      toast.success('Sponsor deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete sponsor');
    },
  });
}

/**
 * Move sponsor to a new pipeline stage.
 */
export function useMovePipelineStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, newStage }: { id: string; newStage: SponsorPipelineStage }) =>
      MarathonSponsorService.movePipelineStage(id, newStage),
    onSuccess: (sponsor) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(sponsor.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(sponsor.id) });
      toast.success(`Moved to "${sponsor.pipeline_stage}"`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to move stage');
    },
  });
}

/**
 * Add a deliverable to a sponsor.
 */
export function useAddDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sponsorId,
      dto,
    }: {
      sponsorId: string;
      dto: Partial<MarathonSponsorDeliverable>;
    }) => MarathonSponsorService.addDeliverable(sponsorId, dto),
    onSuccess: (deliverable) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(deliverable.sponsor_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Deliverable added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add deliverable');
    },
  });
}

/**
 * Update a deliverable (status, title, etc.).
 */
export function useUpdateDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      sponsorId,
      dto,
    }: {
      id: string;
      sponsorId: string;
      dto: Partial<MarathonSponsorDeliverable>;
    }) => MarathonSponsorService.updateDeliverable(id, dto).then((d) => ({ ...d, sponsorId })),
    onSuccess: (deliverable) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(deliverable.sponsor_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update deliverable');
    },
  });
}

/**
 * Delete a deliverable.
 */
export function useDeleteDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, sponsorId }: { id: string; sponsorId: string }) =>
      MarathonSponsorService.deleteDeliverable(id).then(() => ({ sponsorId })),
    onSuccess: ({ sponsorId }) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(sponsorId) });
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Deliverable removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete deliverable');
    },
  });
}

/**
 * Log a sponsor activity (call, email, meeting, payment, note).
 */
export function useLogSponsorActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sponsorId,
      dto,
    }: {
      sponsorId: string;
      dto: { activity_type: string; description: string; performed_by?: string };
    }) => MarathonSponsorService.logActivity(sponsorId, dto),
    onSuccess: (log) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(log.sponsor_id) });
      toast.success('Activity logged');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to log activity');
    },
  });
}
