/**
 * Policy Audit Service — Wave 3 B4
 * ==========================================================================
 * Focused service for:
 *   - Reading the hr_policy_audit_log (paginated, filterable)
 *   - Publish flow (draft_value → value, sets published_at/published_by)
 *   - Unpublish flow (revert to draft_pending, log 'unpublish')
 *
 * Delegates to the existing wave3-policy-editor-service for draft saves and
 * classification changes. This service ONLY handles the audit-read and
 * publish/unpublish lifecycle that the B4 batch adds.
 *
 * All mutations require a non-empty reason string (enforced at DB layer too).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRPolicyAuditLogEntry,
  PolicyAuditFilters,
  PolicyPublicationInfo,
} from '@/types/hr-policy-audit';

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireReason(reason: string): void {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error(
      'Policy mutations require a non-empty reason for the audit trail.'
    );
  }
}

// ---------------------------------------------------------------------------
// Read — audit log
// ---------------------------------------------------------------------------

export class PolicyAuditService {
  /**
   * Paginated, filterable audit log. Returns entries enriched with editor name.
   * RLS on hr_policy_audit_log handles visibility scoping.
   */
  static async getAuditLog(
    supabase: SupabaseClient,
    filters: PolicyAuditFilters = {}
  ): Promise<{ entries: HRPolicyAuditLogEntry[]; total: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.page_size ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('hr_policy_audit_log')
      .select(
        'id, policy_id, policy_key, scope_type, scope_id, action, ' +
          'old_value, new_value, reason, edited_by, edited_at',
        { count: 'exact' }
      )
      .order('edited_at', { ascending: false })
      .range(from, to);

    if (filters.policy_key) q = q.eq('policy_key', filters.policy_key);
    if (filters.change_type) q = q.eq('action', filters.change_type);
    if (filters.edited_by) q = q.eq('edited_by', filters.edited_by);
    if (filters.institution_id) q = q.eq('scope_id', filters.institution_id);
    if (filters.from_date) q = q.gte('edited_at', filters.from_date);
    if (filters.to_date) q = q.lte('edited_at', filters.to_date);

    const { data: rawRows, count, error } = await q;
    if (error) throw error;

    // Join profiles for editor display names.
    const editorIds = Array.from(
      new Set((rawRows ?? []).map((r: any) => r.edited_by).filter(Boolean))
    );
    const editorMap = new Map<string, { name: string | null; email: string | null }>();
    if (editorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', editorIds);
      for (const p of profiles ?? []) {
        editorMap.set(p.id, {
          name: (p as any).full_name ?? null,
          email: (p as any).email ?? null,
        });
      }
    }

    const entries: HRPolicyAuditLogEntry[] = (rawRows ?? []).map((r: any) => ({
      id: r.id,
      policy_id: r.policy_id,
      policy_key: r.policy_key,
      scope_type: r.scope_type,
      scope_id: r.scope_id,
      action: r.action,
      old_value: r.old_value,
      new_value: r.new_value,
      reason: r.reason,
      edited_by: r.edited_by,
      edited_at: r.edited_at,
      editor_name: editorMap.get(r.edited_by)?.name ?? null,
      editor_email: editorMap.get(r.edited_by)?.email ?? null,
    }));

    return { entries, total: count ?? 0 };
  }

  // -------------------------------------------------------------------------
  // Publish — copies draft_value → value, sets published_at/published_by
  // -------------------------------------------------------------------------

  static async publishPolicy(
    supabase: SupabaseClient,
    args: {
      policy_key: string;
      scope_type: string;
      scope_id: string | null;
      user_id: string;
      reason: string;
    }
  ): Promise<PolicyPublicationInfo> {
    requireReason(args.reason);

    // Fetch current row.
    const existing = await this.getPolicyRow(supabase, args.policy_key, args.scope_type, args.scope_id);
    if (!existing) {
      throw new Error(`publishPolicy: policy ${args.policy_key} not found at scope ${args.scope_type}/${args.scope_id}`);
    }
    if (existing.draft_value === null && existing.publication_state === 'published') {
      throw new Error(`publishPolicy: policy ${args.policy_key} is already published with no pending draft.`);
    }

    const now = new Date().toISOString();
    const newValue = existing.draft_value ?? existing.value;

    const { data, error } = await supabase
      .from('platform_policies')
      .update({
        value: newValue as any,
        draft_value: null,
        publication_state: 'published',
        published_at: now,
        published_by: args.user_id,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(
        'id, policy_key, publication_state, classification, draft_value, ' +
          'value, published_at, published_by, updated_at'
      )
      .single();

    if (error) throw error;

    // Log audit entry.
    await this.insertAudit(supabase, {
      policy_id: existing.id,
      policy_key: existing.policy_key,
      scope_type: existing.scope_type,
      scope_id: existing.scope_id,
      action: 'publish',
      old_value: existing.value,
      new_value: newValue,
      reason: args.reason,
      edited_by: args.user_id,
    });

    return data as unknown as PolicyPublicationInfo;
  }

  // -------------------------------------------------------------------------
  // Unpublish — reverts to draft_pending, logs 'unpublish'
  // -------------------------------------------------------------------------

  static async unpublishPolicy(
    supabase: SupabaseClient,
    args: {
      policy_key: string;
      scope_type: string;
      scope_id: string | null;
      user_id: string;
      reason: string;
    }
  ): Promise<PolicyPublicationInfo> {
    requireReason(args.reason);

    const existing = await this.getPolicyRow(supabase, args.policy_key, args.scope_type, args.scope_id);
    if (!existing) {
      throw new Error(`unpublishPolicy: policy ${args.policy_key} not found.`);
    }
    if (existing.publication_state !== 'published') {
      throw new Error(`unpublishPolicy: policy ${args.policy_key} is not currently published (state: ${existing.publication_state}).`);
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('platform_policies')
      .update({
        draft_value: existing.value as any,
        publication_state: 'draft_pending',
        published_at: null,
        published_by: null,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(
        'id, policy_key, publication_state, classification, draft_value, ' +
          'value, published_at, published_by, updated_at'
      )
      .single();

    if (error) throw error;

    await this.insertAudit(supabase, {
      policy_id: existing.id,
      policy_key: existing.policy_key,
      scope_type: existing.scope_type,
      scope_id: existing.scope_id,
      action: 'unpublish',
      old_value: existing.value,
      new_value: null,
      reason: args.reason,
      edited_by: args.user_id,
    });

    return data as unknown as PolicyPublicationInfo;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private static async getPolicyRow(
    supabase: SupabaseClient,
    key: string,
    scopeType: string,
    scopeId: string | null
  ) {
    let q = supabase
      .from('platform_policies')
      .select(
        'id, policy_key, scope_type, scope_id, value, draft_value, ' +
          'classification, publication_state, published_at, published_by, ' +
          'description, updated_at'
      )
      .eq('policy_key', key)
      .eq('scope_type', scopeType);

    q = scopeId === null ? q.is('scope_id', null) : q.eq('scope_id', scopeId);

    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return data as unknown as (PolicyPublicationInfo & { scope_type: string; scope_id: string | null; description: string | null }) | null;
  }

  private static async insertAudit(
    supabase: SupabaseClient,
    args: {
      policy_id: string;
      policy_key: string;
      scope_type: string;
      scope_id: string | null;
      action: string;
      old_value: unknown | null;
      new_value: unknown | null;
      reason: string;
      edited_by: string;
    }
  ): Promise<void> {
    const { error } = await supabase.from('hr_policy_audit_log').insert({
      policy_id: args.policy_id,
      policy_key: args.policy_key,
      scope_type: args.scope_type,
      scope_id: args.scope_id,
      action: args.action,
      old_value: (args.old_value ?? null) as any,
      new_value: (args.new_value ?? null) as any,
      reason: args.reason.trim(),
      edited_by: args.edited_by,
    });
    if (error) throw error;
  }
}
