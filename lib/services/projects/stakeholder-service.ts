/**
 * Stakeholder & Status-Report Service
 *
 * CRUD for:
 *   project_stakeholders  — internal (staff_id) or external person with role
 *                           and notification preferences (notify_in_app /
 *                           notify_email).  Actual email / in-app SENDING is
 *                           deferred — this service only stores preferences.
 *   project_status_reports — weekly / manual status reports (RAG, summary,
 *                            period dates, free-form JSONB content).
 *
 * Pattern: static class, SupabaseClient as first arg (matches ProjectService /
 * RiskService). Errors are thrown, not swallowed. Audit cols omitted on INSERT.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectStakeholder, ProjectStatusReport } from '@/types/projects';
import { getCurrentActorId } from '@/lib/services/projects/_actor';
import type {
  StakeholderInsert,
  StakeholderUpdate,
  StakeholderFilters,
  StatusReportInsert,
  StatusReportUpdate,
  StatusReportFilters,
} from '@/components/projects/stakeholders/types';

export class StakeholderService {
  // ─── Stakeholders ──────────────────────────────────────────────────────────────

  static async listStakeholders(
    supabase: SupabaseClient,
    filters: StakeholderFilters = {}
  ): Promise<ProjectStakeholder[]> {
    let query = supabase
      .from('project_stakeholders')
      .select('*')
      .order('created_at', { ascending: true });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.staffId) {
      query = query.eq('staff_id', filters.staffId);
    }
    if (filters.role) {
      query = query.eq('role', filters.role);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectStakeholder[];
  }

  static async getStakeholder(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectStakeholder | null> {
    const { data, error } = await supabase
      .from('project_stakeholders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectStakeholder | null;
  }

  static async createStakeholder(
    supabase: SupabaseClient,
    input: StakeholderInsert
  ): Promise<ProjectStakeholder> {
    const { data, error } = await supabase
      .from('project_stakeholders')
      .insert({
        project_id: input.project_id,
        staff_id: input.staff_id ?? null,
        external_name: input.external_name ?? null,
        external_email: input.external_email ?? null,
        role: input.role ?? null,
        notify_in_app: input.notify_in_app ?? false,
        notify_email: input.notify_email ?? false,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectStakeholder;
  }

  static async updateStakeholder(
    supabase: SupabaseClient,
    id: string,
    input: StakeholderUpdate
  ): Promise<ProjectStakeholder> {
    const { data, error } = await supabase
      .from('project_stakeholders')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectStakeholder;
  }

  static async deleteStakeholder(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('project_stakeholders')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}

export class StatusReportService {
  // ─── Status Reports ────────────────────────────────────────────────────────────

  static async listStatusReports(
    supabase: SupabaseClient,
    filters: StatusReportFilters = {}
  ): Promise<ProjectStatusReport[]> {
    let query = supabase
      .from('project_status_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.ragStatus) {
      query = query.eq('rag_status', filters.ragStatus);
    }
    if (filters.generatedType) {
      query = query.eq('generated_type', filters.generatedType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectStatusReport[];
  }

  static async getStatusReport(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectStatusReport | null> {
    const { data, error } = await supabase
      .from('project_status_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectStatusReport | null;
  }

  static async createStatusReport(
    supabase: SupabaseClient,
    input: StatusReportInsert
  ): Promise<ProjectStatusReport> {
    // created_by → project_status_reports.created_by FK → profiles(id); no DB default
    const createdBy = await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_status_reports')
      .insert({
        project_id: input.project_id,
        report_period_start: input.report_period_start ?? null,
        report_period_end: input.report_period_end ?? null,
        summary: input.summary ?? null,
        rag_status: input.rag_status ?? null,
        generated_type: input.generated_type ?? 'manual',
        content: input.content ?? {},
        storage_path: input.storage_path ?? null,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectStatusReport;
  }

  static async updateStatusReport(
    supabase: SupabaseClient,
    id: string,
    input: StatusReportUpdate
  ): Promise<ProjectStatusReport> {
    const { data, error } = await supabase
      .from('project_status_reports')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectStatusReport;
  }

  static async deleteStatusReport(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('project_status_reports')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
