/**
 * notification-recipient-policies-service.ts
 *
 * Director's standing rule (2026-04-29):
 *   "Re-map CEO's digest categories? Click checkboxes" — verbatim Director example.
 *
 * Wraps the `notification_recipient_policies` config table that drives the
 * fan-out functions `fn_generate_super_admin_daily_digest` and
 * `fn_generate_hr_command_center_brief_items`. Director rebuilds recipient
 * lists via the /admin/notifications/recipients UI — no PR, no deploy.
 *
 * Only super_admins can mutate; admins/super_admins can read (RLS enforced).
 */
import { createClientSupabaseClient } from '@/lib/supabase/client';

const supabase = createClientSupabaseClient();

// --- Types -----------------------------------------------------------------

export interface NotificationRecipientPolicy {
  id: string;
  digest_category: string;
  recipient_role_keys: string[];
  recipient_user_emails: string[] | null;
  include_super_admins: boolean;
  match_legacy_role_only: boolean;
  enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface UpdateNotificationRecipientPolicyDto {
  recipient_role_keys?: string[];
  recipient_user_emails?: string[] | null;
  include_super_admins?: boolean;
  match_legacy_role_only?: boolean;
  enabled?: boolean;
  description?: string;
}

export interface DigestRecipientPreviewRow {
  user_id: string;
  email: string;
  source: 'super_admin' | 'role' | 'legacy_role' | 'email_override' | string;
}

export interface AvailableRoleOption {
  role_key: string;
  role_name: string;
}

// --- Reads -----------------------------------------------------------------

/**
 * Fetch all policies, ordered by digest_category.
 */
export async function listPolicies(): Promise<NotificationRecipientPolicy[]> {
  const { data, error } = await supabase
    .from('notification_recipient_policies')
    .select('*')
    .order('digest_category', { ascending: true });

  if (error) {
    console.error('[admin/notification-recipient-policies] list error', error);
    throw error;
  }
  return (data ?? []) as NotificationRecipientPolicy[];
}

/**
 * Fetch a single policy by digest_category.
 */
export async function getPolicy(
  digestCategory: string
): Promise<NotificationRecipientPolicy | null> {
  const { data, error } = await supabase
    .from('notification_recipient_policies')
    .select('*')
    .eq('digest_category', digestCategory)
    .maybeSingle();

  if (error) {
    console.error('[admin/notification-recipient-policies] get error', error);
    throw error;
  }
  return (data as NotificationRecipientPolicy) ?? null;
}

/**
 * List currently-active custom_roles role_keys, for the role multi-select.
 */
export async function listAvailableRoles(): Promise<AvailableRoleOption[]> {
  const { data, error } = await supabase
    .from('custom_roles')
    .select('role_key, role_name, is_active')
    .eq('is_active', true)
    .order('role_name', { ascending: true });

  if (error) {
    console.error('[admin/notification-recipient-policies] roles error', error);
    throw error;
  }
  // Filter is_active true (defensive) and drop is_active from return shape
  return (data ?? [])
    .filter((r: { is_active?: boolean }) => r.is_active !== false)
    .map((r: { role_key: string; role_name: string }) => ({
      role_key: r.role_key,
      role_name: r.role_name,
    }));
}

/**
 * Preview the resolved recipient set for a digest_category by calling the
 * `get_digest_recipients(category)` SECURITY DEFINER helper. Director uses
 * this to confirm a checkbox change before saving.
 */
export async function previewRecipients(
  digestCategory: string
): Promise<DigestRecipientPreviewRow[]> {
  const { data, error } = await supabase.rpc('get_digest_recipients', {
    p_category: digestCategory,
  });

  if (error) {
    console.error(
      '[admin/notification-recipient-policies] preview error',
      error
    );
    throw error;
  }
  return (data ?? []) as DigestRecipientPreviewRow[];
}

// --- Writes ----------------------------------------------------------------

/**
 * Update a policy. RLS allows only super_admins.
 *
 * `recipient_user_emails` accepts `null` to clear; the table column is
 * NOT NULL by default but accepts an empty array, so we normalise here.
 */
export async function updatePolicy(
  id: string,
  patch: UpdateNotificationRecipientPolicyDto
): Promise<NotificationRecipientPolicy> {
  const normalised: Record<string, unknown> = { ...patch };
  if (patch.recipient_user_emails === null) {
    normalised.recipient_user_emails = [];
  }

  const { data, error } = await supabase
    .from('notification_recipient_policies')
    .update(normalised)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('[admin/notification-recipient-policies] update error', error);
    throw error;
  }
  return data as NotificationRecipientPolicy;
}

/**
 * Convenience: update by digest_category instead of id (router-friendly).
 */
export async function updatePolicyByCategory(
  digestCategory: string,
  patch: UpdateNotificationRecipientPolicyDto
): Promise<NotificationRecipientPolicy> {
  const existing = await getPolicy(digestCategory);
  if (!existing) {
    throw new Error(
      `notification_recipient_policies row not found for ${digestCategory}`
    );
  }
  return updatePolicy(existing.id, patch);
}
