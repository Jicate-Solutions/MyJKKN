/**
 * HR Faculty Workload Service
 *
 * CRUD operations for hr_faculty_workload table.
 * Pattern: static class, SupabaseClient as first arg (matches signal-service.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HRFacultyWorkload, WorkloadSource } from '@/types/hr-recruitment-need';

export interface WorkloadFilters {
  institution_id?: string;
  academic_year?: string;
  semester?: 1 | 2;
  verified?: boolean;
  staff_id?: string;
}

export interface WorkloadInsert {
  staff_id: string;
  institution_id: string;
  academic_year: string;
  semester: 1 | 2;
  weekly_contact_hours: number;
  weekly_admin_hours?: number | null;
  weekly_research_hours?: number | null;
  source: WorkloadSource;
  notes?: string | null;
}

export interface WorkloadUpdate {
  weekly_contact_hours?: number;
  weekly_admin_hours?: number | null;
  weekly_research_hours?: number | null;
  source?: WorkloadSource;
  notes?: string | null;
}

export class WorkloadService {
  static async list(
    supabase: SupabaseClient,
    filters: WorkloadFilters = {}
  ): Promise<HRFacultyWorkload[]> {
    let query = supabase
      .from('hr_faculty_workload')
      .select('*')
      .order('academic_year', { ascending: false })
      .order('semester', { ascending: false });

    if (filters.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }
    if (filters.academic_year) {
      query = query.eq('academic_year', filters.academic_year);
    }
    if (filters.semester !== undefined) {
      query = query.eq('semester', filters.semester);
    }
    if (filters.verified === true) {
      query = query.not('verified_at', 'is', null);
    } else if (filters.verified === false) {
      query = query.is('verified_at', null);
    }
    if (filters.staff_id) {
      query = query.eq('staff_id', filters.staff_id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as HRFacultyWorkload[];
  }

  static async getById(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRFacultyWorkload | null> {
    const { data, error } = await supabase
      .from('hr_faculty_workload')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as HRFacultyWorkload | null;
  }

  static async create(
    supabase: SupabaseClient,
    insert: WorkloadInsert
  ): Promise<HRFacultyWorkload> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_faculty_workload')
      .insert({ ...insert, entered_by: userId })
      .select()
      .single();

    if (error) throw error;
    return data as HRFacultyWorkload;
  }

  static async update(
    supabase: SupabaseClient,
    id: string,
    update: WorkloadUpdate
  ): Promise<HRFacultyWorkload> {
    const { data, error } = await supabase
      .from('hr_faculty_workload')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as HRFacultyWorkload;
  }

  static async delete(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_faculty_workload')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  static async verify(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRFacultyWorkload> {
    const userId = (await supabase.auth.getUser()).data.user?.id;

    const { data, error } = await supabase
      .from('hr_faculty_workload')
      .update({
        verified_at: new Date().toISOString(),
        verified_by: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as HRFacultyWorkload;
  }
}
