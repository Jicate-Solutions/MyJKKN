'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { RoomChangeService } from '@/lib/services/campus-living/room-change-service';

const roomChangeKeys = {
  all: ['campus-living', 'room-change'] as const,
  status: ['campus-living', 'room-change', 'status'] as const,
  options: ['campus-living', 'room-change', 'options'] as const,
};

/** `enabled` lets a caller that only needs the status conditionally (e.g. the
 *  sole-occupant card on the default Overview tab) skip the RPC entirely. The
 *  query key is shared, so a second consumer with it enabled still populates
 *  the same cache. */
export function useRoomChangeStatus(enabled = true) {
  return useQuery({
    queryKey: roomChangeKeys.status,
    queryFn: () => RoomChangeService.getStatus(),
    enabled,
  });
}

/** Only fetch the room list once the card knows the resident is eligible. */
export function useRoomChangeOptions(enabled: boolean) {
  return useQuery({
    queryKey: roomChangeKeys.options,
    queryFn: () => RoomChangeService.getOptions(),
    enabled,
  });
}

export function useChangeRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, bedId }: { roomId: string; bedId?: string | null }) =>
      RoomChangeService.changeRoom(roomId, bedId),
    onSuccess: (res) => {
      // The move rewrites the allocation, so the overview/room cards must refetch.
      qc.invalidateQueries({ queryKey: ['my-hostel'] });
      qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
      qc.invalidateQueries({ queryKey: roomChangeKeys.all });
      qc.invalidateQueries({ queryKey: ['campus-living', 'upgrade'] });
      toast.success(
        `Room changed — you're now in Room ${res.new_room_number ?? ''}`.trim()
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Room change failed'),
  });
}
