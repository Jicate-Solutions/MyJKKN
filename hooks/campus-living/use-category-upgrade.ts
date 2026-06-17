'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CategoryUpgradeService } from '@/lib/services/campus-living/category-upgrade-service';
import { hostelWaitlistKeys } from '@/hooks/campus-living/use-hostel-waitlist';

const upgradeKeys = {
  all: ['campus-living', 'upgrade'] as const,
  roomCategories: ['campus-living', 'upgrade', 'room-categories'] as const,
  messCategories: ['campus-living', 'upgrade', 'mess-categories'] as const,
  rooms: (categoryId: string) => ['campus-living', 'upgrade', 'rooms', categoryId] as const,
  myWaitlist: ['campus-living', 'upgrade', 'my-waitlist'] as const,
};

export function useUpgradeRoomCategories() {
  return useQuery({
    queryKey: upgradeKeys.roomCategories,
    queryFn: () => CategoryUpgradeService.getRoomCategories(),
  });
}

export function useUpgradeMessCategories() {
  return useQuery({
    queryKey: upgradeKeys.messCategories,
    queryFn: () => CategoryUpgradeService.getMessCategories(),
  });
}

// Available rooms (with capacity) of the target category — room-level picker.
export function useUpgradeRooms(categoryId: string | null) {
  return useQuery({
    queryKey: upgradeKeys.rooms(categoryId ?? ''),
    queryFn: () => CategoryUpgradeService.getRoomOptions(categoryId!),
    enabled: !!categoryId,
  });
}

// Resident's own pending upgrade waitlist entries (waiting/offered).
export function useMyUpgradeWaitlist() {
  return useQuery({
    queryKey: upgradeKeys.myWaitlist,
    queryFn: () => CategoryUpgradeService.getMyWaitlist(),
  });
}

// Shared post-upgrade cache refresh.
function useUpgradeInvalidator() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['my-hostel'] });
    qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
    qc.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
    qc.invalidateQueries({ queryKey: upgradeKeys.all });
  };
}

export function useUpgradeRoom() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: ({ categoryId, roomId }: { categoryId: string; roomId: string }) =>
      CategoryUpgradeService.upgradeRoom(categoryId, roomId),
    onSuccess: (res) => {
      invalidate();
      if (res.state === 'booked') {
        toast.success('Room booked — it is now assigned to you');
      } else if (res.state === 'pending_payment') {
        toast.success(
          `Room reserved — pay the upgrade fee of ₹${(res.upgrade_fee ?? 0).toLocaleString('en-IN')} to confirm`
        );
      } else if (res.state === 'waitlisted') {
        toast.success('Room reserved — it confirms automatically once your fee payment reaches the required level');
      } else {
        toast.success('Upgraded — the room is now assigned to you');
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Upgrade failed'),
  });
}

// AUTO category upgrade: bill generated now, category changes on payment, no room reserved.
export function useUpgradeCategoryOnly() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: (categoryId: string) => CategoryUpgradeService.upgradeCategoryOnly(categoryId),
    onSuccess: (res) => {
      invalidate();
      if (res.state === 'upgraded') {
        toast.success('Category upgraded — no fee was due');
      } else {
        toast.success(
          `Upgrade bill of ₹${(res.upgrade_fee ?? 0).toLocaleString('en-IN')} generated — your category changes once it is fully paid`
        );
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Upgrade failed'),
  });
}

export function useUpgradeMess() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: (messCategoryId: string) => CategoryUpgradeService.upgradeMess(messCategoryId),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Mess upgraded · new bill ₹${res.bill.billed.toLocaleString('en-IN')} generated`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Upgrade failed'),
  });
}

export function useJoinUpgradeWaitlist() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: (categoryId: string) => CategoryUpgradeService.joinWaitlist(categoryId),
    onSuccess: () => {
      invalidate();
      toast.success('Added to the waitlist — your current stay & bill are unchanged');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to join waitlist'),
  });
}

export function useLeaveUpgradeWaitlist() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: (targetCategoryId: string) => CategoryUpgradeService.leaveWaitlist(targetCategoryId),
    onSuccess: () => {
      invalidate();
      toast.success('Removed from the waitlist');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to leave waitlist'),
  });
}
