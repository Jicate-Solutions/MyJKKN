/**
 * Meeting Service
 *
 * CRUD for project_meeting_links and confirm-to-create flow that promotes a
 * suggested task (from suggested_tasks JSONB) into a real project_task via
 * TaskService.createTask.
 *
 * Actual Fireflies API calls and AI action-item extraction are OUT OF SCOPE
 * for this version — store meeting links + render whatever is in suggested_tasks
 * + the confirm-to-create flow only.
 * TODO(fireflies-integration): fetch transcript from Fireflies API + extract
 *   action items via AI, then populate suggested_tasks.
 *
 * Pattern: static class, SupabaseClient as first arg (matches ProjectService /
 * TaskService / RiskService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F12.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { TaskService } from '@/lib/services/projects/task-service';
import type { ProjectMeetingLink, ProjectTask } from '@/types/projects';

// ─── Insert / Update shapes ───────────────────────────────────────────────────

export interface MeetingLinkInsert {
  project_id: string;
  meeting_source: string;
  external_meeting_id?: string | null;
  meeting_title?: string | null;
  meeting_date?: string | null;
  transcript_url?: string | null;
  /** Array of {title, description?} objects */
  suggested_tasks?: SuggestedTaskItem[];
}

export interface MeetingLinkUpdate {
  meeting_source?: string;
  external_meeting_id?: string | null;
  meeting_title?: string | null;
  meeting_date?: string | null;
  transcript_url?: string | null;
  suggested_tasks?: SuggestedTaskItem[];
  processed_at?: string | null;
}

export interface MeetingFilters {
  projectId?: string | null;
  search?: string | null;
}

/** Shape of each element in project_meeting_links.suggested_tasks JSONB array */
export interface SuggestedTaskItem {
  title: string;
  description?: string | null;
}

export class MeetingService {
  // ─── Queries ────────────────────────────────────────────────────────────────

  static async listMeetings(
    supabase: SupabaseClient,
    filters: MeetingFilters = {}
  ): Promise<ProjectMeetingLink[]> {
    let query = supabase
      .from('project_meeting_links')
      .select('*')
      .order('meeting_date', { ascending: false, nullsFirst: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.search) {
      query = query.ilike('meeting_title', `%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectMeetingLink[];
  }

  static async getMeeting(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectMeetingLink | null> {
    const { data, error } = await supabase
      .from('project_meeting_links')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectMeetingLink | null;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  static async createMeeting(
    supabase: SupabaseClient,
    input: MeetingLinkInsert
  ): Promise<ProjectMeetingLink> {
    const { data, error } = await supabase
      .from('project_meeting_links')
      .insert({
        project_id: input.project_id,
        meeting_source: input.meeting_source,
        external_meeting_id: input.external_meeting_id ?? null,
        meeting_title: input.meeting_title ?? null,
        meeting_date: input.meeting_date ?? null,
        transcript_url: input.transcript_url ?? null,
        suggested_tasks: (input.suggested_tasks ?? []) as unknown as Record<string, unknown>,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectMeetingLink;
  }

  static async updateMeeting(
    supabase: SupabaseClient,
    id: string,
    input: MeetingLinkUpdate
  ): Promise<ProjectMeetingLink> {
    const payload: Record<string, unknown> = { ...input };
    if (input.suggested_tasks !== undefined) {
      payload.suggested_tasks = input.suggested_tasks as unknown as Record<string, unknown>;
    }

    const { data, error } = await supabase
      .from('project_meeting_links')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectMeetingLink;
  }

  static async deleteMeeting(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('project_meeting_links')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ─── Confirm-to-create ───────────────────────────────────────────────────────

  /**
   * Promote a suggested task item into a real project_task via TaskService.
   * The meeting's processed_at is NOT stamped here — processing is incremental
   * (user may confirm 0, 1, or many tasks from a single meeting).
   */
  static async confirmSuggestedTask(
    supabase: SupabaseClient,
    projectId: string,
    suggested: SuggestedTaskItem
  ): Promise<ProjectTask> {
    return TaskService.createTask(supabase, {
      project_id: projectId,
      title: suggested.title.slice(0, 200),
      description: suggested.description ?? null,
    });
  }
}
