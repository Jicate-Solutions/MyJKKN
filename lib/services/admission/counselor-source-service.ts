// lib/services/admission/counselor-source-service.ts
//
// Manages the admission_counselor_sources junction:
//   counselor ↔ source mappings, with date-window, daily cap,
//   priority weight, and pause flag.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface CounselorSourceAssignment {
  id: string;
  counselor_id: string;
  source_id: string;
  priority_weight: number;
  max_leads_per_day: number | null;
  effective_from: string | null;
  effective_to: string | null;
  is_paused: boolean;
  created_at: string;
  created_by: string | null;
  // Joined counselor info (from admission_counselors)
  counselor?: {
    id: string;
    user_id: string | null;
    name: string;
    email: string;
    designation: string | null;
    is_active: boolean | null;
    current_leads: number | null;
    max_leads: number | null;
    institution_id: string;
  } | null;
  // Computed
  role_key?: string | null;
}

export interface AttachOptions {
  priority_weight?: number;
  max_leads_per_day?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  is_paused?: boolean;
}

export class CounselorSourceService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * List counselor assignments for a source with joined counselor info + role_key.
   */
  static async listForSource(sourceId: string): Promise<CounselorSourceAssignment[]> {
    const supabase = this.supabase;
    const { data, error } = await (supabase as any)
      .from('admission_counselor_sources')
      .select(
        `
        id, counselor_id, source_id,
        priority_weight, max_leads_per_day,
        effective_from, effective_to, is_paused,
        created_at, created_by,
        counselor:admission_counselors!counselor_id (
          id, user_id, name, email, designation, is_active,
          current_leads, max_leads, institution_id
        )
      `
      )
      .eq('source_id', sourceId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('admissions', 'Error listing counselor-source assignments', error);
      throw error;
    }

    const rows = (data ?? []) as CounselorSourceAssignment[];
    if (rows.length === 0) return [];

    // Resolve role_key per counselor (one query, in-memory map)
    const userIds = Array.from(
      new Set(
        rows.map((r) => r.counselor?.user_id).filter((u): u is string => !!u)
      )
    );

    const roleMap = await this.getRolesByUserIds(userIds);
    return rows.map((r) => ({
      ...r,
      role_key: r.counselor?.user_id
        ? (roleMap.get(r.counselor.user_id) ?? null)
        : null,
    }));
  }

  /**
   * Bulk attach: create a junction row per counselor with the given options.
   * Idempotent — skips counselors that are already attached.
   */
  static async bulkAttach(
    sourceId: string,
    counselorIds: string[],
    options: AttachOptions = {}
  ): Promise<{ created: number; skipped: number }> {
    if (counselorIds.length === 0) return { created: 0, skipped: 0 };

    const supabase = this.supabase;

    const { data: existing } = await (supabase as any)
      .from('admission_counselor_sources')
      .select('counselor_id')
      .eq('source_id', sourceId)
      .in('counselor_id', counselorIds);

    const alreadyMapped = new Set(
      (existing ?? []).map((r: { counselor_id: string }) => r.counselor_id)
    );
    const newOnes = counselorIds.filter((id) => !alreadyMapped.has(id));
    if (newOnes.length === 0)
      return { created: 0, skipped: counselorIds.length };

    const payload = newOnes.map((counselor_id) => ({
      counselor_id,
      source_id: sourceId,
      priority_weight: options.priority_weight ?? 1.0,
      max_leads_per_day: options.max_leads_per_day ?? null,
      effective_from: options.effective_from ?? null,
      effective_to: options.effective_to ?? null,
      is_paused: options.is_paused ?? false,
    }));

    const { error } = await (supabase as any)
      .from('admission_counselor_sources')
      .insert(payload);

    if (error) {
      logger.error('admissions', 'Error bulk-attaching counselors to source', error);
      throw error;
    }

    return { created: newOnes.length, skipped: alreadyMapped.size };
  }

  static async update(
    assignmentId: string,
    patch: AttachOptions
  ): Promise<CounselorSourceAssignment> {
    const { data, error } = await (this.supabase as any)
      .from('admission_counselor_sources')
      .update({
        ...(patch.priority_weight !== undefined && {
          priority_weight: patch.priority_weight,
        }),
        ...(patch.max_leads_per_day !== undefined && {
          max_leads_per_day: patch.max_leads_per_day,
        }),
        ...(patch.effective_from !== undefined && {
          effective_from: patch.effective_from,
        }),
        ...(patch.effective_to !== undefined && {
          effective_to: patch.effective_to,
        }),
        ...(patch.is_paused !== undefined && { is_paused: patch.is_paused }),
      })
      .eq('id', assignmentId)
      .select('*')
      .single();

    if (error) {
      logger.error('admissions', 'Error updating counselor-source assignment', error);
      throw error;
    }
    return data as CounselorSourceAssignment;
  }

  static async detach(assignmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('admission_counselor_sources')
      .delete()
      .eq('id', assignmentId);
    if (error) {
      logger.error('admissions', 'Error detaching counselor from source', error);
      throw error;
    }
  }

  static async setPaused(assignmentId: string, paused: boolean): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('admission_counselor_sources')
      .update({ is_paused: paused })
      .eq('id', assignmentId);
    if (error) {
      logger.error('admissions', 'Error toggling pause flag', error);
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  private static async getRolesByUserIds(
    userIds: string[]
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (userIds.length === 0) return out;
    const { data, error } = await (this.supabase as any)
      .from('user_roles')
      .select(
        `
        user_id,
        role:custom_roles!role_id ( role_key )
      `
      )
      .in('user_id', userIds);
    if (error) {
      logger.error('admissions', 'Error resolving roles for counselors', error);
      return out;
    }
    const COUNSELOR_KEYS = new Set([
      'admission_counselor',
      'expo_counselor',
      'learner_counselor',
      'staff_counselor',
    ]);
    for (const row of (data ?? []) as {
      user_id: string;
      role: { role_key: string } | null;
    }[]) {
      const k = row.role?.role_key;
      if (!k) continue;
      // Prefer counselor role keys over generic ones
      if (COUNSELOR_KEYS.has(k) || !out.has(row.user_id)) {
        out.set(row.user_id, k);
      }
    }
    return out;
  }
}
