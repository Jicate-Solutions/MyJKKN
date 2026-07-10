'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProcurementQuotationService } from '@/lib/services/procurement/quotation-service';
import type { CreateQuotationDto } from '@/types/procurement';

export function useQuotationsForRfq(rfqId: string) {
  return useQuery({
    queryKey: ['procurement-quotations', rfqId],
    queryFn: () => ProcurementQuotationService.getQuotationsForRfq(rfqId),
    enabled: !!rfqId,
    staleTime: 60 * 1000,
  });
}

export function useComparison(rfqId: string) {
  return useQuery({
    queryKey: ['procurement-comparison', rfqId],
    queryFn: () => ProcurementQuotationService.getComparison(rfqId),
    enabled: !!rfqId,
    staleTime: 30 * 1000,
  });
}

export function useCreateQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, userId }: { dto: CreateQuotationDto; userId: string }) =>
      ProcurementQuotationService.createQuotation(dto, userId),
    onSuccess: (_r, { dto }) => {
      queryClient.invalidateQueries({ queryKey: ['procurement-quotations', dto.rfq_id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-comparison', dto.rfq_id] });
      queryClient.invalidateQueries({ queryKey: ['procurement-rfq', dto.rfq_id] });
    },
  });
}

export function useCreateVendor() {
  return useMutation({
    mutationFn: (input: { institution_id: string; name: string; code?: string | null; email?: string | null }) =>
      ProcurementQuotationService.createVendor(input),
  });
}

export function useDeleteQuotation(rfqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ProcurementQuotationService.deleteQuotation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-quotations', rfqId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-comparison', rfqId] });
    },
  });
}

export function useAwardLine(rfqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rfqItemId, quotationItemId }: { rfqItemId: string; quotationItemId: string }) =>
      ProcurementQuotationService.awardLine(rfqItemId, quotationItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-comparison', rfqId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-quotations', rfqId] });
    },
  });
}

export function useUnawardLine(rfqId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rfqItemId: string) => ProcurementQuotationService.unawardLine(rfqItemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-comparison', rfqId] });
      queryClient.invalidateQueries({ queryKey: ['procurement-quotations', rfqId] });
    },
  });
}
