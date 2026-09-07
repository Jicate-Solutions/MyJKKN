'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingTypeService } from '@/lib/services/campus-living/housekeeping-type-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  CreateCleaningTypeDto,
  UpdateCleaningTypeDto,
} from '@/types/campus-living/housekeeping';

export const housekeepingTypeKeys = {
  all: ['housekeeping-types'] as const,
  // The catalogue is global, so the list has no institution dimension.
  list: () => ['housekeeping-types', 'list'] as const,
  detail: (typeId: string) => ['housekeeping-types', 'detail', typeId] as const,
  bookable: (roomId?: string) =>
    ['housekeeping-types', 'bookable', roomId ?? 'none'] as const,
};

export function useHousekeepingTypes() {
  return useQuery({
    queryKey: housekeepingTypeKeys.list(),
    queryFn: () => HousekeepingTypeService.listTypes(),
  });
}

export function useBookableTypes(roomId?: string) {
  return useQuery({
    queryKey: housekeepingTypeKeys.bookable(roomId),
    queryFn: () => HousekeepingTypeService.listBookableTypesForRoom(roomId as string),
    enabled: Boolean(roomId),
  });
}

export function useCreateCleaningType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCleaningTypeDto) => HousekeepingTypeService.createType(dto),
    onSuccess: (_data, dto) => {
      qc.invalidateQueries({ queryKey: housekeepingTypeKeys.all });
      toast.success(
        dto.category_ids.length === 0
          ? 'Cleaning type saved — but no room categories are selected, so nobody can book it yet.'
          : 'Cleaning type created',
      );
    },
    onError: (error) => toast.error(`Could not create cleaning type: ${getErrorMessage(error)}`),
  });
}

export function useUpdateCleaningType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, dto }: { typeId: string; dto: UpdateCleaningTypeDto }) =>
      HousekeepingTypeService.updateType(typeId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingTypeKeys.all });
      toast.success('Cleaning type updated');
    },
    onError: (error) => toast.error(`Could not update cleaning type: ${getErrorMessage(error)}`),
  });
}

export function useDeleteCleaningType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (typeId: string) => HousekeepingTypeService.deleteType(typeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingTypeKeys.all });
      toast.success('Cleaning type deleted');
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      // 23503: ON DELETE RESTRICT fired because bookings reference this type.
      toast.error(
        msg.includes('23503') || msg.toLowerCase().includes('foreign key')
          ? 'This type has bookings in its history, so it cannot be deleted. Deactivate it instead.'
          : `Could not delete cleaning type: ${msg}`,
      );
    },
  });
}
