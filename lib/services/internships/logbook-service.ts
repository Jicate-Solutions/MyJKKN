// lib/services/internships/logbook-service.ts
// CRUD for internship_logbook_entries.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipLogbookEntry,
  CreateLogbookEntryInput,
  UpdateLogbookEntryInput,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_logbook_entries' as const;

export async function listLogbookEntries(
  supabase: SupabaseClient,
  assignmentId?: string,
  learnerId?: string
): Promise<ServiceListResult<InternshipLogbookEntry>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('entry_date', { ascending: false });

  if (assignmentId) query = query.eq('assignment_id', assignmentId);
  if (learnerId) query = query.eq('learner_id', learnerId);

  const { data, error } = await query;
  return {
    data: (data as InternshipLogbookEntry[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getLogbookEntryById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipLogbookEntry>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipLogbookEntry) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createLogbookEntry(
  supabase: SupabaseClient,
  input: CreateLogbookEntryInput
): Promise<ServiceResult<InternshipLogbookEntry>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipLogbookEntry) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateLogbookEntry(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateLogbookEntryInput
): Promise<ServiceResult<InternshipLogbookEntry>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipLogbookEntry) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteLogbookEntry(
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

export async function submitLogbookEntry(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipLogbookEntry>> {
  return updateLogbookEntry(supabase, id, {
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  });
}

export async function approveLogbookEntry(
  supabase: SupabaseClient,
  id: string,
  approvedBy: string
): Promise<ServiceResult<InternshipLogbookEntry>> {
  return updateLogbookEntry(supabase, id, {
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: approvedBy,
  });
}
