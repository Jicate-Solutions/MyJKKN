// lib/services/internships/certificates-service.ts
// CRUD for internship_certificates.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipCertificate,
  CreateCertificateInput,
  UpdateCertificateInput,
  ServiceResult,
  ServiceListResult,
} from './types';

const TABLE = 'internship_certificates' as const;

export async function listCertificates(
  supabase: SupabaseClient,
  learnerId?: string,
  assignmentId?: string
): Promise<ServiceListResult<InternshipCertificate>> {
  let query = supabase
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (learnerId) query = query.eq('learner_id', learnerId);
  if (assignmentId) query = query.eq('assignment_id', assignmentId);

  const { data, error } = await query;
  return {
    data: (data as InternshipCertificate[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getCertificateById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipCertificate>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipCertificate) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createCertificate(
  supabase: SupabaseClient,
  input: CreateCertificateInput
): Promise<ServiceResult<InternshipCertificate>> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipCertificate) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateCertificate(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateCertificateInput
): Promise<ServiceResult<InternshipCertificate>> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipCertificate) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteCertificate(
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

export async function issueCertificate(
  supabase: SupabaseClient,
  id: string,
  issuedBy: string,
  certificateNumber: string,
  fileUrl?: string
): Promise<ServiceResult<InternshipCertificate>> {
  return updateCertificate(supabase, id, {
    status: 'issued',
    issued_by: issuedBy,
    certificate_number: certificateNumber,
    issued_date: new Date().toISOString().split('T')[0],
    ...(fileUrl ? { file_url: fileUrl } : {}),
  });
}
