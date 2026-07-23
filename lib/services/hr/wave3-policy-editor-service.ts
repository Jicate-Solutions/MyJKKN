/**
 * Wave 3 HR Policy Editor Service
 * ============================================================================
 *
 * Read/write helpers for the Wave 3 policy-driven HR Manual replacement
 * (substrate locked 2026-05-15, project_wave3_hr_policy_lock_2026_05_15).
 *
 * IMPORTANT: this service operates on `platform_policies` rows (Wave 3
 * substrate). It is DISTINCT from the legacy `lib/services/hr/policy-service.ts`,
 * which serves the 19 legacy `hr_*` policy tables. Wave 3 consolidates onto
 * platform_policies; the legacy service stays in place during transition.
 *
 * Every mutation REQUIRES a non-empty `reason` string and inserts a row into
 * `hr_policy_audit_log`. The DB also enforces the mandatory-reason CHECK,
 * but client-side throws give a faster error path.
 *
 * Functions:
 *   - getPolicyValue(key, scopeId?)   — current value (via fn_get_policy_json)
 *   - getPolicyRow(key, scopeType, scopeId?) — full row incl. draft/classification
 *   - saveDraft(args)                 — writes draft_value, sets draft_pending
 *   - publishDraft(args)              — copies draft → value, clears draft
 *   - setClassification(args)         — Director-only operational/major flip
 *   - listAuditLog(filters?)          — read-only audit history
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PolicyClassification = 'operational' | 'major';
export type PolicyPublicationState = 'draft_only' | 'published' | 'draft_pending';
export type PolicyScopeType = 'global' | 'institution' | 'role' | 'user';
export type PolicyAuditAction =
  | 'edit_draft'
  | 'publish'
  | 'classify_change'
  | 'promote_to_global';

export interface PolicyRow {
  id: string;
  policy_key: string;
  scope_type: PolicyScopeType;
  scope_id: string | null;
  value: unknown;
  draft_value: unknown | null;
  classification: PolicyClassification;
  publication_state: PolicyPublicationState;
  description: string | null;
  updated_at: string | null;
}

export interface PolicyAuditRow {
  id: string;
  policy_id: string;
  policy_key: string;
  scope_type: PolicyScopeType;
  scope_id: string | null;
  action: PolicyAuditAction;
  old_value: unknown | null;
  new_value: unknown | null;
  reason: string;
  edited_by: string;
  edited_at: string;
}

export interface AuditLogFilters {
  policyKey?: string;
  editedBy?: string;
  fromDate?: string;  // ISO timestamp
  toDate?: string;    // ISO timestamp
  limit?: number;     // default 100
}

interface MutationArgs {
  key: string;
  scopeType: PolicyScopeType;
  scopeId: string | null;
  reason: string;
}

interface SaveDraftArgs extends MutationArgs {
  newDraftValue: unknown;
}

interface SetClassificationArgs extends MutationArgs {
  newClassification: PolicyClassification;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function requireReason(reason: string): void {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error(
      'Wave 3 policy mutations require a non-empty reason. Provide a sentence ' +
        'explaining WHY this change is being made — it appears in the audit log.'
    );
  }
}

function buildScopeFilter(query: any, scopeType: PolicyScopeType, scopeId: string | null) {
  // The platform_policies uniqueness is (policy_key, scope_type, scope_id),
  // with NULL scope_id treated as a sentinel for global rows. Mirror that here.
  const q = query.eq('scope_type', scopeType);
  return scopeId === null ? q.is('scope_id', null) : q.eq('scope_id', scopeId);
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the current published value for a policy via the DB resolver.
 * Use this from app code that needs the live value (not the draft).
 */
export async function getPolicyValue<T = unknown>(
  supabase: SupabaseClient,
  key: string,
  scopeId?: string | null,
  fallback: T | null = null
): Promise<T | null> {
  const { data, error } = await supabase.rpc('fn_get_policy_json', {
    p_key: key,
    p_default: (fallback ?? null) as any,
    p_scope_id: scopeId ?? null,
  });
  if (error) throw error;
  return (data ?? fallback ?? null) as T | null;
}

/**
 * Fetch the full policy row including draft state + classification.
 * Returns null if no row exists at the given scope.
 */
