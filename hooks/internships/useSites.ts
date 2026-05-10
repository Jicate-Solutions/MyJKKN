'use client';
// hooks/internships/useSites.ts
// React Query hooks for internship_external_sites + internship_site_contacts.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  listSites,
  getSiteById,
  createSite,
  updateSite,
  deleteSite,
  listSiteContacts,
  getSiteContactById,
  createSiteContact,
  updateSiteContact,
  deleteSiteContact,
} from '@/lib/services/internships/sites-service';
import type {
  CreateExternalSiteInput,
  UpdateExternalSiteInput,
  CreateSiteContactInput,
  UpdateSiteContactInput,
} from '@/lib/services/internships/types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------
export const sitesKeys = {
  all: ['internship-sites'] as const,
  lists: () => [...sitesKeys.all, 'list'] as const,
  list: (institutionId?: string, activeOnly?: boolean) =>
    [...sitesKeys.lists(), institutionId ?? 'all', activeOnly ? 'active' : 'all'] as const,
  details: () => [...sitesKeys.all, 'detail'] as const,
  detail: (id: string) => [...sitesKeys.details(), id] as const,
  contacts: (siteId: string) => [...sitesKeys.all, 'contacts', siteId] as const,
  contact: (id: string) => [...sitesKeys.all, 'contact', id] as const,
};

// ---------------------------------------------------------------------------
// Queries — sites
// ---------------------------------------------------------------------------

export function useSites(institutionId?: string, activeOnly = false) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: sitesKeys.list(institutionId, activeOnly),
    queryFn: async () => {
      const { data, error } = await listSites(supabase, institutionId, activeOnly);
      if (error) throw error;
      return data;
    },
  });
}

export function useSite(id?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: sitesKeys.detail(id ?? ''),
    queryFn: async () => {
      const { data, error } = await getSiteById(supabase, id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Query — site types (config lookup table powering the site_type_id FK)
// ---------------------------------------------------------------------------

export function useSiteTypes(activeOnly = true) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: [...sitesKeys.all, 'site-types', activeOnly ? 'active' : 'all'] as const,
    queryFn: async () => {
      let query = supabase
        .from('internship_site_types')
        .select('id, institution_id, config_key, display_name, description, is_system, is_active, sort_order, created_at, updated_at')
        .order('sort_order', { ascending: true });
      if (activeOnly) query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Queries — contacts
// ---------------------------------------------------------------------------

export function useSiteContacts(siteId?: string) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: sitesKeys.contacts(siteId ?? ''),
    queryFn: async () => {
      const { data, error } = await listSiteContacts(supabase, siteId!);
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });
}

// ---------------------------------------------------------------------------
// Mutations — sites
// ---------------------------------------------------------------------------

export function useCreateSite() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExternalSiteInput) =>
      createSite(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: () => {
      toast.success('Site created');
      queryClient.invalidateQueries({ queryKey: sitesKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to create site');
    },
  });
}

export function useUpdateSite() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateExternalSiteInput }) =>
      updateSite(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Site updated');
      queryClient.invalidateQueries({ queryKey: sitesKeys.lists() });
      queryClient.invalidateQueries({ queryKey: sitesKeys.detail(data.id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update site');
    },
  });
}

export function useDeleteSite() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSite(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Site deleted');
      queryClient.invalidateQueries({ queryKey: sitesKeys.lists() });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete site');
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — contacts
// ---------------------------------------------------------------------------

export function useCreateSiteContact() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSiteContactInput) =>
      createSiteContact(supabase, input).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Contact added');
      queryClient.invalidateQueries({ queryKey: sitesKeys.contacts(data.site_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to add contact');
    },
  });
}

export function useUpdateSiteContact() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateSiteContactInput }) =>
      updateSiteContact(supabase, id, updates).then(({ data, error }) => {
        if (error) throw error;
        return data!;
      }),
    onSuccess: (data) => {
      toast.success('Contact updated');
      queryClient.invalidateQueries({ queryKey: sitesKeys.contacts(data.site_id) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update contact');
    },
  });
}

export function useDeleteSiteContact() {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSiteContact(supabase, id).then(({ error }) => {
      if (error) throw error;
    }),
    onSuccess: () => {
      toast.success('Contact removed');
      queryClient.invalidateQueries({ queryKey: sitesKeys.all });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove contact');
    },
  });
}
