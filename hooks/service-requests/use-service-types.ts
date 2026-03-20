/**
 * Service Types React Query Hooks
 *
 * Provides hooks for managing service types:
 * - List/filter service types
 * - Get single service type by id or slug
 * - Create, update, deactivate service types
 *
 * @module hooks/service-requests/use-service-types
 * @created 2026-02-09
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type {
  ServiceType,
  CreateServiceTypeDto,
  UpdateServiceTypeDto,
} from '@/types/service-request';

// =====================================================
// QUERY KEYS
// =====================================================

export const serviceTypeKeys = {
  all: ['service-types'] as const,
  lists: () => [...serviceTypeKeys.all, 'list'] as const,
  list: (filters?: any) => [...serviceTypeKeys.lists(), filters] as const,
  details: () => [...serviceTypeKeys.all, 'detail'] as const,
  detail: (id: string) => [...serviceTypeKeys.details(), id] as const,
  bySlug: (slug: string) => [...serviceTypeKeys.all, 'slug', slug] as const,
};

// =====================================================
// QUERY HOOKS
// =====================================================

/**
 * Fetch all service types with optional filters
 */
export function useServiceTypes(filters?: { is_active?: boolean; search?: string }) {
  return useQuery<ServiceType[]>({
    queryKey: serviceTypeKeys.list(filters),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.is_active !== undefined) params.set('is_active', String(filters.is_active));
      if (filters?.search) params.set('search', filters.search);
      const res = await fetch(`/api/service-requests/types?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch service types');
      }
      return res.json();
    },
  });
}

/**
 * Fetch a single service type by ID (with fields and approval steps)
 */
export function useServiceType(id: string) {
  return useQuery<ServiceType>({
    queryKey: serviceTypeKeys.detail(id),
    queryFn: async () => {
      const res = await fetch(`/api/service-requests/types/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch service type');
      }
      return res.json();
    },
    enabled: !!id,
  });
}

/**
 * Fetch a service type by its slug
 */
export function useServiceTypeBySlug(slug: string) {
  return useQuery<ServiceType>({
    queryKey: serviceTypeKeys.bySlug(slug),
    queryFn: async () => {
      const res = await fetch(`/api/service-requests/types?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch service type');
      }
      return res.json();
    },
    enabled: !!slug,
  });
}

// =====================================================
// MUTATION HOOKS
// =====================================================

/**
 * Create a new service type
 */
export function useCreateServiceType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateServiceTypeDto) => {
      const res = await fetch('/api/service-requests/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create service type');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceTypeKeys.all });
      toast.success('Service type created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Update an existing service type
 */
export function useUpdateServiceType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateServiceTypeDto }) => {
      const res = await fetch(`/api/service-requests/types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update service type');
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: serviceTypeKeys.all });
      queryClient.invalidateQueries({ queryKey: serviceTypeKeys.detail(variables.id) });
      toast.success('Service type updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

/**
 * Deactivate a service type (soft delete)
 */
export function useDeactivateServiceType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/service-requests/types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to deactivate service type');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceTypeKeys.all });
      toast.success('Service type deactivated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
