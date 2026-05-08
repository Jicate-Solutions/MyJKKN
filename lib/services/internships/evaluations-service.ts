// lib/services/internships/evaluations-service.ts
// CRUD for internship_evaluations (preceptor + faculty roles).
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipEvaluation,
  CreateEvaluationInput,
  UpdateEvaluationInput,
  EvaluatorRole,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_evaluations' as const;

export async function listEvaluations(
  supabase: SupabaseClient,
  assignmentId?: string,
  evaluatorRole?: EvaluatorRole
): Promise<ServiceListResult<InternshipEvaluation>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (assignmentId) query = query.eq('assignment_id', assignmentId);
  if (evaluatorRole) query = query.eq('evaluator_role', evaluatorRole);

  const { data, error } = await query;
  return {
    data: (data as InternshipEvaluation[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getEvaluationById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipEvaluation>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipEvaluation) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function listEvaluationsByAssignment(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<ServiceListResult<InternshipEvaluation>> {
  return listEvaluations(supabase, assignmentId);
}

export async function listPreceptorEvaluations(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<ServiceListResult<InternshipEvaluation>> {
  return listEvaluations(supabase, assignmentId, 'preceptor');
}

export async function listFacultyEvaluations(
  supabase: SupabaseClient,
  assignmentId: string
): Promise<ServiceListResult<InternshipEvaluation>> {
  return listEvaluations(supabase, assignmentId, 'faculty');
}

export async function createEvaluation(
  supabase: SupabaseClient,
  input: CreateEvaluationInput
): Promise<ServiceResult<InternshipEvaluation>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipEvaluation) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateEvaluation(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateEvaluationInput
): Promise<ServiceResult<InternshipEvaluation>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipEvaluation) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteEvaluation(
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

export async function submitEvaluation(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipEvaluation>> {
  return updateEvaluation(supabase, id, {
    status: 'completed',
    submitted_at: new Date().toISOString(),
  });
}
