// lib/services/internships/incidents-service.ts
// CRUD for internship_incidents.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipIncident,
  CreateIncidentInput,
  UpdateIncidentInput,
  IncidentStatus,
  IncidentSeverity,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_incidents' as const;

export interface IncidentFilters {
  assignmentId?: string;
  status?: IncidentStatus;
  severity?: IncidentSeverity;
}

export async function listIncidents(
  supabase: SupabaseClient,
  filters: IncidentFilters = {}
): Promise<ServiceListResult<InternshipIncident>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('incident_date', { ascending: false });

  if (filters.assignmentId) query = query.eq('assignment_id', filters.assignmentId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.severity) query = query.eq('severity', filters.severity);

  const { data, error } = await query;
  return {
    data: (data as InternshipIncident[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getIncidentById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipIncident>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipIncident) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createIncident(
  supabase: SupabaseClient,
  input: CreateIncidentInput
): Promise<ServiceResult<InternshipIncident>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipIncident) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateIncident(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateIncidentInput
): Promise<ServiceResult<InternshipIncident>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipIncident) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteIncident(
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

export async function resolveIncident(
  supabase: SupabaseClient,
  id: string,
  resolvedBy: string,
  resolutionNotes: string
): Promise<ServiceResult<InternshipIncident>> {
  return updateIncident(supabase, id, {
    status: 'resolved',
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy,
    resolution_notes: resolutionNotes,
  });
}
