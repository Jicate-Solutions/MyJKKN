/**
 * T8.6 Multi-role Dashboard Refinements — widget-config service
 *
 * Reads the `dashboard.role_widgets` platform_policies row (object) and exposes
 * a single helper, `getWidgetsForRole(roleKey)`, that the /dashboard page calls
 * to decide which widget IDs to render — and in which order — for the current
 * user's primary role.
 *
 * Resolution:
 *   1. Look up role_widgets[roleKey].
 *   2. If absent, fall back to role_widgets._default.
 *   3. If still absent (policy row missing entirely), fall back to a hardcoded
 *      safe default so the dashboard never renders empty.
 *
 * The mutation half (`updateWidgetsForRole`) is Director-only and used by the
 * /admin/dashboard/widget-config UI. It validates that every value in the
 * incoming map is an array of strings before writing.
 *
 * Pattern locked 2026-05-11 (memory: reference_platform_policies_director_view_pattern.md).
 */

import 'server-only';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

/** Stable widget identifiers — the dashboard page maps these to render slots. */
export const WIDGET_IDS = [
  'todays_focus',
  'morning_brief',
  'counselor_staffing_alert',
  'whatsapp_health',
  'hero',
  'streak',
  'institution_chips',
  'decision_queue',
  'activity_feed',
  'leaderboards',
  'ai_agency',
  // Dormant by default: deliberately absent from HARDCODED_DEFAULT, so no role
  // sees it until the Director adds it to a role in
  // /admin/dashboard/widget-config (which writes the dashboard.role_widgets
  // platform_policies row). Registering the ID here is what makes it selectable.
  'daily_intel',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export type RoleWidgetMap = Record<string, string[]>;

/**
 * Hardcoded fallback used when the policy row is missing or unreadable.
 * Mirrors the same default the seed migration writes — kept here so the
 * dashboard renders the right thing even before the migration is applied.
 */
const HARDCODED_DEFAULT: RoleWidgetMap = {
  director: [
    'todays_focus',
    'morning_brief',
    'counselor_staffing_alert',
    'whatsapp_health',
    'hero',
    'streak',
    'institution_chips',
    'decision_queue',
    'activity_feed',
    'leaderboards',
  ],
  cao: [
    'morning_brief',
    'counselor_staffing_alert',
    'whatsapp_health',
    'hero',
    'ai_agency',
    'decision_queue',
    'activity_feed',
    'leaderboards',
  ],
  hr_officer: ['morning_brief', 'hero', 'ai_agency', 'decision_queue', 'activity_feed'],
  counselor: [
    'morning_brief',
    'counselor_staffing_alert',
    'hero',
    'streak',
    'decision_queue',
    'activity_feed',
    'leaderboards',
  ],
  hod: ['morning_brief', 'whatsapp_health', 'hero', 'ai_agency', 'decision_queue', 'activity_feed'],
  faculty: ['morning_brief', 'hero', 'ai_agency', 'decision_queue', 'activity_feed'],
  principal: ['morning_brief', 'hero', 'ai_agency', 'decision_queue', 'activity_feed'],
  accounts: ['morning_brief', 'hero', 'ai_agency', 'decision_queue', 'activity_feed'],
  student: ['morning_brief', 'hero'],
  _default: ['morning_brief', 'decision_queue', 'ai_agency'],
};

/**
 * Read the full role -> widgets map from platform_policies.
 *
 * Falls back to {@link HARDCODED_DEFAULT} on RPC error or missing row. Never
 * throws — callers can rely on always receiving a populated object.
 */
export async function getRoleWidgetMap(): Promise<RoleWidgetMap> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: POLICY_KEYS.DASHBOARD_ROLE_WIDGETS,
      p_scope_id: null,
    });
    if (error) {
      console.warn('[widget-config] fn_get_policy failed, using hardcoded default:', error.message);
      return HARDCODED_DEFAULT;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return HARDCODED_DEFAULT;
    }
    // Defensive: filter to entries whose value is an array of strings. Anything
    // else means the policy row was edited to a malformed shape — we'd rather
    // render a stable dashboard than honor garbage.
    const clean: RoleWidgetMap = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        clean[k] = v;
      }
    }
    // If the cleaned map is empty (entire row was garbage), prefer the hardcoded.
    return Object.keys(clean).length > 0 ? clean : HARDCODED_DEFAULT;
  } catch (err) {
    console.warn('[widget-config] unexpected error, using hardcoded default:', err);
    return HARDCODED_DEFAULT;
  }
}

/**
 * Pure selection half of {@link getWidgetsForRole} — no I/O.
 *
 * Extracted 2026-08-01 (dashboard TTFB): the map fetch does not depend on the
 * viewer's role, so /dashboard fetches the map in parallel with persona
 * resolution and then applies this exact selection logic synchronously.
 * Byte-for-byte the same resolution order getWidgetsForRole always used:
 * role entry → _default entry → hardcoded _default.
 */
export function pickWidgetsForRole(
  map: RoleWidgetMap,
  roleKey: string | null
): string[] {
  if (roleKey && map[roleKey] && map[roleKey].length > 0) {
    return map[roleKey];
  }
  if (map._default && map._default.length > 0) {
    return map._default;
  }
  return HARDCODED_DEFAULT._default;
}

/**
 * Return the ordered list of widget IDs to render for a given role.
 *
 * `roleKey` should be the lowercased `profiles.role` value. Pass `null` for
 * unauthenticated callers — they get the `_default` list.
 */
export async function getWidgetsForRole(roleKey: string | null): Promise<string[]> {
  const map = await getRoleWidgetMap();
  return pickWidgetsForRole(map, roleKey);
}

/**
 * Director-only mutation. Replaces the entire role -> widgets map in one shot.
 * The caller (admin API route) is responsible for permission gating; this
 * function performs no auth check, only shape validation.
 *
 * Returns the updated row, or throws on validation / DB error.
 */
export async function updateWidgetsForRole(
  nextMap: RoleWidgetMap,
  actingUserId: string
): Promise<{ value: RoleWidgetMap; updated_at: string }> {
  // Validate: every entry must be array<string>; widget IDs that aren't known
  // are allowed (so we don't block adding new widget slots), but non-strings
  // and non-arrays are rejected outright.
  if (!nextMap || typeof nextMap !== 'object' || Array.isArray(nextMap)) {
    throw new Error('role_widgets must be an object mapping role_key -> string[]');
  }
  for (const [role, widgets] of Object.entries(nextMap)) {
    if (!Array.isArray(widgets) || !widgets.every((w) => typeof w === 'string')) {
      throw new Error(`Role "${role}" must map to an array of widget-ID strings`);
    }
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('platform_policies')
    .update({
      value: nextMap,
      updated_at: new Date().toISOString(),
      updated_by: actingUserId,
    })
    .eq('policy_key', POLICY_KEYS.DASHBOARD_ROLE_WIDGETS)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .select('value, updated_at')
    .maybeSingle();

  if (error) {
    console.error('[widget-config] update failed:', error);
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error(
      'dashboard.role_widgets row not found — has migration 20260625_dashboard_role_widget_config been applied?'
    );
  }
  return data as { value: RoleWidgetMap; updated_at: string };
}
