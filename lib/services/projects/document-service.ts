/**
 * Document & Decision Service
 *
 * CRUD for project-level documents (project_task_attachments scoped to
 * project_id) and decision log entries (project_activity_feed rows with
 * entity_type='decision').
 *
 * Pattern: static class, SupabaseClient as first arg (matches RiskService /
 * ProjectService). Errors are thrown, not swallowed.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F7.
 *
 * DEFERRED: Supabase Storage file upload is not wired. storage_path must be
 * supplied by the caller (e.g. a placeholder or future upload helper).
 * uploaded_by / actor_id are now resolved from the session via getCurrentActorId.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectTaskAttachment, ProjectActivityFeedEntry } from '@/types/projects';
import { getCurrentActorId } from '@/lib/services/projects/_actor';

// ─── Insert / Filter shapes ───────────────────────────────────────────────────

export interface AttachmentInsert {
  project_id: string;
  task_id?: string | null;
  file_name: string;
  /** Caller-supplied path. Storage upload is deferred — see PR notes. */
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  version?: number;
  supersedes_id?: string | null;
  is_final_report?: boolean;
  /** null when no auth helper is wired (deferred). */
  uploaded_by?: string | null;
}

export interface AttachmentFilters {
  projectId?: string | null;
  taskId?: string | null;
  isFinalReport?: boolean | null;
}

export interface DecisionEntryInsert {
  project_id: string;
  event_type: string;
  summary?: string | null;
  detail?: Record<string, unknown>;
  /** null when no auth helper is wired (deferred). */
  actor_id?: string | null;
}

export interface DecisionFilters {
  projectId?: string | null;
}

// ─── DocumentService ──────────────────────────────────────────────────────────

export class DocumentService {
  // ── Attachments ────────────────────────────────────────────────────────────

  static async listAttachments(
    supabase: SupabaseClient,
    filters: AttachmentFilters = {}
  ): Promise<ProjectTaskAttachment[]> {
    let query = supabase
      .from('project_task_attachments')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.taskId) {
      query = query.eq('task_id', filters.taskId);
    }
    if (filters.isFinalReport !== undefined && filters.isFinalReport !== null) {
      query = query.eq('is_final_report', filters.isFinalReport);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectTaskAttachment[];
  }

  static async getAttachment(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectTaskAttachment | null> {
    const { data, error } = await supabase
      .from('project_task_attachments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectTaskAttachment | null;
  }

  /**
   * Insert an attachment metadata row.
   * Omits audit cols that are DB-defaulted (created_at, id).
   * storage_path must be provided; file upload to bucket is deferred.
   * uploaded_by is resolved from the session; caller-supplied value takes precedence.
   */
  static async createAttachment(
    supabase: SupabaseClient,
    input: AttachmentInsert
  ): Promise<ProjectTaskAttachment> {
    // uploaded_by → project_task_attachments.uploaded_by FK → profiles(id); no DB default
    const uploadedBy =
      input.uploaded_by !== undefined
        ? input.uploaded_by
        : await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_task_attachments')
      .insert({
        project_id: input.project_id,
        task_id: input.task_id ?? null,
        file_name: input.file_name,
        storage_path: input.storage_path,
        mime_type: input.mime_type ?? null,
        size_bytes: input.size_bytes ?? null,
        version: input.version ?? 1,
        supersedes_id: input.supersedes_id ?? null,
        is_final_report: input.is_final_report ?? false,
        uploaded_by: uploadedBy,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectTaskAttachment;
  }

  static async deleteAttachment(supabase: SupabaseClient, id: string): Promise<void> {
    const { error } = await supabase
      .from('project_task_attachments')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Build version lineage for a document by following supersedes_id chains.
   * Returns all versions oldest-first (root at index 0, latest at end).
   * Ancestors are found via backward walk; descendants via a forward scan of
   * sibling rows in the same project.
   */
  static async getVersionHistory(
    supabase: SupabaseClient,
    attachmentId: string
  ): Promise<ProjectTaskAttachment[]> {
    const root = await DocumentService.getAttachment(supabase, attachmentId);
    if (!root) return [];

    const chain: ProjectTaskAttachment[] = [root];

    // Walk backwards — find all ancestors via supersedes_id.
    let cursor = root;
    while (cursor.supersedes_id) {
      const parent = await DocumentService.getAttachment(supabase, cursor.supersedes_id);
      if (!parent) break;
      chain.unshift(parent);
      cursor = parent;
    }

    // Walk forwards — find descendants by scanning project docs for supersedes_id refs.
    if (root.project_id) {
      const { data: siblings } = await supabase
        .from('project_task_attachments')
        .select('*')
        .eq('project_id', root.project_id)
        .not('supersedes_id', 'is', null);

      const childMap = new Map<string, ProjectTaskAttachment>();
      for (const s of (siblings ?? []) as ProjectTaskAttachment[]) {
        if (s.supersedes_id) childMap.set(s.supersedes_id, s);
      }

      let tip = chain[chain.length - 1];
      while (childMap.has(tip.id)) {
        const child = childMap.get(tip.id)!;
        if (chain.some((c) => c.id === child.id)) break; // cycle guard
        chain.push(child);
        tip = child;
      }
    }

    return chain;
  }

  // ── Decision Log ───────────────────────────────────────────────────────────

  static async listDecisions(
    supabase: SupabaseClient,
    filters: DecisionFilters = {}
  ): Promise<ProjectActivityFeedEntry[]> {
    let query = supabase
      .from('project_activity_feed')
      .select('*')
      .eq('entity_type', 'decision')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectActivityFeedEntry[];
  }

  /**
   * Append a decision entry to project_activity_feed.
   * actor_id is resolved from the session; caller-supplied value takes precedence.
   */
  static async addDecision(
    supabase: SupabaseClient,
    input: DecisionEntryInsert
  ): Promise<ProjectActivityFeedEntry> {
    // actor_id → project_activity_feed.actor_id FK → profiles(id); no DB default
    const actorId =
      input.actor_id !== undefined
        ? input.actor_id
        : await getCurrentActorId(supabase);

    const { data, error } = await supabase
      .from('project_activity_feed')
      .insert({
        project_id: input.project_id,
        entity_type: 'decision',
        entity_id: null,
        event_type: input.event_type,
        actor_id: actorId,
        summary: input.summary ?? null,
        detail: input.detail ?? {},
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectActivityFeedEntry;
  }
}
