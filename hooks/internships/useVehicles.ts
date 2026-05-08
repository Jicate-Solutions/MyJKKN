'use client';
// hooks/internships/useVehicles.ts
// React Query hooks for internship_vehicles.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listVehicles,
  listAvailableVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from '@/lib/services/internships/vehicles-service';
import type {
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleStatus,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const vehiclesKeys = {
  all: ['internship-vehicles'] as const,
  lists: () => [...vehiclesKeys.all, 'list'] as const,
  list: (institutionId?: string, status?: VehicleStatus) =>
    [...vehiclesKeys.lists(), institutionId ?? 'all', status ?? 'all'] as const,
  available: (institutionId: string) =>
    [...vehiclesKeys.all, 'available', institutionId] as const,
  details: () => [...vehiclesKeys.all, 'detail'] as const,
  detail: (id: string) => [...vehiclesKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useVehicles(institutionId?: string, status?: VehicleStatus) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: vehiclesKeys.list(institutionId, status),
    queryFn: async () => {
      const { data, error } = await listVehicles(supabase, institutionId, status);
      if (error) throw error;
      return data;
    },
  });
}

export function useAvailableVehicles(institutionId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: vehiclesKeys.available(institutionId ?? ''),
    queryFn: async () => {
      const { data, error } = await listAvailableVehicles(supabase, institutionId!);
      if (error) throw error;
      return data;
    },
    enabled: !!institutionId,
  });
}

export function useVehicle(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: vehiclesKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getVehicleById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateVehicle() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateVehicleInput) =>
      createVehicle(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Vehicle added');
      queryClient.invalidateQueries({ queryKey: vehiclesKeys.list(data.institution_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add vehicle');
    },
  });
}

export function useUpdateVehicle() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateVehicleInput }) =>
      updateVehicle(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Vehicle updated');
      queryClient.invalidateQueries({ queryKey: vehiclesKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: vehiclesKeys.list(data.institution_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update vehicle');
    },
  });
}

export function useDeleteVehicle() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteVehicle(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Vehicle removed');
      queryClient.invalidateQueries({ queryKey: vehiclesKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove vehicle');
    },
  });
}
