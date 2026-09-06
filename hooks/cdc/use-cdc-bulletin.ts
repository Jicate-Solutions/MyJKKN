// hooks/cdc/use-cdc-bulletin.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { BulletinService } from '@/lib/services/cdc/bulletin-service';
import type {
  CreateOpportunityDto,
  UpdateOpportunityDto,
  OpportunityFilters,
} from '@/types/cdc/bulletin';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useCdcOpportunities(filters?: OpportunityFilters) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-opportunities', filters],
    queryFn: () => BulletinService.getOpportunities(filters),
    enabled: !authLoading,
    staleTime: 60 * 1000,
  });
}

export function useCdcOpportunity(id: string | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['cdc-opportunity', id],
    queryFn: () => BulletinService.getOpportunity(id!),
    enabled: !authLoading && isValidUUID(id),
    staleTime: 60 * 1000,
  });
}

export function useCreateCdcOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateOpportunityDto) => BulletinService.createOpportunity(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-opportunities'] });
      toast.success('Opportunity posted to bulletin');
    },
    onError: (err: Error) => {
      console.error('[cdc/bulletin] create error:', err);
      toast.error('Failed to post opportunity');
    },
  });
}

export function useUpdateCdcOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOpportunityDto }) =>
      BulletinService.updateOpportunity(id, dto),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['cdc-opportunities'] });
      qc.invalidateQueries({ queryKey: ['cdc-opportunity', updated.id] });
      toast.success('Opportunity updated');
    },
    onError: (err: Error) => {
      console.error('[cdc/bulletin] update error:', err);
      toast.error('Failed to update opportunity');
    },
  });
}

export function useArchiveCdcOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => BulletinService.archiveOpportunity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cdc-opportunities'] });
      toast.success('Opportunity archived');
    },
    onError: (err: Error) => {
      console.error('[cdc/bulletin] archive error:', err);
      toast.error('Failed to archive opportunity');
    },
  });
}
