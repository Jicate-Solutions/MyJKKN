'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { usePermissions } from '@/hooks/use-permissions';
import { hostelBedKeys } from '@/hooks/campus-living/use-hostel-beds';
import { hostelAttendanceKeys } from '@/hooks/campus-living/use-hostel-attendance';
import { getErrorMessage } from '@/lib/utils';
import type {
  HostelAllocation,
  CreateHostelAllocationDTO,
  UpdateHostelAllocationDTO,
  AllocationFilters,
  VacateReason,
} from '@/types/campus-living';

// Query key factory
export const hostelAllocationKeys = {
  all: ['hostel-allocations'] as const,
  list: (filters: Record<string, unknown>) => ['hostel-allocations', 'list', filters] as const,
  active: (institutionId: string | undefined) => ['hostel-allocations', 'active', institutionId] as const,
  // rooms-v2 PR 4b: separate key for the joined admin feed so it can be
  // invalidated independently of legacy callers.
  adminActive: () => ['hostel-allocations', 'admin', 'active'] as const,
  detail: (id: string) => ['hostel-allocations', 'detail', id] as const,
};

// --- Query hooks ---
//
// Scope-race guard (2026-07-26): isSuperAdmin is FALSE while usePermissions()
// is still loading. These hooks previously (a) fetched during that window —
// scoping a super-admin to their home institution (for director that is the
// Testing Institution → 0 rows, so the Allocations page showed "0 Allocated")
// — and (b) resolved the effective scope inside queryFn while the queryKey
// carried the RAW institutionId, so when the flag flipped the key did not
// change and React Query kept serving the mis-scoped cached result until the
// next staleness refetch (numbers flapping 0 ↔ real count on refocus).
// Fix: resolve the effective scope BEFORE useQuery, key the cache on it, and
// hold the fetch until permissions have loaded.

export function useHostelAllocations(institutionId: string | undefined, filters?: AllocationFilters) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const effectiveInstitutionId = isSuperAdmin ? undefined : institutionId;
  return useQuery({
    queryKey: hostelAllocationKeys.list({ institutionId: effectiveInstitutionId, ...filters }),
    queryFn: () => HostelAllocationService.getAllocations(effectiveInstitutionId, filters),
    enabled: !permissionsLoading && (isSuperAdmin || !!institutionId),
  });
}

// Full allocation set (no page cap) for the admin allocations page — drives the
// summary counts + the advanced client-side table/filters. ~100s of rows today.
export function useAllAllocations(institutionId: string | undefined, filters?: AllocationFilters) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const effectiveInstitutionId = isSuperAdmin ? undefined : institutionId;
  return useQuery({
    queryKey: ['hostel-allocations', 'all', { institutionId: effectiveInstitutionId, ...filters }] as const,
    queryFn: () => HostelAllocationService.getAllAllocations(effectiveInstitutionId, filters),
    enabled: !permissionsLoading && (isSuperAdmin || !!institutionId),
    staleTime: 30_000,
  });
}

export function useActiveAllocations(institutionId: string | undefined) {
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const effectiveInstitutionId = isSuperAdmin ? undefined : institutionId;
  return useQuery({
    queryKey: hostelAllocationKeys.active(effectiveInstitutionId),
    queryFn: () => HostelAllocationService.getActiveAllocations(effectiveInstitutionId),
    enabled: !permissionsLoading && (isSuperAdmin || !!institutionId),
  });
}

// rooms-v2 PR 4b — admin listing feed.
// Returns active allocations with joined learner / block / room / bed
// labels so the table doesn't need to fan out queries per row. 30s
// staleTime matches the rooms-occupancy feed used elsewhere on the page.
export function useActiveAllocationsForAdmin() {
  return useQuery({
    queryKey: hostelAllocationKeys.adminActive(),
    queryFn: () => HostelAllocationService.getActiveAllocationsForAdmin(),
    staleTime: 30_000,
  });
}

export function useHostelAllocation(id: string) {
  return useQuery({
    queryKey: hostelAllocationKeys.detail(id),
    queryFn: () => HostelAllocationService.getAllocation(id),
    enabled: !!id,
  });
}

