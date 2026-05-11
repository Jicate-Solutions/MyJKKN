// hooks/admission/use-auto-trigger.ts
// React Query hooks for WhatsApp auto-trigger rules

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type {
  AutoTriggerRule,
  CreateAutoTriggerInput,
  UpdateAutoTriggerInput,
} from '@/types/whatsapp-personal';

const QUERY_KEY = 'wa-auto-trigger-rules';

async function fetchRules(institutionId: string): Promise<AutoTriggerRule[]> {
  const res = await fetch(
    `/api/whatsapp-personal/auto-triggers?institution_id=${institutionId}`
  );
  if (!res.ok) throw new Error('Failed to fetch trigger rules');
  const data = await res.json();
  return data.rules || [];
}

export function useAutoTriggerRules(institutionId: string) {
  return useQuery({
    queryKey: [QUERY_KEY, institutionId],
    queryFn: () => fetchRules(institutionId),
    enabled: !!institutionId,
    staleTime: 30_000,
  });
}

export function useAutoTriggerMutations(institutionId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, institutionId] });

  const createRule = useMutation({
    mutationFn: async (input: CreateAutoTriggerInput) => {
      const res = await fetch('/api/whatsapp-personal/auto-triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create trigger rule');
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success('Trigger rule created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...input }: UpdateAutoTriggerInput & { id: string }) => {
      const res = await fetch(`/api/whatsapp-personal/auto-triggers?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update trigger rule');
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success('Trigger rule updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/whatsapp-personal/auto-triggers?id=${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete trigger rule');
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast.success('Trigger rule deactivated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const res = await fetch(`/api/whatsapp-personal/auto-triggers?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active }),
      });
      if (!res.ok) throw new Error('Failed to toggle trigger rule');
      return res.json();
    },
    onSuccess: (_, variables) => {
      invalidate();
      toast.success(variables.is_active ? 'Trigger enabled' : 'Trigger disabled');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return { createRule, updateRule, deleteRule, toggleRule };
}

export function usePersonalWAQueueStats(institutionId?: string) {
  return useQuery({
    queryKey: ['wa-personal-queue-stats', institutionId],
    queryFn: async () => {
      const params = institutionId ? `?institution_id=${institutionId}` : '';
      const res = await fetch(`/api/whatsapp-personal/queue${params}`);
      if (!res.ok) throw new Error('Failed to fetch queue stats');
      return res.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
