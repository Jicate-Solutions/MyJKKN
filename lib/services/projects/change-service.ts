/**
 * Change Management Service
 *
 * List/get read the base table directly (RLS: project members + admins).
 * Every MUTATION goes through a SECURITY DEFINER RPC that enforces the agreed
 * authorization rules server-side and fans out notifications:
 *   • fn_create_change_request  — raise (project member / admin)
 *   • fn_update_change_request  — edit (requester, while submitted)
 *   • fn_decide_change_request  — approve/reject (minor→owner|admin, major→admin)
 *   • fn_delete_change_request  — cancel (requester, while submitted)
 *   • fn_change_request_context — which buttons the current user may see
 * See supabase/migrations/20260725000000_project_change_requests_rpcs.sql.
 *
 * Pattern: static class, SupabaseClient as first arg. Errors are thrown.
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectChangeRequest } from '@/types/projects';

export interface ChangeRequestFilters {
  projectId?: string | null;
  status?: string | null;
  isMajor?: boolean | null;
  changeType?: string | null;
}

/** Fields the requester supplies when raising a change. Attribution, status and
 *  authorization are all resolved server-side by fn_create_change_request. */
export interface ChangeRequestInsert {
  project_id: string;
  change_type: string;
  title: string;
  description?: string | null;
  impact_summary?: string | null;
  is_major?: boolean;
}

/** Editable fields (requester only, while still submitted). change_type/status/
 *  is_major cannot be changed after creation. */
export interface ChangeRequestUpdate {
  change_type?: string;
  title?: string;
  description?: string | null;
  impact_summary?: string | null;
}

export interface ChangeRequestDecision {
  status: 'approved' | 'rejected';
}

/** Per-viewer, per-project capability flags used to gate the UI. The RPCs are
 *  the real enforcement; this only decides which buttons to render. */
export interface ChangeRequestContext {
  my_profile_id: string | null;
  is_admin: boolean;
  is_owner: boolean;
  is_member: boolean;
}

export class ChangeService {
  // ─── List ────────────────────────────────────────────────────────────────────

  static async listChangeRequests(
    supabase: SupabaseClient,
    filters: ChangeRequestFilters = {}
  ): Promise<ProjectChangeRequest[]> {
    let query = supabase
      .from('project_change_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.isMajor !== undefined && filters.isMajor !== null) {
      query = query.eq('is_major', filters.isMajor);
    }
    if (filters.changeType) {
      query = query.eq('change_type', filters.changeType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as ProjectChangeRequest[];
  }

  // ─── Get ─────────────────────────────────────────────────────────────────────

  static async getChangeRequest(
    supabase: SupabaseClient,
    id: string
  ): Promise<ProjectChangeRequest | null> {
    const { data, error } = await supabase
      .from('project_change_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data as ProjectChangeRequest | null;
  }

  // ─── Context (UI gating) ───────────────────────────────────────────────────────

  static async getContext(
    supabase: SupabaseClient,
    projectId: string
  ): Promise<ChangeRequestContext> {
    const { data, error } = await supabase.rpc('fn_change_request_context', {
      p_project_id: projectId,
    });
    if (error) throw error;
    return data as ChangeRequestContext;
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  static async createChangeRequest(
    supabase: SupabaseClient,
    input: ChangeRequestInsert
  ): Promise<ProjectChangeRequest> {
    const { data, error } = await supabase.rpc('fn_create_change_request', {
      p_project_id: input.project_id,
      p_change_type: input.change_type,
      p_title: input.title,
      p_description: input.description ?? null,
      p_impact_summary: input.impact_summary ?? null,
      p_is_major: input.is_major ?? false,
    });
    if (error) throw error;
    return data as ProjectChangeRequest;
  }

  // ─── Update (edit) ─────────────────────────────────────────────────────────────

  static async updateChangeRequest(
    supabase: SupabaseClient,
    id: string,
    input: ChangeRequestUpdate
  ): Promise<ProjectChangeRequest> {
    const { data, error } = await supabase.rpc('fn_update_change_request', {
      p_id: id,
      p_change_type: input.change_type ?? null,
      p_title: input.title ?? null,
      p_description: input.description ?? null,
      p_impact_summary: input.impact_summary ?? null,
    });
    if (error) throw error;
    return data as ProjectChangeRequest;
  }

  // ─── Decide (approve / reject) ───────────────────────────────────────────────

  static async decideChangeRequest(
    supabase: SupabaseClient,
    id: string,
    decision: ChangeRequestDecision
  ): Promise<ProjectChangeRequest> {
    const { data, error } = await supabase.rpc('fn_decide_change_request', {
      p_id: id,
      p_status: decision.status,
    });
    if (error) throw error;
    return data as ProjectChangeRequest;
  }

  // ─── Delete (cancel) ───────────────────────────────────────────────────────────

  static async deleteChangeRequest(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase.rpc('fn_delete_change_request', { p_id: id });
    if (error) throw error;
  }
}
