// lib/services/internships/assignments-service.ts
// CRUD + filtered queries for internship_assignments.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipAssignment,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  AssignmentFilters,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_assignments' as const;

export async function listAssignments(
  supabase: SupabaseClient,
  filters: AssignmentFilters = {}
): Promise<ServiceListResult<InternshipAssignment>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.cycleId) query = query.eq('cycle_id', filters.cycleId);
  if (filters.learnerId) query = query.eq('learner_id', filters.learnerId);
  if (filters.siteId) query = query.eq('site_id', filters.siteId);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  return {
    data: (data as InternshipAssignment[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getAssignmentById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipAssignment>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipAssignment) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function listAssignmentsByLearner(
  supabase: SupabaseClient,
  learnerId: string
): Promise<ServiceListResult<InternshipAssignment>> {
  return listAssignments(supabase, { learnerId });
}

export async function listAssignmentsByCycle(
  supabase: SupabaseClient,
  cycleId: string
): Promise<ServiceListResult<InternshipAssignment>> {
  return listAssignments(supabase, { cycleId });
}

export async function listAssignmentsByHospital(
  supabase: SupabaseClient,
  siteId: string
): Promise<ServiceListResult<InternshipAssignment>> {
  return listAssignments(supabase, { siteId });
}

export async function createAssignment(
  supabase: SupabaseClient,
  input: CreateAssignmentInput
): Promise<ServiceResult<InternshipAssignment>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipAssignment) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateAssignment(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateAssignmentInput
): Promise<ServiceResult<InternshipAssignment>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipAssignment) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteAssignment(
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
