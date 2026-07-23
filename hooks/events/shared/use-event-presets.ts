// hooks/events/shared/use-event-presets.ts
// React Query hooks for event presets (Events Platform Promotion PR9).
// Wraps EventPresetService; RLS in the DB enforces official-or-own scope.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventPresetService } from '@/lib/services/events/shared/event-preset-service';
import { useAuth } from '@/hooks/use-auth';
import type { EventPreset, CreatePresetDto, PresetConfig } from '@/types/events-presets';

const KEYS = {
  all: ['event-presets'] as const,
  list: (eventType: string) => [...KEYS.all, 'list', eventType] as const,
};

/** Official + own personal presets for an event type. */
export function useEventPresets(eventType: string) {
  return useQuery({
    queryKey: KEYS.list(eventType),
    queryFn: () => EventPresetService.listPresets(eventType),
    enabled: !!eventType,
  });
}

function useInvalidate(eventType: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEYS.list(eventType) });
}

/** Create a personal preset owned by the current user. */
export function useCreatePersonalPreset(eventType: string) {
  const invalidate = useInvalidate(eventType);
  // profiles.id === auth.users.id (1:1), so profile.id is the preset owner_id.
  const { profile } = useAuth();
  return useMutation({
    mutationFn: (dto: CreatePresetDto) => {
      if (!profile?.id) throw new Error('You must be signed in to save a preset.');
      return EventPresetService.createPersonal(dto, profile.id);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Preset saved');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to save preset'),
  });
}

/** Publish an official preset (admins / events.presets.manage holders). */
export function usePublishOfficialPreset(eventType: string) {
  const invalidate = useInvalidate(eventType);
  return useMutation({
    mutationFn: (dto: CreatePresetDto) => EventPresetService.publishOfficial(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Official preset published');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to publish preset'),
  });
}

/** Copy an official preset into a personal copy the user can tweak. */
export function useCopyPresetToPersonal(eventType: string) {
  const invalidate = useInvalidate(eventType);
  const { profile } = useAuth();
  return useMutation({
    mutationFn: ({ source, name }: { source: EventPreset; name?: string }) => {
      if (!profile?.id) throw new Error('You must be signed in to copy a preset.');
      return EventPresetService.copyToPersonal(source, profile.id, name);
    },
    onSuccess: () => {
      invalidate();
      toast.success('Copied to your presets');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to copy preset'),
  });
}

/** Update a preset's name/config. */
export function useUpdatePreset(eventType: string) {
  const invalidate = useInvalidate(eventType);
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; config?: PresetConfig } }) =>
      EventPresetService.update(id, patch),
    onSuccess: () => {
      invalidate();
      toast.success('Preset updated');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update preset'),
  });
}

/** Delete a preset. */
export function useDeletePreset(eventType: string) {
  const invalidate = useInvalidate(eventType);
  return useMutation({
    mutationFn: (id: string) => EventPresetService.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success('Preset deleted');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to delete preset'),
  });
}