// Category-wise room/bed availability for the transfer modal. Keyed on the
// chosen block; short staleTime so it reflects beds freed/taken by other moves.
export function useTransferRoomOptions(blockId: string | undefined) {
  return useQuery({
    queryKey: ['hostel-allocations', 'transfer-room-options', blockId] as const,
    queryFn: () => HostelAllocationService.getTransferRoomOptions(blockId as string),
    enabled: !!blockId,
    staleTime: 15_000,
  });
}

// --- Mutation hooks ---

export function useCreateHostelAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelAllocationDTO) =>
      HostelAllocationService.allocate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      toast.success('Allocation created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create allocation: ${error.message}`);
    },
  });
}

export function useUpdateHostelAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateHostelAllocationDTO }) =>
      HostelAllocationService.updateAllocation(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.detail(variables.id) });
      toast.success('Allocation updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update allocation: ${error.message}`);
    },
  });
}

export function useTransferAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { new_room_id: string; new_bed_id: string; new_block_id?: string } }) =>
      HostelAllocationService.transfer(id, payload.new_room_id, payload.new_bed_id, payload.new_block_id),
    onSuccess: () => {
      // The move touches allocations + bed status (old freed, new occupied),
      // so refresh every surface that reads them: the allocations tables, the
      // rooms/beds occupancy feeds, and the resident's own My Hostel view.
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['hostel-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['hostel-beds'] });
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
      // Attendance's markable-residents list also embeds each resident's
      // room/bed — without this it kept showing the pre-transfer room until
      // its 5-minute cache expired or a hard refresh forced a refetch.
      queryClient.invalidateQueries({ queryKey: hostelAttendanceKeys.all });
      toast.success('Allocation transferred');
    },
    onError: (error: Error) => {
      toast.error(`Failed to transfer allocation: ${error.message}`);
    },
  });
}

export function useVacateAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { vacate_reason: VacateReason } }) =>
      HostelAllocationService.vacate(id, payload.vacate_reason),
    onSuccess: () => {
      // Vacating now frees the bed too (fn_cl_vacate_allocation), so the rooms
      // and beds feeds are stale as well — nothing in this app refetches on
      // focus, so an un-invalidated occupancy view would keep showing the bed
      // as taken until a hard reload. Mirrors useResetAllocation's fan-out.
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['hostel-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['hostel-beds'] });
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
      toast.success('Allocation vacated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to vacate allocation: ${error.message}`);
    },
  });
}

// Admin "Reset" — undo the room allocation (hard delete + bed freed) and/or
// clear the learner's room/mess category, via fn_cl_admin_reset_allocation.
export function useResetAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { resetRoom: boolean; resetRoomCategory: boolean; resetMessCategory: boolean };
    }) => HostelAllocationService.resetAllocation(id, payload),
    onSuccess: () => {
      // The reset can delete the allocation + free its bed and clear the
      // learner-level categories, so refresh every surface that reads them:
      // allocations tables (incl. the category columns), rooms/beds occupancy
      // feeds, and the resident's own My Hostel view.
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['hostel-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['hostel-beds'] });
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
      toast.success('Reset applied');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reset: ${error.message}`);
    },
  });
}

// Bulk room-reset for the combined "All" allocations table.
//
// Sequential, and it COLLECTS per-row failures rather than aborting:
// fn_cl_admin_reset_allocation refuses individual rows that hold a deposit or
// a vacate request, or whose status isn't active/pending_approval, and one
// refusal must not strand the rest of the selection. Invalidates ONCE at the
// end so a 90-row run doesn't refetch the table 90 times mid-loop.
//
// Room-only by design: it deletes the allocation and frees the bed, leaving the
// learner's room/mess category columns alone. Those are re-derived from the
// eligibility rules on the next allocation, and the per-row Reset dialog is
// still there for anyone who genuinely wants to clear them.
export function useResetAllocationsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      items: { id: string; label: string }[]
    ): Promise<{ id: string; label: string; message: string }[]> => {
      const failed: { id: string; label: string; message: string }[] = [];
      for (const item of items) {
        try {
          await HostelAllocationService.resetAllocation(item.id, {
            resetRoom: true,
            resetRoomCategory: false,
            resetMessCategory: false,
          });
        } catch (e) {
          failed.push({ ...item, message: getErrorMessage(e) });
        }
      }
      return failed;
    },
    onSettled: () => {
      // onSettled, not onSuccess: partial runs still moved real rows.
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['hostel-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['hostel-beds'] });
      queryClient.invalidateQueries({ queryKey: ['my-hostel'] });
    },
  });
}

// rooms-v2 PR 4b — explicit check-out mutation.
// Distinct from useVacateAllocation (which only flips status + vacate_reason)
// because the new schema also needs check_out_date populated for the
// partial UNIQUE index to release the bed.
export function useCheckOutResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, check_out_date, notes }: { id: string; check_out_date: string; notes?: string }) =>
      HostelAllocationService.checkOut(id, check_out_date, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      // Beds / rooms occupancy view changes too — nudge the rooms feed.
      queryClient.invalidateQueries({ queryKey: ['hostel-rooms'] });
      toast.success('Resident checked out');
    },
    onError: (error: Error) => {
      toast.error(`Failed to check out resident: ${error.message}`);
    },
  });
}

// rooms-v2 PR 4b — convenience alias matching the PR 4b spec wording.
// Same payload shape as useCreateHostelAllocation; thin wrapper so the
// /admin/hostel/allocations page reads naturally.
export function useAllocateResident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateHostelAllocationDTO) =>
      HostelAllocationService.allocate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['hostel-rooms'] });
      toast.success('Resident allocated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to allocate resident: ${error.message}`);
    },
  });
}

