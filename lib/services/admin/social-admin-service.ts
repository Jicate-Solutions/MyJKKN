/**
 * lib/services/admin/social-admin-service.ts
 * Admin service for the Social Governance config surface
 * (/admission/social/admin/policies + app/api/admin/social/policies/*).
 *
 * Pattern: cloned from lib/services/admin/cdc-admin-service.ts — functional API
 * (explicit SupabaseClient) for server/API use, plus a class shim for client
 * components.
 *
 * Operates on:
 *   - platform_policies rows with key prefix "social." at scope_type='global'
 *
 * Writes go through the canonical platform_policies path (plain .update of the
 * value JSONB + updated_by/updated_at) — the same write mechanism the CDC admin
 * service uses. No new write mechanism is introduced.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SocialPolicyRow } from '@/types/admin/social';

const SOCIAL_POLICY_PREFIX = 'social.' as const;
const PLATFORM_POLICIES_TABLE = 'platform_policies' as const;

// =====================================================================================
// Policies
// =====================================================================================

/** List all social.* platform_policies rows at global scope. */
export async function listSocialPolicies(
  supabase: SupabaseClient
): Promise<{ data: SocialPolicyRow[]; error: Error | null }> {
  const { data, error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .select('policy_key, value, description, data_type, updated_at, updated_by')
    .like('policy_key', `${SOCIAL_POLICY_PREFIX}%`)
    .eq('scope_type', 'global')
    .order('policy_key', { ascending: true });

  if (error) return { data: [], error: new Error(error.message) };

  const rows: SocialPolicyRow[] = (data ?? []).map((raw: any) => ({
    policy_key: raw.policy_key,
    value: raw.value,
    description: raw.description ?? null,
    data_type: raw.data_type ?? 'string',
    updated_at: raw.updated_at ?? null,
    updated_by: raw.updated_by ?? null,
  }));

  return { data: rows, error: null };
}

/** Read a single social.* policy row by key (global scope). */
export async function getSocialPolicy(
  supabase: SupabaseClient,
  key: string
): Promise<{ data: SocialPolicyRow | null; error: Error | null }> {
  if (!key.startsWith(SOCIAL_POLICY_PREFIX)) {
    return { data: null, error: new Error('Policy key must start with "social."') };
  }

  const { data, error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .select('policy_key, value, description, data_type, updated_at, updated_by')
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .maybeSingle();

  if (error) return { data: null, error: new Error(error.message) };
  if (!data) return { data: null, error: null };

  const row: SocialPolicyRow = {
    policy_key: (data as any).policy_key,
    value: (data as any).value,
    description: (data as any).description ?? null,
    data_type: (data as any).data_type ?? 'string',
    updated_at: (data as any).updated_at ?? null,
    updated_by: (data as any).updated_by ?? null,
  };

  return { data: row, error: null };
}

/** Update a single social.* policy value. Enforces prefix; value is raw JSONB. */
export async function updateSocialPolicy(
  supabase: SupabaseClient,
  key: string,
  value: unknown,
  updatedBy: string
): Promise<{ error: Error | null }> {
  if (!key.startsWith(SOCIAL_POLICY_PREFIX)) {
    return { error: new Error('Policy key must start with "social."') };
  }

  const { error } = await supabase
    .from(PLATFORM_POLICIES_TABLE)
    .update({ value, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('policy_key', key)
    .eq('scope_type', 'global');

  if (error) return { error: new Error(error.message) };
  return { error: null };
}

// =====================================================================================
// Class shim (for client components that can't await at module level)
// =====================================================================================

export class SocialAdminService {
  private supabase: SupabaseClient;

  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase ?? createClientSupabaseClient();
  }

  listPolicies() {
    return listSocialPolicies(this.supabase);
  }

  getPolicy(key: string) {
    return getSocialPolicy(this.supabase, key);
  }

  updatePolicy(key: string, value: unknown, updatedBy: string) {
    return updateSocialPolicy(this.supabase, key, value, updatedBy);
  }
}
