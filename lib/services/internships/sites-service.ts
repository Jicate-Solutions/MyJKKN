// lib/services/internships/sites-service.ts
// CRUD for internship_external_sites + internship_site_contacts.
// TODO: Replace types with generated DB types after Agent A migration + types regen.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  InternshipExternalSite,
  CreateSiteInput,
  UpdateSiteInput,
  InternshipSiteContact,
  CreateSiteContactInput,
  UpdateSiteContactInput,
  ServiceResult,
  ServiceListResult,
} from './types';

const SITES_TABLE = 'internship_external_sites' as const;
const CONTACTS_TABLE = 'internship_site_contacts' as const;

// ---------------------------------------------------------------------------
// Sites
// ---------------------------------------------------------------------------

export async function listSites(
  supabase: SupabaseClient,
  institutionId?: string,
  activeOnly = false
): Promise<ServiceListResult<InternshipExternalSite>> {
  let query = supabase
    .from(SITES_TABLE)
    .select('*')
    .order('name', { ascending: true });

  if (institutionId) query = query.eq('institution_id', institutionId);
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  return {
    data: (data as InternshipExternalSite[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getSiteById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipExternalSite>> {
  const { data, error } = await supabase
    .from(SITES_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipExternalSite) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createSite(
  supabase: SupabaseClient,
  input: CreateSiteInput
): Promise<ServiceResult<InternshipExternalSite>> {
  const { data, error } = await supabase
    .from(SITES_TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipExternalSite) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateSite(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateSiteInput
): Promise<ServiceResult<InternshipExternalSite>> {
  const { data, error } = await supabase
    .from(SITES_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipExternalSite) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteSite(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from(SITES_TABLE)
    .delete()
    .eq('id', id);

  return {
    data: null,
    error: error ? new Error(error.message) : null,
  };
}

// ---------------------------------------------------------------------------
// Site contacts
// ---------------------------------------------------------------------------

export async function listSiteContacts(
  supabase: SupabaseClient,
  siteId: string
): Promise<ServiceListResult<InternshipSiteContact>> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .select('*')
    .eq('site_id', siteId)
    .order('is_primary', { ascending: false });

  return {
    data: (data as InternshipSiteContact[]) ?? [],
    error: error ? new Error(error.message) : null,
  };
}

export async function getSiteContactById(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<InternshipSiteContact>> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .select('*')
    .eq('id', id)
    .single();

  return {
    data: (data as InternshipSiteContact) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function createSiteContact(
  supabase: SupabaseClient,
  input: CreateSiteContactInput
): Promise<ServiceResult<InternshipSiteContact>> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .insert(input)
    .select()
    .single();

  return {
    data: (data as InternshipSiteContact) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function updateSiteContact(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateSiteContactInput
): Promise<ServiceResult<InternshipSiteContact>> {
  const { data, error } = await supabase
    .from(CONTACTS_TABLE)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return {
    data: (data as InternshipSiteContact) ?? null,
    error: error ? new Error(error.message) : null,
  };
}

export async function deleteSiteContact(
  supabase: SupabaseClient,
  id: string
): Promise<ServiceResult<null>> {
  const { error } = await supabase
    .from(CONTACTS_TABLE)
    .delete()
    .eq('id', id);

  return {
    data: null,
    error: error ? new Error(error.message) : null,
  };
}
