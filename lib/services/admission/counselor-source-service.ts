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

  /**
   * List counselors who currently hold at least one lead from the given
   * source. Distinct from listForSource (which lists FORMAL mappings via
   * admission_counselor_sources). Useful for the source detail page's
   * "Other counselors holding leads" section — captures counselors who got
   * assigned via individual-lead actions but aren't yet formally mapped.
   */
  static async listCounselorsHoldingLeads(
    sourceEnum: string,
    institutionId?: string | null
  ): Promise<
    Array<{
      counselor_id: string;
      user_id: string | null;
      name: string;
      email: string | null;
      designation: string | null;
      is_active: boolean | null;
      current_leads: number | null;
      max_leads: number | null;
      source_lead_count: number;
      is_mapped: boolean;
    }>
  > {
    const supabase = this.supabase;
    const { data, error } = await (supabase as any).rpc('get_counselors_holding_source_leads', {
      p_source: sourceEnum,
      p_institution_id: institutionId ?? null,
    });
    if (error) {
      logger.error('admissions', 'Error listing counselors holding source leads', error);
      throw error;
    }
    return (data ?? []).map((row: any) => ({
      counselor_id: row.counselor_id,
      user_id: row.user_id ?? null,
      name: row.name,
      email: row.email ?? null,
      designation: row.designation ?? null,
      is_active: row.is_active ?? null,
      current_leads: row.current_leads ?? null,
      max_leads: row.max_leads ?? null,
      source_lead_count: Number(row.source_lead_count) || 0,
      is_mapped: !!row.is_mapped,
    }));
  }

  /**
   * Bulk-move all leads from one counselor to another for a given source +
   * institution. Wraps the SECURITY DEFINER RPC; the RPC handles the
   * permission door check and the atomic UPDATE.
   */
  static async reassignLeadsBetweenCounselors(input: {
    sourceEnum: string;
    fromCounselorId: string;
    toCounselorId: string;
    institutionId?: string | null;
    reason?: string;
  }): Promise<{ reassigned: number; toUserId: string | null }> {
    const supabase = this.supabase;
    const { data, error } = await (supabase as any).rpc(
      'reassign_source_leads_between_counselors',
      {
        p_source: input.sourceEnum,
        p_from_counselor_id: input.fromCounselorId,
        p_to_counselor_id: input.toCounselorId,
        p_institution_id: input.institutionId ?? null,
        p_reason: input.reason ?? null,
      }
    );
    if (error) {
      logger.error('admissions', 'Error reassigning leads between counselors', error);
      throw error;
    }
    const row = (data ?? [])[0];
    return {
      reassigned: Number(row?.reassigned_count) || 0,
      toUserId: row?.to_user_id ?? null,
    };
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
    // SECURITY DEFINER RPC bypasses RLS on user_roles/custom_roles. The prior
    // client-side join silently returned empty rows for admission-office
    // pickers (they can read their own role memberships, not other users'),
    // leaving the Role column blank in the counselors-tab table. Same fix
    // pattern as use-eligible-counselors; introduced in migration
    // 20260509170000_admission_counselor_role_lookup_helper.sql.
    const { data, error } = await (this.supabase as any).rpc(
      'get_counselor_role_keys_for_users',
      { p_user_ids: userIds }
    );
    if (error) {
      logger.error('admissions', 'Error resolving roles for counselors', error);
      return out;
    }
    for (const row of (data ?? []) as {
      user_id: string;
      role_key: string;
      role_name: string;
    }[]) {
      if (row.user_id && row.role_key) out.set(row.user_id, row.role_key);
    }
    return out;
  }
}
