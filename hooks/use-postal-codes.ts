'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PostalCodeService } from '@/lib/services/postal-code-service';
import { queryKeys } from '@/lib/query/query-keys';
import type {
  CreatePostalCodeInput,
  UpdatePostalCodeInput,
} from '@/types/postal-code';

const STATIC_STALE = 30 * 60 * 1000; // postal data is static — cache generously

/** Offices + distinct districts for a 6-digit pincode (disabled otherwise). */
export function usePincodeLookup(pincode: string, enabled = true) {
  const valid = /^[0-9]{6}$/.test(pincode?.trim() ?? '');
  return useQuery({
    queryKey: queryKeys.postalCodes.lookup(pincode?.trim() ?? ''),
    queryFn: () => PostalCodeService.lookupPincode(pincode),
    enabled: enabled && valid,
    staleTime: STATIC_STALE,
  });
}

export function usePostOffice(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.postalCodes.detail(id ?? ''),
    queryFn: () => PostalCodeService.getById(id as string),
    enabled: !!id,
    staleTime: STATIC_STALE,
  });
}

function useInvalidatePostalCodes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.postalCodes.all });
}

export function useCreatePostalCode() {
  const invalidate = useInvalidatePostalCodes();
  return useMutation({
    mutationFn: (input: CreatePostalCodeInput) => PostalCodeService.create(input),
    onSuccess: invalidate,
  });
}

export function useUpdatePostalCode() {
  const invalidate = useInvalidatePostalCodes();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePostalCodeInput }) =>
      PostalCodeService.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeletePostalCode() {
  const invalidate = useInvalidatePostalCodes();
  return useMutation({
    mutationFn: (id: string) => PostalCodeService.delete(id),
    onSuccess: invalidate,
  });
}
