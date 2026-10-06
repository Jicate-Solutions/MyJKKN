'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ProcurementRatingService } from '@/lib/services/procurement/rating-service';
import { errorMessage } from '@/lib/utils/supabase-error';

const KEY = ['procurement', 'ratings'] as const;
const SCORES = ['procurement', 'vendor-scores'] as const;

export function useVendorScores(supplierIds: string[]) {
  const ids = [...new Set(supplierIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [...SCORES, ids],
    queryFn: () => ProcurementRatingService.getVendorScores(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useItemVendorRatings(itemIds: string[]) {
  const ids = [...new Set(itemIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [...KEY, 'items', ids],
    queryFn: () => ProcurementRatingService.getItemVendorRatings(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRateableLines(requestId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'rateable', requestId],
    queryFn: () => ProcurementRatingService.getRateableLines(requestId!),
    enabled: !!requestId,
    staleTime: 60 * 1000,
  });
}

export function useMyUnratedCounts(enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'my-unrated'],
    queryFn: () => ProcurementRatingService.getMyUnratedCounts(),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useMyDeliveryRating(grnId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'delivery', grnId, userId],
    queryFn: () => ProcurementRatingService.getMyDeliveryRating(grnId!, userId!),
    enabled: !!grnId && !!userId,
  });
}

export function useRecentVendorRatings(supplierId: string | undefined) {
  return useQuery({
    queryKey: [...KEY, 'vendor', supplierId],
    queryFn: () => ProcurementRatingService.getRecentVendorRatings(supplierId!),
    enabled: !!supplierId,
  });
}

function useInvalidateRatings() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEY });
    qc.invalidateQueries({ queryKey: SCORES });
  };
}

export function useRateDelivery() {
  const invalidate = useInvalidateRatings();
  return useMutation({
    mutationFn: (input: Parameters<typeof ProcurementRatingService.rateDelivery>[0]) =>
      ProcurementRatingService.rateDelivery(input),
    onSuccess: () => {
      invalidate();
      toast.success('Thanks — delivery rating saved');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the rating')),
  });
}

export function useRateItem() {
  const invalidate = useInvalidateRatings();
  return useMutation({
    mutationFn: (input: Parameters<typeof ProcurementRatingService.rateItem>[0]) =>
      ProcurementRatingService.rateItem(input),
    onSuccess: () => {
      invalidate();
      toast.success('Thanks — rating saved');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the rating')),
  });
}
