/**
 * types/admin/social.ts
 * Types for the /admission/social/admin/* admin surface and the
 * app/api/admin/social/policies/* routes + the social policy admin service.
 *
 * Mirrors types/admin/cdc.ts — the canonical clone target for this surface.
 * These shape the platform_policies rows in the social.* namespace for the
 * super-admin policy editor.
 */

// =====================================================================================
// Policy admin
// =====================================================================================

/**
 * A single platform_policies row in the social.* namespace, shaped for the admin UI.
 * Mirrors CdcPolicyRow.
 */
export interface SocialPolicyRow {
  policy_key: string;
  value: unknown; // raw JSONB — UI serialises before display
  description: string | null;
  data_type: 'boolean' | 'number' | 'string' | 'object' | 'array' | 'enum';
  updated_at: string | null;
  updated_by: string | null;
}

/** The categories used to group social policies in the UI. */
export type SocialPolicyCategory =
  | 'dormancy'
  | 'compliance'
  | 'digest';

export interface SocialPolicyGroup {
  category: SocialPolicyCategory;
  label: string;
  description: string;
  policies: SocialPolicyRow[];
}
