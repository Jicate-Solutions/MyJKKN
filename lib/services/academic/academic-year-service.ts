// lib/services/academic/academic-year-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';
import {
  createApiInstitutionFilter,
  applyInstitutionFilterToQuery
} from '@/lib/auth/api-institution-filter';
import type {
  AcademicYear,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
  AcademicYearFilters,
  AcademicYearListResponse
} from '@/types/academics';
import { logger } from '@/lib/utils/enhanced-logger';
import { logActivityClient, AcademicActivityTemplates } from '@/lib/utils/activity-logger-client';

export class AcademicYearService {
  private static supabase = createClientSupabaseClient();

  static async createAcademicYear(
    data: CreateAcademicYearDto
  ): Promise<AcademicYear> {
    try {
      const { data: academicYear, error } = await (this.supabase as any)
        .from('academic_years')
        .insert([data])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(
            'An academic year with this name already exists for the selected institution'
          );
        }
        throw error;
      }

      toast.success('Academic year created successfully');
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.yearCreated(academicYear.academic_year_name);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: academicYear.id,
            resourceName: academicYear.academic_year_name,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: academicYear.institution_id,
          });
        } catch { /* never block */ }
      })();
      return academicYear;
    } catch (error) {
      logger.error('academic/academic-years', 'Error creating academic year', error);
      throw error;
    }
  }

  /**
   * What still points at an academic year, across the six tables that carry
   * volume or lose data:
   *   timetables, intake_history ........ ON DELETE CASCADE — deleting the year
   *                                       DELETES these rows outright
   *   learners_profiles, billing_student_bills
   *                              ........ ON DELETE SET NULL — silently untags
   *                                       the learner / the bill
   *   student_attendance, staff_plans ... plain FK — the delete just fails
   *
   * Goes through fn_academic_year_dependents (SECURITY DEFINER) rather than
   * counting from here: this service runs on the browser client, so RLS would
   * shrink every count for an operator who administers Academic Years without
   * read access to attendance or timetables — and a guard that under-counts
   * reads as a clean bill of health.
   *
   * Checked before deactivate as well as delete. Deactivating is not the
   * harmless half: every picker filters `is_active`, so a switched-off year
   * stays in the column but can no longer be rendered or corrected from the
   * form. On 2026-07-28 four duplicate Dental years were switched off in a
   * single update and 15 learners were stranded on them — which is how
   * DB22095 VISHALI T came to show "2025-2026 Additional 3", a year absent
   * from the Academic Years screen.
   */
  static async getAcademicYearDependents(
    id: string
  ): Promise<{ total: number; summary: string }> {
    const { data, error } = await (this.supabase as any).rpc(
      'fn_academic_year_dependents',
      { p_academic_year_id: id }
    );
    if (error) throw error;

    const used = ((data ?? []) as { entity: string; row_count: number }[])
      .map(r => ({ entity: r.entity, count: Number(r.row_count) || 0 }))
      .filter(r => r.count > 0);

    return {
      total: used.reduce((sum, r) => sum + r.count, 0),
      summary: used
        .map(r => `${r.count} ${r.entity}${r.count === 1 ? '' : 's'}`)
        .join(', '),
    };
  }

  static async updateAcademicYear(
    id: string,
    data: UpdateAcademicYearDto
  ): Promise<AcademicYear> {
    try {
      if (data.is_active === false) {
        const { total, summary } = await this.getAcademicYearDependents(id);
        if (total > 0) {
          throw new Error(
            `Cannot deactivate this academic year — ${summary} still reference it. ` +
              `Move them to another academic year first, or they will be left pointing ` +
              `at a year no dropdown can display.`
          );
        }
      }

      const { data: academicYear, error } = await (this.supabase as any)
        .from('academic_years')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast.success('Academic year updated successfully');
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.yearUpdated(academicYear.academic_year_name, Object.keys(data));
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: academicYear.academic_year_name,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: academicYear.institution_id,
          });
        } catch { /* never block */ }
      })();
      return academicYear;
    } catch (error) {
      logger.error('academic/academic-years', 'Error updating academic year', error);
      throw error;
    }
  }

  static async deleteAcademicYear(id: string): Promise<void> {
    let nameForLog = id;
    let institutionIdForLog: string | undefined;
    try {
      const { data: existing } = await AcademicYearService.supabase
        .from('academic_years')
        .select('academic_year_name, institution_id')
        .eq('id', id)
        .single();
      nameForLog = existing?.academic_year_name || id;
      institutionIdForLog = existing?.institution_id;
    } catch { /* ignore */ }

    try {
      // Deleting is the destructive half: timetables and intake_history are
      // ON DELETE CASCADE, so Postgres removes them without a word, while
      // learners and bills are ON DELETE SET NULL and quietly lose their year.
      // Verified 2026-08-10 — the four "empty-looking" duplicate Dental years
      // still held 3 timetables, 30 attendance records, 1 bill and 1 intake row.
      const { total, summary } = await this.getAcademicYearDependents(id);
      if (total > 0) {
        throw new Error(
          `Cannot delete this academic year — ${summary} reference it. ` +
            `Deleting would erase the timetables and intake history outright and ` +
            `strip the academic year from the learners and bills.`
        );
      }

      const { error } = await this.supabase
        .from('academic_years')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Academic year deleted successfully');
      (async () => {
        try {
          const supabase = createClientSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user?.id) return;
          const template = AcademicActivityTemplates.yearDeleted(nameForLog);
          await logActivityClient({
            userId: user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            resourceId: id,
            resourceName: nameForLog,
            description: template.description,
            metadata: { sub_type: template.sub_type },
            institutionId: institutionIdForLog,
          });
        } catch { /* never block */ }
      })();
    } catch (error) {
      logger.error('academic/academic-years', 'Error deleting academic year', error);
      throw error;
    }
  }

  static async bulkDeleteAcademicYears(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteAcademicYear(id);
        success.push(id);
      } catch (error) {
        logger.error('academic/academic-years', `Error deleting academic year ${id}`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }

  // Add institution filtering helper method
  private static async applyInstitutionAccess(
    query: any,
    userInstitutionId?: string | null
  ): Promise<any> {
    if (userInstitutionId) {
      return query.eq('institution_id', userInstitutionId);
    }
    return query;
  }

  // Enhanced method with institution filtering
  static async getAcademicYearsWithAccess(
    filters: AcademicYearFilters = {},
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<AcademicYearListResponse> {
    try {
      let query = (this.supabase as any).from('academic_years').select(
        `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
          `,
        { count: 'exact' }
      );

      // Apply institution filter based on user permissions
      if (filters.institution_id) {
        // If a specific institution is requested, check if user has access
        if (
          !isSuperAdmin &&
          userInstitutionId &&
          filters.institution_id !== userInstitutionId
        ) {
          logger.warn('academic/academic-years', 'Access denied: User trying to access different institution data', {
            requestedInstitution: filters.institution_id,
            userInstitution: userInstitutionId
          });
          throw new Error(
            'Access denied: You can only access your own institution data'
          );
        }
        query = query.eq('institution_id', filters.institution_id);
      } else if (!isSuperAdmin && userInstitutionId) {
        // If no specific institution is requested, filter by user's institution
        query = query.eq('institution_id', userInstitutionId);
      }

      // Apply search filter
      if (filters.search) {
        query = query.ilike('academic_year_name', `%${filters.search}%`);
      }

      // Apply active status filter
      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply sorting
      query = query.order('created_at', { ascending: false });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/academic-years', 'Supabase query error in getAcademicYearsWithAccess', error);
        throw error;
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data || [],
        metadata: {
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      logger.error('academic/academic-years', 'Error fetching academic years with access control', error);
      throw error;
    }
  }

  // Enhanced method for getting academic years by institution with access control
  static async getAcademicYearsByInstitutionWithAccess(
    institutionId: string,
    userInstitutionId?: string | null,
    isSuperAdmin: boolean = false
  ): Promise<AcademicYear[]> {
    try {
      // Check if user has access to the requested institution
      if (
        !isSuperAdmin &&
        userInstitutionId &&
        institutionId !== userInstitutionId
      ) {
        throw new Error(
          'Access denied: You can only access your own institution data'
        );
      }

      const { data, error } = await this.supabase
        .from('academic_years')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('is_active', true)
        .order('academic_year_name');

      if (error) throw error;

      return data || [];
    } catch (error) {
      logger.error('academic/academic-years', 'Error fetching academic years by institution', error);
      throw error;
    }
  }

  // Keep the original method for backward compatibility
  static async getAcademicYears(
    filters: AcademicYearFilters = {}
  ): Promise<AcademicYearListResponse> {
    try {
      let query = (this.supabase as any).from('academic_years').select(
        `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
          `,
        { count: 'exact' }
      );

      // Apply institution filter
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Apply search filter
      if (filters.search) {
        query = query.ilike('academic_year_name', `%${filters.search}%`);
      }

      // Apply active status filter
      if (filters.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      // Apply sorting
      query = query.order('created_at', { ascending: false });

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        logger.error('academic/academic-years', 'Supabase query error', error);
        throw error;
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data || [],
        metadata: {
          total,
          page,
          limit,
          totalPages
        }
      };
    } catch (error) {
      logger.error('academic/academic-years', 'Error fetching academic years', error);
      throw error;
    }
  }

  static async getAcademicYear(id: string): Promise<AcademicYear | null> {
    try {
      const { data: academicYear, error } = await this.supabase
        .from('academic_years')
        .select(
          `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
          `
        )
        .eq('id', id)
        .maybeSingle();

      // Handle error but ignore PGRST116 (no rows found) - this can happen due to RLS or deleted records
      if (error && error.code !== 'PGRST116') {
        logger.error('academic/academic-years', 'Error fetching academic year', error);
        throw error;
      }

      // Return null if academic year not found or not accessible (RLS blocked)
      if (!academicYear) {
        logger.warn('academic/academic-years', 'Academic year not found or not accessible', { id });
        return null;
      }

      return academicYear;
    } catch (error) {
      logger.error('academic/academic-years', 'Error fetching academic year', error);
      throw error;
    }
  }

  static async getAcademicYearsByInstitution(
    institutionId: string,
    includeInactive: boolean = false
  ): Promise<AcademicYear[]> {
    try {
      let query = this.supabase
        .from('academic_years')
        .select(
          `
          *,
          institution:institutions (
            id,
            name,
            counselling_code
          )
        `
        )
        .eq('institution_id', institutionId);

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data: academicYears, error } = await query.order('start_date', { ascending: false });

      if (error) throw error;

      return academicYears || [];
    } catch (error) {
      logger.error('academic/academic-years', 'Error fetching academic years by institution', error);
      throw error;
    }
  }
}
