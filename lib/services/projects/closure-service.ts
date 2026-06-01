/**
 * Closure Service — project_closure_reports + project_lessons_learned
 *
 * Handles PIR (post-implementation review) report CRUD, the Finalize action
 * (sets is_finalized + finalized_at), and lessons-learned CRUD.  Also exposes
 * a "suggested lessons" query that surfaces existing lessons from OTHER projects
 * sharing the same project_type_id — no LLM involved; simple DB read.
 *
 * finalized_by and created_by are resolved from the session via getCurrentActorId.
 *
 * Pattern: static class, SupabaseClient as first arg — mirrors RiskService /
 * TaskService.  Errors thrown, never swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F15.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectClosureReport, ProjectLessonLearned } from '@/types/projects';
import { getCurrentActorId } from '@/lib/services/projects/_actor';

// ─── Insert / Update shapes ───────────────────────────────────────────────────

export interface ClosureReportInsert {
  project_id: string;
  closure_type: string;
  checklist?: Record<string, unknown>;
  outcome_summary?: string | null;
  impact_summary?: string | null;
}

export interface ClosureReportUpdate {
  closure_type?: string;
  checklist?: Record<string, unknown>;
  outcome_summary?: string | null;
  impact_summary?: string | null;
}

export interface LessonLearnedInsert {
  project_id: string;
  closure_report_id?: string | null;
  project_type_id?: string | null;
  category?: string | null;
  lesson: string;
  tags?: string[] | null;
}

export interface LessonLearnedUpdate {
  category?: string | null;
  lesson?: string;
  tags?: string[] | null;
}

// ─── ClosureService ───────────────────────────────────────────────────────────

export class ClosureService {
  // ── Closure report ──────────────────────────────────────────────────────────

  static async getReport(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectClosureReport | null> {
    const { data, error } = await supabase
      .from('project_closure_reports')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectClosureReport | null;
  }

  static async upsertReport(
    supabase: SupabaseClient,
    input: ClosureReportInsert
  ): Promise<ProjectClosureReport> {
    // Check if one already exists for this project
    const existing = await ClosureService.getReport(supabase, input.project_id);

    if (existing) {
      return ClosureService.updateReport(supabase, existing.id, {
        closure_type: input.closure_type,
        checklist: input.checklist,
        outcome_summary: input.outcome_summary,
        impact_summary: input.impact_summary,
      });
    }

    // created_by → project_closure_reports.created_by FK → profiles(id); no DB default
    const createdBy = await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_closure_reports')
      .insert({
        project_id: input.project_id,
        closure_type: input.closure_type,
        checklist: input.checklist ?? {},
        outcome_summary: input.outcome_summary ?? null,
        impact_summary: input.impact_summary ?? null,
        is_finalized: false,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectClosureReport;
  }

  static async updateReport(
    supabase: SupabaseClient,
    id: string,
    input: ClosureReportUpdate
  ): Promise<ProjectClosureReport> {
    const { data, error } = await supabase
      .from('project_closure_reports')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectClosureReport;
  }

  /**
   * Finalize — stamps is_finalized = true + finalized_at = now().
   * finalized_by is resolved from the session via getCurrentActorId.
   * Caller may pass an explicit value (e.g. admin acting on behalf); null
   * resolves automatically from the authenticated session.
   */
  static async finalizeReport(
    supabase: SupabaseClient,
    id: string,
    finalizedBy: string | null = null
  ): Promise<ProjectClosureReport> {
    // finalized_by → project_closure_reports.finalized_by FK → profiles(id); no DB default
    const resolvedFinalizedBy = finalizedBy ?? await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_closure_reports')
      .update({
        is_finalized: true,
        finalized_at: new Date().toISOString(),
        finalized_by: resolvedFinalizedBy,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectClosureReport;
  }

  // ── Lessons learned ─────────────────────────────────────────────────────────

  static async listLessons(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ProjectLessonLearned[]> {
    const { data, error } = await supabase
      .from('project_lessons_learned')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as ProjectLessonLearned[];
  }

  /**
   * Suggested lessons: lessons from OTHER projects of the same project_type_id.
   * Capped at 20 to keep the suggestions panel light.  Returns [] if
   * projectTypeId is null.
   */
  static async suggestedLessons(
    supabase: SupabaseClient,
    currentProjectId: string,
    projectTypeId: string | null | undefined
  ): Promise<ProjectLessonLearned[]> {
    if (!projectTypeId) return [];

    const { data, error } = await supabase
      .from('project_lessons_learned')
      .select('*')
      .eq('project_type_id', projectTypeId)
      .neq('project_id', currentProjectId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return (data ?? []) as ProjectLessonLearned[];
  }

  static async addLesson(
    supabase: SupabaseClient,
    input: LessonLearnedInsert
  ): Promise<ProjectLessonLearned> {
    const { data, error } = await supabase
      .from('project_lessons_learned')
      .insert({
        project_id: input.project_id,
        closure_report_id: input.closure_report_id ?? null,
        project_type_id: input.project_type_id ?? null,
        category: input.category ?? null,
        lesson: input.lesson,
        tags: input.tags ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectLessonLearned;
  }

  static async updateLesson(
    supabase: SupabaseClient,
    id: string,
    input: LessonLearnedUpdate
  ): Promise<ProjectLessonLearned> {
    const { data, error } = await supabase
      .from('project_lessons_learned')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectLessonLearned;
  }

  static async deleteLesson(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('project_lessons_learned')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