export function useDeleteHostelAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => HostelAllocationService.deleteAllocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      toast.success('Allocation deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete allocation: ${error.message}`);
    },
  });
}

// ── Room bed occupancy query (fn_cl_room_bed_occupancy) ───────────────────────
// Returns one row per bed: is_occupied + occupant details. Used by the
// manual-allocation dialog to display which beds are free vs taken.
export function useRoomBedOccupancy(roomId: string) {
  return useQuery({
    queryKey: ['campus-living', 'room-bed-occupancy', roomId],
    queryFn: () => HostelAllocationService.getRoomBedOccupancy(roomId),
    enabled: !!roomId,
  });
}

// ── Allocatable rooms query (fn_cl_admin_allocatable_rooms) ───────────────────
// ALL student rooms in a block with per-condition verdict flags (computed
// server-side). Drives the allocate dialog's room dropdown + "why not" panel.
export function useAllocatableRooms(learnerProfileId: string | null, blockId: string) {
  return useQuery({
    queryKey: ['campus-living', 'allocatable-rooms', learnerProfileId, blockId],
    queryFn: () => HostelAllocationService.getAllocatableRooms(learnerProfileId!, blockId),
    enabled: !!learnerProfileId && !!blockId,
  });
}

// ── Allocatable blocks query (fn_cl_admin_allocatable_blocks) ─────────────────
// Every block annotated with this learner's allocatable room/bed counts —
// ranks the dialog's block picker and lets it auto-select a block that works.
export function useAllocatableBlocks(learnerProfileId: string | null) {
  return useQuery({
    queryKey: ['campus-living', 'allocatable-blocks', learnerProfileId],
    queryFn: () => HostelAllocationService.getAllocatableBlocks(learnerProfileId!),
    enabled: !!learnerProfileId,
  });
}

// ── Admin allocate bed mutation (fn_cl_admin_allocate_bed) ────────────────────
// Allocates a specific bed to a learner via a SECURITY DEFINER RPC.
// On success invalidates allocations, beds, and the occupancy panel so all
// surfaces reflect the new state immediately.
export function useAllocateBedAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { learnerProfileId: string; roomId: string; bedId: string; messCategoryId?: string | null }) =>
      HostelAllocationService.adminAllocateBed(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelAllocationKeys.all });
      queryClient.invalidateQueries({ queryKey: hostelBedKeys.all });
      queryClient.invalidateQueries({ queryKey: ['campus-living', 'room-bed-occupancy'] });
      toast.success('Room allocated');
    },
    onError: (error: unknown) => {
      toast.error(`Failed to allocate room: ${getErrorMessage(error)}`);
    },
  });
}
