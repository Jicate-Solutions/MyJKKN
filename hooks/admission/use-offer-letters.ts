// hooks/admission/use-offer-letters.ts
// React Query hooks for offer letter management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  OfferLetterService,
  type OfferLetterFilters,
  type CreateOfferLetterInput,
} from '@/lib/services/admission/offer-letter-service';

export const offerLetterKeys = {
  all: ['offer-letters'] as const,
  lists: () => [...offerLetterKeys.all, 'list'] as const,
  list: (filters: OfferLetterFilters) => [...offerLetterKeys.lists(), filters] as const,
  detail: (id: string) => [...offerLetterKeys.all, 'detail', id] as const,
  stats: (institutionId: string) => [...offerLetterKeys.all, 'stats', institutionId] as const,
};

export function useOfferLetters(filters: OfferLetterFilters) {
  const query = useQuery({
    queryKey: offerLetterKeys.list(filters),
    queryFn: () => OfferLetterService.getOfferLetters(filters),
    enabled: !!filters.institutionId,
  });

  return {
    offers: query.data?.data || [],
    metadata: query.data?.metadata,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useOfferLetterStats(institutionId: string) {
  const query = useQuery({
    queryKey: offerLetterKeys.stats(institutionId),
    queryFn: () => OfferLetterService.getStats(institutionId),
    enabled: !!institutionId,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCreateOfferLetter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateOfferLetterInput) => OfferLetterService.createOfferLetter(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerLetterKeys.all });
      toast.success('Offer letter created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create offer letter: ${error.message}`);
    },
  });
}

export function useUpdateOfferResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, response, notes }: { id: string; response: string; notes?: string }) =>
      OfferLetterService.updateOfferResponse(id, response, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerLetterKeys.all });
      toast.success('Offer response updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update response: ${error.message}`);
    },
  });
}

export function useExtendOfferDeadline() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, newDeadline }: { id: string; newDeadline: string }) =>
      OfferLetterService.extendDeadline(id, newDeadline),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerLetterKeys.all });
      toast.success('Deadline extended successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to extend deadline: ${error.message}`);
    },
  });
}

export function useRecordOfferReminder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => OfferLetterService.recordReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offerLetterKeys.all });
      toast.success('Reminder sent successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to send reminder: ${error.message}`);
    },
  });
}
