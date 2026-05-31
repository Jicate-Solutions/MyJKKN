/**
 * Change Management Service
 *
 * CRUD + decision (approve/reject) for project change requests.
 * Table: project_change_requests
 *   (change_type, title, description, impact_summary, is_major, status,
 *    requested_by, decided_by, decided_at)
 *
 * Pattern: static class, SupabaseClient as first arg.
 * Errors are thrown, not swallowed.
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

export interface ChangeRequestInsert {
  project_id: string;
  change_type: string;
  title: string;
  description?: string | null;
  impact_summary?: string | null;
  is_major?: boolean;
  status?: string;
  /** Null — no auth helper available in this service layer. */
  requested_by?: string | null;
}

export interface ChangeRequestDecision {
  status: 'approved' | 'rejected';
  /** Null — no auth helper available; caller may supply if available. */
  decided_by?: string | null;
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

  // ─── Create ──────────────────────────────────────────────────────────────────

  static async createChangeRequest(
    supabase: SupabaseClient,
    input: ChangeRequestInsert
  ): Promise<ProjectChangeRequest> {
    const { data, error } = await supabase
      .from('project_change_requests')
      .insert({
        project_id: input.project_id,
        change_type: input.change_type,
        title: input.title,
        description: input.description ?? null,
        impact_summary: input.impact_summary ?? null,
        is_major: input.is_major ?? false,
        status: input.status ?? 'pending',
        requested_by: input.requested_by ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectChangeRequest;
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  static async updateChangeRequest(
    supabase: SupabaseClient,
    id: string,
    input: Partial<ChangeRequestInsert>
  ): Promise<ProjectChangeRequest> {
    const { data, error } = await supabase
      .from('project_change_requests')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectChangeRequest;
  }

  // ─── Decide (approve / reject) ───────────────────────────────────────────────

  /**
   * Approve or reject a change request. Stamps decided_at and optionally
   * decided_by (caller passes null when no auth helper is available).
   */
  static async decideChangeRequest(
    supabase: SupabaseClient,
    id: string,
    decision: ChangeRequestDecision
  ): Promise<ProjectChangeRequest> {
    const { data, error } = await supabase
      .from('project_change_requests')
      .update({
        status: decision.status,
        decided_by: decision.decided_by ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as ProjectChangeRequest;
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  static async deleteChangeRequest(
    supabase: SupabaseClient,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from('project_change_requests')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
