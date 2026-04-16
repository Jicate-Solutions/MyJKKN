/**
 * HR Recruitment Jobs Service (Phase 3)
 *
 * Static class — SupabaseClient passed as first argument (mirrors RecruitmentService).
 * Spec: specs/hr-recruitment-module-spec.md (Cvviz-sunset scope)
 *
 * Methods:
 *   listJobs      — paginated list with filters
 *   getJob        — single record by id
 *   createJob     — create a new job posting (status defaults to 'draft')
 *   updateJob     — update mutable fields
 *   publishJob    — flips is_public=true + status='open' for /careers visibility
 *   closeJob      — convenience for status='closed' with closes_at stamp
 *   deleteJob     — hard delete (soft-archival is via status='closed')
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRRecruitmentJob,
  HRRecruitmentJobInsert,
  HRRecruitmentJobUpdate,
  JobFilters,
  JobListResponse,
  JobStatus,
} from '@/types/hr-recruitment';

// =====================================================================================
// Recruitment Jobs Service
// =====================================================================================

export class RecruitmentJobsService {
  // ----- List / Get -----

  static async listJobs(
    supabase: SupabaseClient,
    filters: JobFilters = {}
  ): Promise<JobListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('hr_recruitment_jobs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.hr_organization_id) {
      q = q.eq('hr_organization_id', filters.hr_organization_id);
    }
    if (filters.institution_id) {
      q = q.eq('institution_id', filters.institution_id);
    }
    if (filters.role_category) {
      q = q.eq('role_category', filters.role_category);
    }
    if (filters.department_id) {
      q = q.eq('department_id', filters.department_id);
    }
    if (filters.is_public !== undefined) {
      q = q.eq('is_public', filters.is_public);
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.search) {
      q = q.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    const { data, count, error } = await q;
    if (error) throw error;

    return {
      data: (data ?? []) as HRRecruitmentJob[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getJob(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentJob | null> {
    const { data, error } = await supabase
      .from('hr_recruitment_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as HRRecruitmentJob | null;
  }

  // ----- Create -----

  static async createJob(
    supabase: SupabaseClient,
    payload: HRRecruitmentJobInsert
  ): Promise<HRRecruitmentJob> {
    if (!payload.title || !payload.title.trim()) {
      throw new Error('Job title is required.');
    }
    if (!payload.role_category) {
      throw new Error('role_category is required.');
    }
    if (
      payload.min_monthly_salary != null &&
      payload.max_monthly_salary != null &&
      payload.min_monthly_salary > payload.max_monthly_salary
    ) {
      throw new Error('min_monthly_salary cannot exceed max_monthly_salary.');
    }

    const insertPayload: Record<string, unknown> = {
      hr_organization_id: payload.hr_organization_id,
      institution_id: payload.institution_id ?? null,
      title: payload.title.trim(),
      role_category: payload.role_category,
      description: payload.description ?? null,
      requirements: payload.requirements ?? {},
      min_monthly_salary: payload.min_monthly_salary ?? null,
      max_monthly_salary: payload.max_monthly_salary ?? null,
      positions_open: payload.positions_open ?? 1,
      positions_filled: payload.positions_filled ?? 0,
      department_id: payload.department_id ?? null,
      status: payload.status ?? 'draft',
      is_public: payload.is_public ?? false,
      posted_at: payload.posted_at ?? null,
      closes_at: payload.closes_at ?? null,
      created_by: payload.created_by ?? null,
    };

    const { data, error } = await supabase
      .from('hr_recruitment_jobs')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentJob;
  }

  // ----- Update -----

  static async updateJob(
    supabase: SupabaseClient,
    id: string,
    patch: HRRecruitmentJobUpdate
  ): Promise<HRRecruitmentJob> {
    if (
      patch.min_monthly_salary != null &&
      patch.max_monthly_salary != null &&
      patch.min_monthly_salary > patch.max_monthly_salary
    ) {
      throw new Error('min_monthly_salary cannot exceed max_monthly_salary.');
    }

    const { data, error } = await supabase
      .from('hr_recruitment_jobs')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentJob;
  }

  // ----- Publish (flip is_public for /careers page) -----

  /**
   * Publish a job: sets is_public=true and status='open' if it was 'draft'.
   * Stamps posted_at if not already set.
   */
  static async publishJob(
    supabase: SupabaseClient,
    id: string
  ): Promise<HRRecruitmentJob> {
    const job = await this.getJob(supabase, id);
    if (!job) throw new Error('Job not found');

    const update: Record<string, unknown> = {
      is_public: true,
      updated_at: new Date().toISOString(),
    };
    if (job.status === 'draft') {
      update.status = 'open';
    }
    if (!job.posted_at) {
      update.posted_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('hr_recruitment_jobs')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentJob;
  }

  // ----- Close -----

  static async closeJob(
    supabase: SupabaseClient,
    id: string,
    newStatus: Extract<JobStatus, 'closed' | 'filled'> = 'closed'
  ): Promise<HRRecruitmentJob> {
    const { data, error } = await supabase
      .from('hr_recruitment_jobs')
      .update({
        status: newStatus,
        is_public: false,
        closes_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as HRRecruitmentJob;
  }

  // ----- Delete -----

  static async deleteJob(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('hr_recruitment_jobs')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
