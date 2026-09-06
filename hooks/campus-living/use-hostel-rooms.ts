'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelRoomService } from '@/lib/services/campus-living/hostel-room-service';
import { usePermissions } from '@/hooks/use-permissions';
import { hostelAttendanceKeys } from '@/hooks/campus-living/use-hostel-attendance';
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

export function useHostelRooms(institutionId: string | undefined, filters?: RoomFilters) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelRoomKeys.list({ institutionId, ...filters }),
    queryFn: () => HostelRoomService.getRooms(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useRoomsByBlock(blockId: string) {
  return useQuery({
    queryKey: hostelRoomKeys.byBlock(blockId),
    queryFn: () => HostelRoomService.getRoomsByBlock(blockId),
    enabled: !!blockId,
  });
}

// hostel-rooms-v2 PR 3 (2026-05-26): occupancy-enriched variants —
// useRoomsByBlockWithOccupancy + useHostelRoomWithOccupancy zip-merge each
// room with v_hostel_room_occupancy so status badges + occupancy displays
// come alive again without rewriting the legacy hooks (callers pick).
export function useRoomsByBlockWithOccupancy(blockId: string) {
  return useQuery({
    queryKey: [...hostelRoomKeys.byBlock(blockId), 'with-occupancy'] as const,
    queryFn: () => HostelRoomService.getRoomsByBlockWithOccupancy(blockId),
    enabled: !!blockId,
    staleTime: 30_000,
  });
}

export function useHostelRoom(id: string) {
  return useQuery({
    queryKey: hostelRoomKeys.detail(id),
    queryFn: () => HostelRoomService.getRoom(id),
    enabled: !!id,
  });
}

export function useHostelRoomWithOccupancy(id: string) {
  return useQuery({
    queryKey: [...hostelRoomKeys.detail(id), 'with-occupancy'] as const,
    queryFn: () => HostelRoomService.getRoomWithOccupancy(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// Selected room amenity tag IDs (present=true rows in hostel_room_amenity_tags).
// Powers the room form's amenity picker pre-fill in edit mode.
export function useRoomAmenityTagIds(roomId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...hostelRoomKeys.detail(roomId ?? ''), 'amenity-tags'] as const,
    queryFn: () => HostelRoomService.getRoomAmenityTagIds(roomId as string),
    enabled: enabled && !!roomId,
  });
}

// --- Mutation hooks ---

export function useCreateHostelRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: CreateHostelRoomDTO & { amenityTagIds?: string[] }) => {
      const { amenityTagIds, ...payload } = vars;
      return HostelRoomService.createRoom(payload, amenityTagIds);
    },
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
    mutationFn: ({
      id,
      payload,
      amenityTagIds,
    }: {
      id: string;
      payload: UpdateHostelRoomDTO;
      amenityTagIds?: string[];
    }) => HostelRoomService.updateRoom(id, payload, amenityTagIds),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelRoomKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelRoomKeys.detail(variables.id) });
      // Attendance's markable-residents list embeds each resident's room
      // number via a join — a room_number edit here (not a transfer) needs
      // the same cache refresh, or the Attendance page keeps showing the
      // pre-edit room number until its 5-minute cache expires.
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.all });
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
