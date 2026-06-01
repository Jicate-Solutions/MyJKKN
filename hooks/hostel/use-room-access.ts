'use client';
// hooks/hostel/use-room-access.ts
//
// React Query hooks for room ↔ institution access grants
// (room_institution_access). Backed by lib/services/hostel/room-access-service.ts
// — direct supabase-client path, matching the local sibling pattern in
// use-curfew-policies.ts. The /api/api-management/hostel/room-access route is
// for external API-key consumers; in-app admin UI talks to the service
// directly so RLS (super_admin / admin) handles scope without an extra hop.
//
// hostel-rooms-v2 PR 4a (2026-05-26) — powers the /admin/hostel/rooms
// "Manage Access" dialog.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  RoomAccessService,
  type GrantAccessInput,
  type RoomInstitutionAccessRow,
} from '@/lib/services/hostel/room-access-service';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const roomAccessKeys = {
  all: ['room-institution-access'] as const,
  byRoom: (roomId: string) => [...roomAccessKeys.all, 'by-room', roomId] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List access grants for a single room. Returns BOTH active and soft-revoked
 * rows; UI is responsible for filtering by `is_active` (e.g., showing only
 * active grants as chips). 30s staleTime to keep the dialog snappy on repeat
 * opens without going stale.
 */
export function useRoomAccessByRoom(roomId: string) {
  return useQuery<RoomInstitutionAccessRow[]>({
    queryKey: roomAccessKeys.byRoom(roomId),
    queryFn: async () => {
      const { data, error } = await RoomAccessService.list({ room_id: roomId });
      if (error) throw error;
      return data;
    },
    enabled: !!roomId,
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Grant a college access to a room. Service-layer is idempotent: re-granting
 * an existing (room_id, institution_id) pair re-activates a soft-revoked
 * row or returns the existing active row.
 */
export function useGrantRoomAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: GrantAccessInput) => {
      const { data, error } = await RoomAccessService.grant(input);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomAccessKeys.byRoom(variables.room_id) });
      toast.success('Access granted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to grant access: ${error.message}`);
    },
  });
}

/**
 * Soft-revoke an access grant (sets is_active=false). Preserves the row
 * for audit. Caller passes the access row id + the room_id (for cache
 * invalidation).
 */
export function useRevokeRoomAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ accessId }: { accessId: string; roomId: string }) => {
      const { data, error } = await RoomAccessService.revoke(accessId);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: roomAccessKeys.byRoom(variables.roomId) });
      toast.success('Access revoked');
    },
    onError: (error: Error) => {
      toast.error(`Failed to revoke access: ${error.message}`);
    },
  });
}
