'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessMenuService } from '@/lib/services/campus-living/mess-menu-service';
import type {
  MessMenu,
  CreateMessMenuDTO,
} from '@/types/campus-living';

// Query key factory
export const messMenuKeys = {
  all: ['mess-menus'] as const,
  list: (filters: Record<string, unknown>) => ['mess-menus', 'list', filters] as const,
  weekly: (institutionId: string, weekStartDate: string) => ['mess-menus', 'weekly', institutionId, weekStartDate] as const,
  detail: (id: string) => ['mess-menus', 'detail', id] as const,
};

// --- Query hooks ---

export function useMessMenus(institutionId: string, filters?: Record<string, unknown>) {
  return useQuery({
    queryKey: messMenuKeys.list({ institutionId, ...filters }),
    queryFn: () => MessMenuService.getMenus(institutionId, filters),
    enabled: !!institutionId,
  });
}

export function useWeeklyMenu(institutionId: string, weekStartDate: string) {
  return useQuery({
    queryKey: messMenuKeys.weekly(institutionId, weekStartDate),
    queryFn: () => MessMenuService.getWeeklyMenu(institutionId, weekStartDate),
    enabled: !!institutionId && !!weekStartDate,
  });
}

export function useMessMenu(id: string) {
  return useQuery({
    queryKey: messMenuKeys.detail(id),
    queryFn: () => MessMenuService.getMenu(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateMessMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMessMenuDTO) => MessMenuService.createMenu(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messMenuKeys.all });
      toast.success('Menu item created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create menu: ${error.message}`);
    },
  });
}

export function useUpdateMessMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateMessMenuDTO> }) =>
      MessMenuService.updateMenu(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: messMenuKeys.all });
      queryClient.invalidateQueries({ queryKey: messMenuKeys.detail(variables.id) });
      toast.success('Menu updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update menu: ${error.message}`);
    },
  });
}

export function useDeleteMessMenu() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => MessMenuService.deleteMenu(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messMenuKeys.all });
      toast.success('Menu deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete menu: ${error.message}`);
    },
  });
}
