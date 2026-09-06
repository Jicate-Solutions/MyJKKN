// lib/services/admission/consultant-portal-access-service.ts
// ============================================================================
// Consultant Portal Access Service — config-row substrate (2026-05-13)
//
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every policy decision = config-table row + super_admin UI to write + reader fn.
// Zero deploys, zero PRs, zero developer round-trips for future tweaks.
//
// Anti-pattern this service retires
// ---------------------------------
// Hardcoded role-string allowlists (see
// memory/feedback_strict_counselor_override_list_traps_senior_leadership.md):
// a literal ['super_admin','consultant'] silently traps senior staff whose
// role-mix isn't in the array. Here we read the allowlist from a config
// table that super_admin edits via /admission/consultants/admin/portal-access.
//
// This service backs:
//   1. Engine PR's /consultant-portal middleware gate (canAccessConsultantPortal)
//   2. Engine PR's see-as-user role allowlist (canPreviewAsConsultant)
//   3. Admin CRUD UI at /admission/consultants/admin/portal-access
//
// The actual engine wiring lands in the follow-up PR. This file is the
// substrate consumed by both that engine and the admin UI's data table.
//
// Companion migration: supabase/migrations/20260513150002_create_consultant_portal_access_policy.sql
// Companion admin UI:  app/(routes)/admission/consultants/admin/portal-access/page.tsx
//
// Cache: in-memory 60s TTL per (profileId|rule_type) key for the gate
// checks and per-rule_type for listAccessRules. Director changes access
// rules rarely; per-process cache is fine (eventual consistency on
// rotation across Vercel function instances).
// ============================================================================

import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortalAccessRuleType =
  | 'portal_login_allowed'
  | 'rls_read_own_data'
  | 'preview_as_consultant';

export type PortalAccessPrincipalType = 'role' | 'permission' | 'user';