export async function getPolicyRow(
  supabase: SupabaseClient,
  key: string,
  scopeType: PolicyScopeType,
  scopeId: string | null = null
): Promise<PolicyRow | null> {
  const base = supabase
    .from('platform_policies')
    .select(
      'id, policy_key, scope_type, scope_id, value, draft_value, ' +
        'classification, publication_state, description, updated_at'
    )
    .eq('policy_key', key);

  const { data, error } = await buildScopeFilter(base, scopeType, scopeId)
    .maybeSingle();

  if (error) throw error;
  return (data as PolicyRow) ?? null;
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/**
 * Save an unpublished edit. Writes draft_value, sets publication_state to
 * 'draft_pending', logs an 'edit_draft' audit row with the mandatory reason.
 */
export async function saveDraft(
  supabase: SupabaseClient,
  args: SaveDraftArgs
): Promise<PolicyRow> {
  requireReason(args.reason);

  const existing = await getPolicyRow(supabase, args.key, args.scopeType, args.scopeId);
  if (!existing) {
    throw new Error(
      `saveDraft: policy ${args.key} (scope=${args.scopeType}, id=${args.scopeId}) ` +
        'has no platform_policies row yet. Seed it before drafting edits.'
    );
  }

  const update = supabase
    .from('platform_policies')
    .update({
      draft_value: args.newDraftValue as any,
      publication_state: 'draft_pending' as PolicyPublicationState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(
      'id, policy_key, scope_type, scope_id, value, draft_value, ' +
        'classification, publication_state, description, updated_at'
    )
    .single();

  const { data, error } = await update;
  if (error) throw error;

  await insertAudit(supabase, {
    policy_id: existing.id,
    policy_key: existing.policy_key,
    scope_type: existing.scope_type,
    scope_id: existing.scope_id,
    action: 'edit_draft',
    old_value: existing.draft_value ?? existing.value,
    new_value: args.newDraftValue,
    reason: args.reason,
  });

  return data as PolicyRow;
}

/**
 * Publish a pending draft. Copies draft_value → value, sets
 * publication_state to 'published', clears draft_value, logs 'publish'.
 */
export async function publishDraft(
  supabase: SupabaseClient,
  args: MutationArgs
): Promise<PolicyRow> {
  requireReason(args.reason);

  const existing = await getPolicyRow(supabase, args.key, args.scopeType, args.scopeId);
  if (!existing) {
    throw new Error(
      `publishDraft: policy ${args.key} (scope=${args.scopeType}, id=${args.scopeId}) not found.`
    );
  }
  if (existing.draft_value === null) {
    throw new Error(
      `publishDraft: policy ${args.key} has no draft to publish (draft_value is NULL).`
    );
  }

  const update = supabase
    .from('platform_policies')
    .update({
      value: existing.draft_value as any,
      draft_value: null,
      publication_state: 'published' as PolicyPublicationState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(
      'id, policy_key, scope_type, scope_id, value, draft_value, ' +
        'classification, publication_state, description, updated_at'
    )
    .single();

  const { data, error } = await update;
  if (error) throw error;

  await insertAudit(supabase, {
    policy_id: existing.id,
    policy_key: existing.policy_key,
    scope_type: existing.scope_type,
    scope_id: existing.scope_id,
    action: 'publish',
    old_value: existing.value,
    new_value: existing.draft_value,
    reason: args.reason,
  });

  return data as PolicyRow;
}

/**
 * Flip a policy's classification (operational ⇄ major).
 * Director-only at the RLS layer; this helper assumes the caller is allowed.
 */
export async function setClassification(
  supabase: SupabaseClient,
  args: SetClassificationArgs
): Promise<PolicyRow> {
  requireReason(args.reason);

  const existing = await getPolicyRow(supabase, args.key, args.scopeType, args.scopeId);
  if (!existing) {
    throw new Error(
      `setClassification: policy ${args.key} (scope=${args.scopeType}, id=${args.scopeId}) not found.`
    );
  }
  if (existing.classification === args.newClassification) {
    return existing;
  }

  const update = supabase
    .from('platform_policies')
    .update({
      classification: args.newClassification,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select(
      'id, policy_key, scope_type, scope_id, value, draft_value, ' +
        'classification, publication_state, description, updated_at'
    )
    .single();

  const { data, error } = await update;
  if (error) throw error;

  await insertAudit(supabase, {
    policy_id: existing.id,
    policy_key: existing.policy_key,
    scope_type: existing.scope_type,
    scope_id: existing.scope_id,
    action: 'classify_change',
    old_value: { classification: existing.classification },
    new_value: { classification: args.newClassification },
    reason: args.reason,
  });

  return data as PolicyRow;
}

// ---------------------------------------------------------------------------
// Audit log reader
// ---------------------------------------------------------------------------

export async function listAuditLog(
  supabase: SupabaseClient,
  filters: AuditLogFilters = {}
): Promise<PolicyAuditRow[]> {
  let q = supabase
    .from('hr_policy_audit_log')
    .select(
      'id, policy_id, policy_key, scope_type, scope_id, action, ' +
        'old_value, new_value, reason, edited_by, edited_at'
    )
    .order('edited_at', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.policyKey) q = q.eq('policy_key', filters.policyKey);
  if (filters.editedBy) q = q.eq('edited_by', filters.editedBy);
  if (filters.fromDate) q = q.gte('edited_at', filters.fromDate);
  if (filters.toDate) q = q.lte('edited_at', filters.toDate);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PolicyAuditRow[];
}

// ---------------------------------------------------------------------------
// Internal — insert audit row (every mutation calls this)
// ---------------------------------------------------------------------------

interface AuditInsertArgs {
  policy_id: string;
  policy_key: string;
  scope_type: PolicyScopeType;
  scope_id: string | null;
  action: PolicyAuditAction;
  old_value: unknown | null;
  new_value: unknown | null;
  reason: string;
}

async function insertAudit(
  supabase: SupabaseClient,
  args: AuditInsertArgs
): Promise<void> {
  // edited_by is omitted; we trust the DB layer to use auth.uid() via
  // a default-binding pattern OR we accept that callers using service_role
  // will pass it explicitly through RPC. For client-driven inserts the
  // RLS policy already restricts INSERT to super_admin.
  const { data: who } = await supabase.auth.getUser();
  const editedBy = who?.user?.id;
  if (!editedBy) {
    throw new Error(
      'Wave 3 policy mutation requires an authenticated user (audit log edited_by NOT NULL).'
    );
  }

  const { error } = await supabase.from('hr_policy_audit_log').insert({
    policy_id: args.policy_id,
    policy_key: args.policy_key,
    scope_type: args.scope_type,
    scope_id: args.scope_id,
    action: args.action,
    old_value: (args.old_value ?? null) as any,
    new_value: (args.new_value ?? null) as any,
    reason: args.reason.trim(),
    edited_by: editedBy,
  });
  if (error) throw error;
}
