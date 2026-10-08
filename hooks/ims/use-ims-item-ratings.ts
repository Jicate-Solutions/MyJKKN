'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImsItemRatingService } from '@/lib/services/ims/item-rating-service';
import { errorMessage } from '@/lib/utils/supabase-error';

const KEY = ['ims-item-ratings'] as const;

export function useImsRateableLines(indentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...KEY, 'lines', indentId],
    queryFn: () => ImsItemRatingService.getRateableLines(indentId!),
    enabled: !!indentId && enabled,
    staleTime: 60 * 1000,
  });
}

export function useImsItemRatingSummaries(itemIds: string[]) {
  const ids = [...new Set(itemIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [...KEY, 'summary', ids],
    queryFn: () => ImsItemRatingService.getSummaries(ids),
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useImsRecentItemRatings(itemId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'recent', itemId],
    queryFn: () => ImsItemRatingService.getRecent(itemId!),
    enabled: !!itemId && enabled,
  });
}

export function useRateImsIndentItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof ImsItemRatingService.rateIndentItem>[0]) =>
      ImsItemRatingService.rateIndentItem(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['procurement', 'vendor-scores'] });
      toast.success('Thanks — rating saved');
    },
    onError: (e) => toast.error(errorMessage(e, 'Could not save the rating')),
  });
}
