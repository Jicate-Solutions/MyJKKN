// lib/services/internships/cycles-service.ts
// CRUD operations for internship_posting_cycles.
// TODO: After Agent A migration lands + types regen, replace InternshipCycle
//       with Database['public']['Tables']['internship_posting_cycles']['Row'].

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipCycle,
  CreateCycleInput,
  UpdateCycleInput,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_posting_cycles' as const;

export async function listCycles(
  supabase: SupabaseClient,
  institutionId?: string
): Promise<ServiceListResult<InternshipCycle>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (institutionId) {
    query = query.eq('institution_id', institutionId);
  }

  const { data, error } = await query;
  return {
    data: (data as InternshipCycle[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getCycleById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipCycle>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipCycle) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createCycle(
  supabase: SupabaseClient,
  input: CreateCycleInput
): Promise<ServiceResult<InternshipCycle>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipCycle) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateCycle(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateCycleInput
): Promise<ServiceResult<InternshipCycle>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipCycle) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteCycle(
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
