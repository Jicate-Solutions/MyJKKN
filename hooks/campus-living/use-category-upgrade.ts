'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { CategoryUpgradeService } from '@/lib/services/campus-living/category-upgrade-service';
import { SelfAllocationService } from '@/lib/services/campus-living/self-allocation-service';
import { hostelWaitlistKeys } from '@/hooks/campus-living/use-hostel-waitlist';

const upgradeKeys = {
  roomCategories: ['campus-living', 'upgrade', 'room-categories'] as const,
  messCategories: ['campus-living', 'upgrade', 'mess-categories'] as const,
  beds: (categoryId: string) => ['campus-living', 'upgrade', 'beds', categoryId] as const,
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

export function useUpgradeRoomBeds(categoryId: string | null) {
  return useQuery({
    queryKey: upgradeKeys.beds(categoryId ?? ''),
    queryFn: () => SelfAllocationService.getMyRoomOptions(categoryId!),
    enabled: !!categoryId,
  });
}

// Shared post-upgrade cache refresh.
function useUpgradeInvalidator() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['my-hostel'] });
    qc.invalidateQueries({ queryKey: ['hostel-allocations'] });
    qc.invalidateQueries({ queryKey: hostelWaitlistKeys.all });
    qc.invalidateQueries({ queryKey: upgradeKeys.roomCategories });
    qc.invalidateQueries({ queryKey: upgradeKeys.messCategories });
  };
}

export function useUpgradeRoom() {
  const invalidate = useUpgradeInvalidator();
  return useMutation({
    mutationFn: ({ categoryId, roomId, bedId }: { categoryId: string; roomId: string; bedId: string }) =>
      CategoryUpgradeService.upgradeRoom(categoryId, roomId, bedId),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Upgraded · new bill ₹${res.bill.billed.toLocaleString('en-IN')} generated`);
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
