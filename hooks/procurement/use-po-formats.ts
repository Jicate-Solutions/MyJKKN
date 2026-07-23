'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementPoFormatService } from '@/lib/services/procurement/po-format-service';
import type { CreatePoFormatDto, UpdatePoFormatDto } from '@/types/procurement';

export function usePoFormats(institutionId: string | undefined, opts: { activeOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ['procurement-po-formats', institutionId, opts.activeOnly ?? false],
    queryFn: () => ProcurementPoFormatService.getFormats(institutionId as string, opts),
    enabled: !!institutionId,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePoFormat(id: string | undefined) {
  return useQuery({
    queryKey: ['procurement-po-format', id],
    queryFn: () => ProcurementPoFormatService.getFormat(id as string),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreatePoFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePoFormatDto) => ProcurementPoFormatService.createFormat(data),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-po-formats', created.institution_id] });
    },
  });
}

export function useUpdatePoFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePoFormatDto }) =>
      ProcurementPoFormatService.updateFormat(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-po-formats', updated.institution_id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-po-format', updated.id] });
    },
  });
}

export function useDeletePoFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementPoFormatService.deleteFormat(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-po-formats'] });
    },
  });
}

export function useSetDefaultPoFormat() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ institutionId, formatId }: { institutionId: string; formatId: string }) =>
      ProcurementPoFormatService.setDefault(institutionId, formatId),
    onSuccess: (_r, { institutionId }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-po-formats', institutionId] });
    },
  });
}
