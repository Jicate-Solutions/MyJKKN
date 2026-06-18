/**
 * Social Governance — typed config reader.
 *
 * The Social Governance control plane (dormancy detection, compliance floors,
 * follow-back heuristics, the live-publish master switch, digest shape) is
 * driven entirely by rows in `platform_policies`, the canonical runtime-config
 * substrate (migration 20260429000002_platform_policies_substrate). Values are
 * read at request time via the `fn_get_policy_*` SECURITY DEFINER RPCs so a
 * super-admin can tweak them from the policy UI with zero deploys.
 *
 * Pattern: docs/architecture/config-table-pattern.md.
 *
 * RULE FOR APP CODE: import these getters — never raw-query `platform_policies`
 * and never embed these thresholds as literals. The seeded code-side defaults
 * below exist ONLY as a fail-soft fallback if the policy row is missing or the
 * RPC errors; the database row is the source of truth.
 *
 * Server-only: uses `lib/supabase/server.ts` (carries the auth cookie via
 * `next/headers`). These governance surfaces are super-admin server components,
 * so a client variant is intentionally not shipped here. If a client component
 * ever needs one of these values, add a sibling `config-reader-client.ts`
 * mirroring `lib/policies/get-policy-client.ts` rather than importing this file.
 */

import { createClient } from '@/lib/supabase/server';

// ----------------------------------------------------------------------------
// Policy keys — kept local to this module (not registered in
// lib/policies/keys.ts) to keep the Social Governance config surface
// self-contained and avoid touching shared infra. Must stay in lockstep with
// the seed migration 20260712000000_social_governance_config_substrate.sql.
// ----------------------------------------------------------------------------
export const SOCIAL_POLICY_KEYS = {
  DORMANCY_THRESHOLD_DAYS: 'social.dormancy_threshold_days',
  COMPLIANCE_MIN_FOLLOWERS: 'social.compliance_min_followers',
  COMPLIANCE_MIN_POSTS: 'social.compliance_min_posts',
  FOLLOWBACK_RATIO_THRESHOLD: 'social.followback_ratio_threshold',
  REALTIME_ENABLED: 'social.realtime_enabled',
  DIGEST_TOP_N: 'social.digest_top_n',
  DIGEST_CATEGORIES: 'social.digest_categories',
} as const;

// Code-side fail-soft defaults — MUST match the seeded values in the migration.
const DEFAULTS = {
  dormancyThresholdDays: 60,
  complianceMinFollowers: 150,
  complianceMinPosts: 12,
  followbackRatioThreshold: 0.7,
  realtimeEnabled: false,
  digestTopN: 5,
  digestCategories: {
    dormant: 'Dormant handles',
    noncompliant: 'Below compliance floor',
    followback: 'Likely student-run',
    new: 'Newly registered',
    top_performers: 'Top performers',
  } as Record<string, string>,
} as const;

/** Days with no new post before a department handle is flagged dormant. */
export async function getDormancyThresholdDays(scopeId?: string | null): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy_int', {
    p_key: SOCIAL_POLICY_KEYS.DORMANCY_THRESHOLD_DAYS,
    p_default: DEFAULTS.dormancyThresholdDays,
    p_scope_id: scopeId ?? undefined,
  });
  if (error) {
    console.warn('[social/governance/config] dormancy_threshold_days read failed, using default', error.message);
    return DEFAULTS.dormancyThresholdDays;
  }
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : DEFAULTS.dormancyThresholdDays;
}

/**
 * Compliance floor — the minimum followers AND posts a department handle needs
 * to count as compliant. Returned together because every caller checks both.
 */
export async function getComplianceFloor(
  scopeId?: string | null
): Promise<{ minFollowers: number; minPosts: number }> {
  const supabase = await createClient();
  const [followersRes, postsRes] = await Promise.all([
    supabase.rpc('fn_get_policy_int', {
      p_key: SOCIAL_POLICY_KEYS.COMPLIANCE_MIN_FOLLOWERS,
      p_default: DEFAULTS.complianceMinFollowers,
      p_scope_id: scopeId ?? undefined,
    }),
    supabase.rpc('fn_get_policy_int', {
      p_key: SOCIAL_POLICY_KEYS.COMPLIANCE_MIN_POSTS,
      p_default: DEFAULTS.complianceMinPosts,
      p_scope_id: scopeId ?? undefined,
    }),
  ]);

  const minFollowers =
    !followersRes.error && Number.isFinite(Number(followersRes.data))
      ? Number(followersRes.data)
      : DEFAULTS.complianceMinFollowers;
  const minPosts =
    !postsRes.error && Number.isFinite(Number(postsRes.data))
      ? Number(postsRes.data)
      : DEFAULTS.complianceMinPosts;

  return { minFollowers, minPosts };
}