export interface ConsultantPortalAccessRow {
  id: string;
  rule_type: PortalAccessRuleType;
  principal_type: PortalAccessPrincipalType;
  principal_value: string;
  display_label: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export type PortalAccessMatchVia =
  | 'role'
  | 'permission'
  | 'user'
  | 'consultant_record';

export interface PortalAccessCheckResult {
  allowed: boolean;
  via: PortalAccessMatchVia | null;
  matched_rule_id: string | null;
}

export interface UpsertAccessRuleInput {
  id?: string;
  rule_type: PortalAccessRuleType;
  principal_type: PortalAccessPrincipalType;
  principal_value: string;
  display_label: string;
  is_active?: boolean;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// In-memory cache (60s TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const checkCache: Map<string, CacheEntry<PortalAccessCheckResult>> = new Map();
const listCache: Map<string, CacheEntry<ConsultantPortalAccessRow[]>> =
  new Map();

function checkCacheKey(
  profileId: string,
  ruleType: PortalAccessRuleType,
): string {
  return `${ruleType}::${profileId}`;
}

function getCachedCheck(key: string): PortalAccessCheckResult | null {
  const entry = checkCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    checkCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedCheck(key: string, value: PortalAccessCheckResult): void {
  checkCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCachedList(key: string): ConsultantPortalAccessRow[] | null {
  const entry = listCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    listCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedList(
  key: string,
  value: ConsultantPortalAccessRow[],
): void {
  listCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate the in-memory cache. Called by upsertAccessRule() after a write
 * so the next consumer call sees the new policy immediately (instead of up to
 * 60s of staleness).
 */
export function invalidatePortalAccessCache(
  ruleType?: PortalAccessRuleType,
): void {
  if (!ruleType) {
    checkCache.clear();
    listCache.clear();
    return;
  }
  const prefix = `${ruleType}::`;
  for (const key of Array.from(checkCache.keys())) {
    if (key.startsWith(prefix)) checkCache.delete(key);
  }
  listCache.delete(`list::${ruleType}`);
  listCache.delete('list::all');
}

// ---------------------------------------------------------------------------
// Internal — fetch profile/role/permission/consultant-record info we need to
// evaluate the rule list against. Single Supabase round-trip per gate call.
// ---------------------------------------------------------------------------

interface PrincipalSnapshot {
  profileId: string;
  legacyRole: string | null; // profiles.role text column
  customRoleKeys: string[]; // role_keys from user_roles → custom_roles
  permissionKeys: string[]; // permission keys aggregated from custom_roles.permissions
  consultantId: string | null; // education_consultants.id for this user, if active
  isActiveConsultant: boolean;
  isSuperAdmin: boolean;
}

async function loadPrincipalSnapshot(
  profileId: string,
): Promise<PrincipalSnapshot> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  const [profileResult, rolesResult, consultantResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, role, is_super_admin')
      .eq('id', profileId)
      .maybeSingle(),
    supabase
      .from('user_roles')
      .select('custom_roles(role_key, permissions)')
      .eq('user_id', profileId),
    supabase
      .from('education_consultants')
      .select('id, status')
      .eq('user_id', profileId)
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const profile = (profileResult.data ?? null) as {
    id: string;
    role: string | null;
    is_super_admin: boolean | null;
  } | null;

  // user_roles rows; each can join to at most one custom_role; collect all keys.
  type CustomRoleJoin = {
    role_key: string | null;
    permissions: string[] | Record<string, unknown> | null;
  };
  const userRoleRows = (rolesResult.data ?? []) as Array<{
    custom_roles: CustomRoleJoin | CustomRoleJoin[] | null;
  }>;

  const customRoleKeys: string[] = [];
  const permissionKeySet = new Set<string>();
  for (const row of userRoleRows) {
    const joined = Array.isArray(row.custom_roles)
      ? row.custom_roles
      : row.custom_roles
        ? [row.custom_roles]
        : [];
    for (const cr of joined) {
      if (cr.role_key) customRoleKeys.push(cr.role_key);
      // custom_roles.permissions is jsonb. Conventionally an array of strings
      // (e.g. ['admission.leads.view', 'admission.consultants.portal.view'])
      // but tolerate object form `{ key: true }` too.
      if (Array.isArray(cr.permissions)) {
        for (const p of cr.permissions) {
          if (typeof p === 'string') permissionKeySet.add(p);
        }
      } else if (cr.permissions && typeof cr.permissions === 'object') {
        for (const [k, v] of Object.entries(cr.permissions)) {
          if (v) permissionKeySet.add(k);
        }
      }
    }
  }

  const consultant = (consultantResult.data ?? null) as {
    id: string;
    status: string;
  } | null;

  return {
    profileId,
    legacyRole: profile?.role ?? null,
    customRoleKeys,
    permissionKeys: Array.from(permissionKeySet),
    consultantId: consultant?.id ?? null,
    isActiveConsultant: !!consultant && consultant.status === 'active',
    isSuperAdmin:
      !!profile?.is_super_admin || profile?.role === 'super_admin',
  };
}

function matchRule(
  rule: ConsultantPortalAccessRow,
  snap: PrincipalSnapshot,
): boolean {
  if (rule.principal_type === 'user') {
    return rule.principal_value === snap.profileId;
  }
  if (rule.principal_type === 'role') {
    if (snap.legacyRole === rule.principal_value) return true;
    return snap.customRoleKeys.includes(rule.principal_value);
  }
  if (rule.principal_type === 'permission') {
    return snap.permissionKeys.includes(rule.principal_value);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API — readers
// ---------------------------------------------------------------------------

/**
 * Can this user load /consultant-portal/* at all?
 *
 * Resolution order:
 *   1. super_admin short-circuit (always allowed).
 *   2. Active consultant record (education_consultants.user_id = profileId
 *      AND status='active') — the canonical portal-user check the layout
 *      already uses. Returns via='consultant_record'.
 *   3. Active row in consultant_portal_access_policy with rule_type =
 *      'portal_login_allowed' whose principal matches the user.
 *
 * Cached 60s per (profileId|rule_type).
 *
 * Fallback (Supabase unreachable): allow only super_admin and active
 * consultants — mirrors today's hardcoded minimum so the portal keeps
 * working in degraded mode.
 */
export async function canAccessConsultantPortal(
  profileId: string,
): Promise<PortalAccessCheckResult> {
  const key = checkCacheKey(profileId, 'portal_login_allowed');
  const cached = getCachedCheck(key);
  if (cached) return cached;

  try {
    const [snap, rules] = await Promise.all([
      loadPrincipalSnapshot(profileId),
      fetchActiveRules('portal_login_allowed'),
    ]);

    if (snap.isSuperAdmin) {
      const result: PortalAccessCheckResult = {
        allowed: true,
        via: 'role',
        matched_rule_id: null,
      };
      setCachedCheck(key, result);
      return result;
    }

    if (snap.isActiveConsultant) {
      const result: PortalAccessCheckResult = {
        allowed: true,
        via: 'consultant_record',
        matched_rule_id: null,
      };
      setCachedCheck(key, result);
      return result;
    }

    for (const rule of rules) {
      if (matchRule(rule, snap)) {
        const result: PortalAccessCheckResult = {
          allowed: true,
          via: rule.principal_type,
          matched_rule_id: rule.id,
        };
        setCachedCheck(key, result);
        return result;
      }
    }

    const denied: PortalAccessCheckResult = {
      allowed: false,
      via: null,
      matched_rule_id: null,
    };
    setCachedCheck(key, denied);
    return denied;
  } catch (err) {
    console.error(
      '[consultant-portal-access] canAccessConsultantPortal failed; falling back to minimum allowlist:',
      err,
    );
    return getHardcodedAccessFallback(profileId);
  }
}

/**
 * Can this user use see-as-user to PREVIEW the consultant portal as a
 * specific consultant? Used by the admin-side preview-as control.
 *
 * Resolves against rule_type='preview_as_consultant'. Super-admin always
 * allowed. Cached 60s.
 *
 * Fallback: super_admin only.
 */
export async function canPreviewAsConsultant(
  profileId: string,
): Promise<boolean> {
  const key = checkCacheKey(profileId, 'preview_as_consultant');
  const cached = getCachedCheck(key);
  if (cached) return cached.allowed;

  try {
    const [snap, rules] = await Promise.all([
      loadPrincipalSnapshot(profileId),
      fetchActiveRules('preview_as_consultant'),
    ]);

    if (snap.isSuperAdmin) {
      setCachedCheck(key, { allowed: true, via: 'role', matched_rule_id: null });
      return true;
    }

    for (const rule of rules) {
      if (matchRule(rule, snap)) {
        setCachedCheck(key, {
          allowed: true,
          via: rule.principal_type,
          matched_rule_id: rule.id,
        });
        return true;
      }
    }

    setCachedCheck(key, { allowed: false, via: null, matched_rule_id: null });
    return false;
  } catch (err) {
    console.error(
      '[consultant-portal-access] canPreviewAsConsultant failed; falling back to super_admin-only:',
      err,
    );
    try {
      const snap = await loadPrincipalSnapshot(profileId);
      return snap.isSuperAdmin;
    } catch {
      return false;
    }
  }
}

/**
 * List access rules. When `ruleType` is omitted, returns every row across
 * all three rule_types (used by the admin data table). Cached 60s.
 *
 * Uses the user's own Supabase client (RLS-enforced SELECT for any
 * authenticated user is granted by the migration).
 */
export async function listAccessRules(
  ruleType?: PortalAccessRuleType,
): Promise<ConsultantPortalAccessRow[]> {
  const key = ruleType ? `list::${ruleType}` : 'list::all';
  const cached = getCachedList(key);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('consultant_portal_access_policy')
    .select('*')
    .order('rule_type', { ascending: true })
    .order('display_label', { ascending: true });

  if (ruleType) {
    query = query.eq('rule_type', ruleType);
  }

  const { data, error } = await query;

  if (error) {
    console.error(
      '[consultant-portal-access] listAccessRules failed:',
      error,
    );
    throw new Error(error.message || 'Failed to load portal access rules');
  }

  const rows = (data ?? []) as ConsultantPortalAccessRow[];
  setCachedList(key, rows);
  return rows;
}

/**
 * Insert OR update a rule. When `id` is provided, updates that row; otherwise
 * relies on the unique (rule_type, principal_type, principal_value) index to
 * upsert. Invalidates the relevant cache slice on success.
 */
export async function upsertAccessRule(
  input: UpsertAccessRuleInput,
): Promise<ConsultantPortalAccessRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;

  const payload: Record<string, unknown> = {
    rule_type: input.rule_type,
    principal_type: input.principal_type,
    principal_value: input.principal_value,
    display_label: input.display_label,
    is_active: input.is_active ?? true,
    notes: input.notes ?? null,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from('consultant_portal_access_policy')
      .update(payload)
      .eq('id', input.id)
      .select('*')
      .single();

    if (error) {
      console.error('[consultant-portal-access] update failed:', error);
      throw new Error(error.message || 'Failed to update portal access rule');
    }

    invalidatePortalAccessCache(input.rule_type);
    return data as ConsultantPortalAccessRow;
  }

  const { data, error } = await supabase
    .from('consultant_portal_access_policy')
    .upsert(payload, {
      onConflict: 'rule_type,principal_type,principal_value',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[consultant-portal-access] upsert failed:', error);
    throw new Error(error.message || 'Failed to create portal access rule');
  }

  invalidatePortalAccessCache(input.rule_type);
  return data as ConsultantPortalAccessRow;
}

/**
 * Soft-delete: flip is_active=false (preserves audit trail). Hard delete is
 * intentionally not exposed — Director keeps the row and toggles instead, so
 * a previously-active grant is auditable.
 */
export async function deactivateAccessRule(
  id: string,
  ruleType: PortalAccessRuleType,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { error } = await supabase
    .from('consultant_portal_access_policy')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('[consultant-portal-access] deactivate failed:', error);
    throw new Error(
      error.message || 'Failed to deactivate portal access rule',
    );
  }

  invalidatePortalAccessCache(ruleType);
}

/**
 * Convenience helper for the on/off switch in the data table.
 */
export async function setAccessRuleActive(
  id: string,
  ruleType: PortalAccessRuleType,
  isActive: boolean,
): Promise<ConsultantPortalAccessRow> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('consultant_portal_access_policy')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[consultant-portal-access] setActive failed:', error);
    throw new Error(error.message || 'Failed to toggle portal access rule');
  }

  invalidatePortalAccessCache(ruleType);
  return data as ConsultantPortalAccessRow;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchActiveRules(
  ruleType: PortalAccessRuleType,
): Promise<ConsultantPortalAccessRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClientSupabaseClient() as any;
  const { data, error } = await supabase
    .from('consultant_portal_access_policy')
    .select('*')
    .eq('rule_type', ruleType)
    .eq('is_active', true);

  if (error) {
    console.error(
      '[consultant-portal-access] fetchActiveRules failed:',
      error,
    );
    throw new Error(error.message || 'Failed to fetch active rules');
  }

  return (data ?? []) as ConsultantPortalAccessRow[];
}

/**
 * Last-resort fallback when Supabase is unreachable. Mirrors the seed
 * substrate ships with: super_admin and active consultant record.
 */
async function getHardcodedAccessFallback(
  profileId: string,
): Promise<PortalAccessCheckResult> {
  try {
    const snap = await loadPrincipalSnapshot(profileId);
    if (snap.isSuperAdmin) {
      return { allowed: true, via: 'role', matched_rule_id: null };
    }
    if (snap.isActiveConsultant) {
      return {
        allowed: true,
        via: 'consultant_record',
        matched_rule_id: null,
      };
    }
  } catch (err) {
    console.error(
      '[consultant-portal-access] fallback snapshot also failed:',
      err,
    );
  }
  return { allowed: false, via: null, matched_rule_id: null };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export function formatRuleType(ruleType: PortalAccessRuleType): string {
  switch (ruleType) {
    case 'portal_login_allowed':
      return 'Who can sign in';
    case 'rls_read_own_data':
      return 'Who reads own data';
    case 'preview_as_consultant':
      return 'Who can preview-as';
  }
}

export function explainRuleType(ruleType: PortalAccessRuleType): string {
  switch (ruleType) {
    case 'portal_login_allowed':
      return 'These principals can load the consultant portal at /consultant-portal/*. Anyone NOT on this list (and without an active consultant record) is bounced at middleware.';
    case 'rls_read_own_data':
      return 'These principals get the additive RLS self-read on consultant_lead_attributions and consultant_commission_transactions — they see their own rows in the portal.';
    case 'preview_as_consultant':
      return 'These roles may use see-as-user (cookie-swap) to enter the portal AS a specific consultant for debugging or support.';
  }
}

export function formatPrincipalType(type: PortalAccessPrincipalType): string {
  switch (type) {
    case 'role':
      return 'Role';
    case 'permission':
      return 'Permission';
    case 'user':
      return 'Specific user';
  }
}

export const RULE_TYPE_OPTIONS: ReadonlyArray<{
  value: PortalAccessRuleType;
  label: string;
  hint: string;
}> = [
  {
    value: 'portal_login_allowed',
    label: 'Who can sign in',
    hint: 'Principals allowed to load /consultant-portal/* pages.',
  },
  {
    value: 'rls_read_own_data',
    label: 'Who reads own data',
    hint: 'Principals granted the additive RLS self-read on attributions and commissions.',
  },
  {
    value: 'preview_as_consultant',
    label: 'Who can preview-as',
    hint: 'Roles permitted to use see-as-user to enter the portal as a consultant.',
  },
];

export const PRINCIPAL_TYPE_OPTIONS: ReadonlyArray<{
  value: PortalAccessPrincipalType;
  label: string;
  hint: string;
}> = [
  {
    value: 'role',
    label: 'Role',
    hint: 'Match against profiles.role or custom_roles.role_key (e.g., super_admin, consultant, director).',
  },
  {
    value: 'permission',
    label: 'Permission',
    hint: 'Match against a permission key (e.g., admission.consultants.portal.view).',
  },
  {
    value: 'user',
    label: 'Specific user',
    hint: 'A profiles.id UUID — grant access to one named person.',
  },
];
