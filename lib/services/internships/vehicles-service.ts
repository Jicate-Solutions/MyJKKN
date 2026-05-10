// lib/services/internships/vehicles-service.ts
// CRUD for internship_vehicles.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipVehicle,
  CreateVehicleInput,
  UpdateVehicleInput,
  VehicleStatus,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_vehicles' as const;

export async function listVehicles(
  supabase: SupabaseClient,
  institutionId?: string,
  status?: VehicleStatus
): Promise<ServiceListResult<InternshipVehicle>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('vehicle_number', { ascending: true });

  if (institutionId) query = query.eq('institution_id', institutionId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  return {
    data: (data as InternshipVehicle[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getVehicleById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipVehicle>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipVehicle) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createVehicle(
  supabase: SupabaseClient,
  input: CreateVehicleInput
): Promise<ServiceResult<InternshipVehicle>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipVehicle) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateVehicle(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateVehicleInput
): Promise<ServiceResult<InternshipVehicle>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipVehicle) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteVehicle(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id);

  return {
    data: null,
    error: error ? new Error(error.message) : null,
  };
}

export async function listAvailableVehicles(
  supabase: SupabaseClient,
  institutionId: string
): Promise<ServiceListResult<InternshipVehicle>> {
  return listVehicles(supabase, institutionId, 'available');
}
