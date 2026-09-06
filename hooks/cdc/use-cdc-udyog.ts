// hooks/cdc/use-cdc-udyog.ts — UNNATI → UDYOG apply-tracker (BUG-004075).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { UdyogListResponse, UdyogActionPayload } from '@/types/cdc/udyog';

const KEY = ['cdc-udyog-requirements'];

export function useUdyogRequirements() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<UdyogListResponse> => {
      const res = await fetch('/api/cdc/udyog');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return res.json() as Promise<UdyogListResponse>;
    },
  });
}

export function useUpdateUdyogRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: UdyogActionPayload) => {
      const res = await fetch(`/api/cdc/udyog/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });
}

export function useSetUdyogPortalUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const res = await fetch('/api/cdc/udyog/portal-url', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Request failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('UDYOG portal URL saved');
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err: Error) => toast.error(err.message || 'Could not save URL'),
  });
}
