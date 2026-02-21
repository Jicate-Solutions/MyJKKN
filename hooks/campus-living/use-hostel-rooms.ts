'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelRoomService } from '@/lib/services/campus-living/hostel-room-service';
import type {
  HostelRoom,
  CreateHostelRoomDTO,
  UpdateHostelRoomDTO,
  RoomFilters,
} from '@/types/campus-living';

// Query key factory
export const hostelRoomKeys = {
  all: ['hostel-rooms'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-rooms', 'list', filters] as const,
  byBlock: (blockId: string) => ['hostel-rooms', 'by-block', blockId] as const,
  detail: (id: string) => ['hostel-rooms', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelRooms(institutionId: string, filters?: RoomFilters) {
  return useQuery({
    queryKey: hostelRoomKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelRoomService.getRooms(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useRoomsByBlock(blockId: string) {
  return useQuery({
    queryKey: hostelRoomKeys.byBlock(blockId),
    queryFn: () => HostelRoomService.getRoomsByBlock(blockId),
    enabled: !!blockId,
  });
}

export function useHostelRoom(id: string) {
  return useQuery({
    queryKey: hostelRoomKeys.detail(id),
    queryFn: () => HostelRoomService.getRoom(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelRoomDTO) => HostelRoomService.createRoom(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelRoomKeys.all });
      toast.success('Room created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create room: ${error.message}`);
    },
  });
}

export function useUpdateHostelRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelRoomDTO }) =>
      HostelRoomService.updateRoom(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelRoomKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelRoomKeys.detail(variables.id) });
      toast.success('Room updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update room: ${error.message}`);
    },
  });
}

export function useDeleteHostelRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelRoomService.deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelRoomKeys.all });
      toast.success('Room deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete room: ${error.message}`);
    },
  });
}