/**
 * following/followers ratio above which a handle reads as follow-back /
 * student-run rather than an official department channel. Stored as a JSON
 * string (e.g. "0.7") to preserve the decimal — read via the text getter and
 * parsed here.
 */
export async function getFollowbackRatioThreshold(scopeId?: string | null): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy_text', {
    p_key: SOCIAL_POLICY_KEYS.FOLLOWBACK_RATIO_THRESHOLD,
    p_default: String(DEFAULTS.followbackRatioThreshold),
    p_scope_id: scopeId ?? undefined,
  });
  if (error) {
    console.warn('[social/governance/config] followback_ratio_threshold read failed, using default', error.message);
    return DEFAULTS.followbackRatioThreshold;
  }
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : DEFAULTS.followbackRatioThreshold;
}

/**
 * Master switch for live publishing. Keep OFF until Meta publish is proven
 * end-to-end. Fail-soft default is `false` (fail closed — never publish live
 * because of a missing config row).
 */
export async function isRealtimeEnabled(scopeId?: string | null): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy_bool', {
    p_key: SOCIAL_POLICY_KEYS.REALTIME_ENABLED,
    p_default: DEFAULTS.realtimeEnabled,
    p_scope_id: scopeId ?? undefined,
  });
  if (error) {
    console.warn('[social/governance/config] realtime_enabled read failed, using default (false)', error.message);
    return DEFAULTS.realtimeEnabled;
  }
  return Boolean(data);
}

/** Number of top items shown per section in the Social Governance digest. */
export async function getDigestTopN(scopeId?: string | null): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy_int', {
    p_key: SOCIAL_POLICY_KEYS.DIGEST_TOP_N,
    p_default: DEFAULTS.digestTopN,
    p_scope_id: scopeId ?? undefined,
  });
  if (error) {
    console.warn('[social/governance/config] digest_top_n read failed, using default', error.message);
    return DEFAULTS.digestTopN;
  }
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : DEFAULTS.digestTopN;
}

/**
 * Digest section key -> human label mapping. Controls which categories the
 * Social Governance digest renders and in what order.
 */
export async function getDigestCategories(scopeId?: string | null): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('fn_get_policy_json', {
    p_key: SOCIAL_POLICY_KEYS.DIGEST_CATEGORIES,
    p_default: DEFAULTS.digestCategories,
    p_scope_id: scopeId ?? undefined,
  });
  if (error || data == null || typeof data !== 'object' || Array.isArray(data)) {
    if (error) {
      console.warn('[social/governance/config] digest_categories read failed, using default', error.message);
    }
    return DEFAULTS.digestCategories;
  }
  return data as Record<string, string>;
}

/**
 * Convenience: read every governance config value in one round trip. Useful
 * for the governance dashboard / digest builder that needs them all.
 */
export async function getSocialGovernanceConfig(scopeId?: string | null): Promise<{
  dormancyThresholdDays: number;
  complianceMinFollowers: number;
  complianceMinPosts: number;
  followbackRatioThreshold: number;
  realtimeEnabled: boolean;
  digestTopN: number;
  digestCategories: Record<string, string>;
}> {
  const [
    dormancyThresholdDays,
    complianceFloor,
    followbackRatioThreshold,
    realtimeEnabled,
    digestTopN,
    digestCategories,
  ] = await Promise.all([
    getDormancyThresholdDays(scopeId),
    getComplianceFloor(scopeId),
    getFollowbackRatioThreshold(scopeId),
    isRealtimeEnabled(scopeId),
    getDigestTopN(scopeId),
    getDigestCategories(scopeId),
  ]);

  return {
    dormancyThresholdDays,
    complianceMinFollowers: complianceFloor.minFollowers,
    complianceMinPosts: complianceFloor.minPosts,
    followbackRatioThreshold,
    realtimeEnabled,
    digestTopN,
    digestCategories,
  };
}
