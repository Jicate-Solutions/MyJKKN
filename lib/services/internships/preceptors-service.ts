// lib/services/internships/preceptors-service.ts
// CRUD for internship_preceptors.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipPreceptor,
  CreatePreceptorInput,
  UpdatePreceptorInput,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_preceptors' as const;

export async function listPreceptors(
  supabase: SupabaseClient,
  siteId?: string,
  activeOnly = false
): Promise<ServiceListResult<InternshipPreceptor>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('name', { ascending: true });

  if (siteId) query = query.eq('site_id', siteId);
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  return {
    data: (data as InternshipPreceptor[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getPreceptorById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipPreceptor>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipPreceptor) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createPreceptor(
  supabase: SupabaseClient,
  input: CreatePreceptorInput
): Promise<ServiceResult<InternshipPreceptor>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipPreceptor) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updatePreceptor(
  supabase: SupabaseClient,
  id: string,
  updates: UpdatePreceptorInput
): Promise<ServiceResult<InternshipPreceptor>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipPreceptor) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deletePreceptor(
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
