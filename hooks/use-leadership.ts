// React Query hooks for /organizations/leadership.
//
// Reads go through SECURITY DEFINER RPCs because user_roles, committees and
// user_institution_access are not readable by a college officer and RLS denial
// is SILENT — a direct read would print "Not assigned" over filled posts.
// All writes go through fn_set_college_leadership (see the page's history in
// supabase/migrations/20260809101500_college_leadership.sql).

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LeaderPerson, OverviewRow, PostEntry, PostKind } from '@/lib/organizations/leadership-stats';

export interface AppointmentBasis {
  code: string;
  label: string;
  description: string;
  passes_to_successor: boolean;
}

export interface CollegeDetail {
  institution_id: string;
  institution_name: string;
  committee_id: string | null;
  /** Only the posts that apply to this institution, in catalog order. */
  posts: PostEntry[];
}

export interface CatalogPost {
  code: string;
  label: string;
  description: string | null;
  kind: PostKind;
  is_builtin: boolean;
  /** true = belongs to this one institution only (deletable there). */
  owned: boolean;
}

export interface GroupPostEntry {
  code: string;
  label: string;
  description: string | null;
  holder: LeaderPerson | null;
}

export interface GroupLeadership {
  /** Decided by the server: only admins may appoint group-level posts. */
  can_manage_group: boolean;
  posts: GroupPostEntry[];
}

export interface Candidate {
  id: string;
  full_name: string | null;
  email: string | null;
}

export const LEADERSHIP_QK = {
  overview: ['organizations', 'leadership', 'overview'] as const,
  detail: (id: string) => ['organizations', 'leadership', 'detail', id] as const,
  people: (id: string) => ['organizations', 'leadership', 'people', id] as const,
  basis: ['organizations', 'leadership', 'basis'] as const,
  catalog: (id: string) => ['organizations', 'leadership', 'catalog', id] as const,
  group: ['organizations', 'leadership', 'group'] as const,
  groupPeople: ['organizations', 'leadership', 'group-people'] as const,
};

/** Posts an institution can pick from: shared ones plus its own. */
export function useLeadershipPostCatalog(institutionId: string, enabled = true) {
  return useQuery({
    queryKey: LEADERSHIP_QK.catalog(institutionId),
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CatalogPost[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_list_leadership_posts', {
        p_institution_id: institutionId,
      });
      if (error) throw error;
      return (data ?? []) as CatalogPost[];
    },
  });
}

export function useLeadershipOverview() {
  return useQuery({
    queryKey: LEADERSHIP_QK.overview,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<OverviewRow[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_leadership_overview');
      if (error) throw error;
      return (data ?? []) as OverviewRow[];
    },
  });
}

export function useCollegeLeadership(institutionId: string) {
  return useQuery({
    queryKey: LEADERSHIP_QK.detail(institutionId),
    enabled: !!institutionId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<CollegeDetail> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_get_college_posts', {
        p_institution_id: institutionId,
      });
      if (error) throw error;
      return data as CollegeDetail;
    },
  });
}

/** Everyone who could hold a post at this college — fn_list_leadership_candidates
 *  rather than profiles.institution_id, which is single-valued and hides anyone
 *  serving a second college. */
export function useCollegePeople(institutionId: string) {
  return useQuery({
    queryKey: LEADERSHIP_QK.people(institutionId),
    enabled: !!institutionId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Candidate[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_list_leadership_candidates', {
        p_institution_id: institutionId,
      });
      if (error) throw error;
      return (data ?? []) as Candidate[];
    },
  });
}

/** Appointment-basis vocabulary. `retry: false`: a failure means the table is
 *  not there yet, which only hides the basis UI; the page keeps working. */
export function useAppointmentBasis() {
  return useQuery({
    queryKey: LEADERSHIP_QK.basis,
    retry: false,
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<AppointmentBasis[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('leadership_appointment_basis')
        .select('code, label, description, passes_to_successor')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AppointmentBasis[];
    },
  });
}

/** Group-level posts (Managing Director, Joint MD …): one holder for the group. */
export function useGroupLeadership() {
  return useQuery({
    queryKey: LEADERSHIP_QK.group,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<GroupLeadership> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_list_group_leadership');
      if (error) throw error;
      return data as GroupLeadership;
    },
  });
}

export interface GroupCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  institution_id: string | null;
  institution_name: string | null;
  staff_id: string | null;
  photo_url?: string | null;
  designation?: string | null;
  is_active: boolean;
  roles: { id: string; role_name: string }[];
}

export interface CandidateFilters {
  query: string;
  roleIds: string[];
  /** "" = any institution. */
  institutionId: string;
  activeOnly: boolean;
  staffOnly: boolean;
}

export const CANDIDATE_PAGE_SIZE = 25;

/** Server-side search over profiles for the group-post picker (admin-only RPC).
 *  keepPreviousData: paging/typing must not blank the list between requests. */
export function useGroupCandidateSearch(filters: CandidateFilters, page: number, enabled: boolean) {
  return useQuery({
    queryKey: [...LEADERSHIP_QK.groupPeople, filters, page] as const,
    enabled,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ total: number; rows: GroupCandidate[] }> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_search_group_candidates', {
        p_query: filters.query.trim() || null,
        p_role_ids: filters.roleIds.length ? filters.roleIds : null,
        p_institution_id: filters.institutionId || null,
        p_active_only: filters.activeOnly,
        p_staff_only: filters.staffOnly,
        p_limit: CANDIDATE_PAGE_SIZE,
        p_offset: page * CANDIDATE_PAGE_SIZE,
      });
      if (error) throw error;
      return data as { total: number; rows: GroupCandidate[] };
    },
  });
}

export interface CandidateRole {
  id: string;
  role_name: string;
  role_key: string;
}

export function useGroupCandidateRoles(enabled: boolean) {
  return useQuery({
    queryKey: [...LEADERSHIP_QK.groupPeople, 'roles'] as const,
    enabled,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CandidateRole[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_list_group_candidate_roles');
      if (error) throw error;
      return (data ?? []) as CandidateRole[];
    },
  });
}

/** True only for a super admin. Everyone else who reaches the page is view-only;
 *  the write RPCs enforce the same rule server-side, this just hides the controls. */
export function useLeadershipCanEdit() {
  return useQuery({
    queryKey: [...LEADERSHIP_QK.group, 'can-edit'] as const,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb.rpc('fn_leadership_can_edit');
      if (error) throw error;
      return data === true;
    },
  });
}
