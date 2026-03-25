// ============================================
// REFERRAL DROPDOWN HOOKS
// ============================================
// Created: 2026-03-13
// Purpose: Hooks for fetching students and faculty
// for the referral type dropdowns in lead creation
// ============================================

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface DropdownOption {
  id: string;
  name: string;
}

/**
 * Fetch active students (learners_profiles with lifecycle_status='active')
 * for the referral student dropdown.
 * Filtered by institution_id when provided.
 */
export function useStudentsForDropdown(institutionId?: string) {
  return useQuery<DropdownOption[]>({
    queryKey: ['students-dropdown', institutionId ?? 'all'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('learners_profiles')
        .select('id, first_name, last_name')
        .eq('lifecycle_status', 'active')
        .order('first_name', { ascending: true })
        .limit(1000);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[referral-dropdowns] Failed to fetch students:', error.message);
        return [];
      }

      return (data || []).map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name || ''}`.trim(),
      }));
    },
    enabled: institutionId !== '',
  });
}

/**
 * Fetch users by role(s) from the profiles table for role-based dropdowns.
 * Supports multiple roles (e.g., ['faculty', 'student']).
 * Returns users with their role for badge display.
 */
export interface RoleDropdownOption {
  id: string;
  name: string;
  role: string;
}

export function useUsersByRolesForDropdown(roles: string[]) {
  return useQuery<RoleDropdownOption[]>({
    queryKey: ['users-by-roles-dropdown', ...roles],
    queryFn: async () => {
      if (roles.length === 0) return [];

      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name, role')
        .in('role', roles)
        .order('full_name', { ascending: true })
        .limit(1000);

      if (error) {
        console.error('[referral-dropdowns] Failed to fetch users by role:', error.message);
        return [];
      }

      return (data || []).map((u: any) => ({
        id: u.id,
        name: u.full_name || 'Unknown',
        role: u.role || '',
      }));
    },
    enabled: roles.length > 0,
  });
}

/**
 * Fetch active faculty/staff for the referral faculty dropdown.
 * Filtered by institution_id when provided.
 */
export function useFacultyForDropdown(institutionId?: string) {
  return useQuery<DropdownOption[]>({
    queryKey: ['faculty-dropdown', institutionId ?? 'all'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('staff')
        .select('id, first_name, last_name, designation')
        .eq('is_active', true)
        .order('first_name', { ascending: true })
        .limit(1000);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[referral-dropdowns] Failed to fetch faculty:', error.message);
        return [];
      }

      return (data || []).map((f: any) => ({
        id: f.id,
        name: `${f.first_name} ${f.last_name || ''}`.trim() +
          (f.designation ? ` (${f.designation})` : ''),
      }));
    },
    enabled: institutionId !== '',
  });
}

// ============================================
// HIERARCHY-FILTERED DROPDOWN HOOKS
// ============================================
// Added: 2026-03-25
// Purpose: Staff and student dropdowns with
// academic hierarchy filters for expo team assignment
// ============================================

export interface StaffHierarchyFilters {
  institution_id?: string;
  department_id?: string;
  search?: string;
}

/**
 * Fetch staff filtered by institution and department hierarchy.
 * Returns profiles with role in (faculty, staff, hod, principal).
 */
export function useFilteredStaffForDropdown(filters: StaffHierarchyFilters) {
  return useQuery<RoleDropdownOption[]>({
    queryKey: ['filtered-staff-dropdown', filters],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['faculty', 'staff', 'hod', 'principal'])
        .order('full_name', { ascending: true })
        .limit(200);

      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }
      if (filters.search) {
        query = query.ilike('full_name', `%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[referral-dropdowns] Failed to fetch filtered staff:', error.message);
        return [];
      }

      return (data || []).map((u: any) => ({
        id: u.id,
        name: u.full_name || 'Unknown',
        role: u.role || '',
      }));
    },
    enabled: !!filters.institution_id,
  });
}

export interface StudentHierarchyFilters {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  search?: string;
}

/**
 * Fetch students filtered by full academic hierarchy.
 * Queries learners_profiles with lifecycle_status='active'.
 */
export function useFilteredStudentsForDropdown(filters: StudentHierarchyFilters) {
  return useQuery<DropdownOption[]>({
    queryKey: ['filtered-students-dropdown', filters],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('learners_profiles')
        .select('id, first_name, last_name')
        .eq('lifecycle_status', 'active')
        .order('first_name', { ascending: true })
        .limit(200);

      if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
      if (filters.degree_id) query = query.eq('degree_id', filters.degree_id);
      if (filters.department_id) query = query.eq('department_id', filters.department_id);
      if (filters.program_id) query = query.eq('program_id', filters.program_id);
      if (filters.semester_id) query = query.eq('semester_id', filters.semester_id);
      if (filters.section_id) query = query.eq('section_id', filters.section_id);
      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        console.error('[referral-dropdowns] Failed to fetch filtered students:', error.message);
        return [];
      }

      return (data || []).map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name || ''}`.trim(),
      }));
    },
    enabled: !!filters.institution_id,
  });
}
