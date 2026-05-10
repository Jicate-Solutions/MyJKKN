export const dynamic = 'force-dynamic';

// ============================================================================
// VOICE MEMO MONITOR CONFIG — GET (list current values for the 8 keys)
// ============================================================================
// Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
// every threshold/mapping/flag = a row in platform_policies. This route is the
// READ side of the super-admin tuning UI at /admin/voice-memo-monitor (the
// PATCH sibling [key]/route.ts is the WRITE side).
//
// RBAC: super_admin only (role='super_admin' OR is_super_admin=true on profile).
// Service-role read so admin can see policy rows even if a future RLS change
// tightens reads on platform_policies.
// ============================================================================

import { NextResponse } from 'next/server';
import { createServiceRoleClient, createClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

const VMM_KEYS: string[] = [
  POLICY_KEYS.VOICE_MEMO_MONITOR_WINDOW_HOURS,
  POLICY_KEYS.VOICE_MEMO_MONITOR_STUCK_THRESHOLD_MINUTES,
  POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_RED_PCT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_AMBER_PCT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_RECENT_ROWS_LIMIT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_REFRESH_INTERVAL_SECONDS,
  POLICY_KEYS.VOICE_MEMO_MONITOR_COST_ALERT_DAILY_INR,
  POLICY_KEYS.VOICE_MEMO_MONITOR_DIRECTOR_DIGEST_CATEGORIES,
];

async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', user.id)
    .single();
  if (!profile || (profile.role !== 'super_admin' && !profile.is_super_admin)) {
    return { ok: false as const, status: 403 };
  }
  return { ok: true as const, userId: user.id };
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required' },
      { status: auth.status }
    );
  }

  const supabase = createServiceRoleClient();
  const { data: rows, error } = await supabase
    .from('platform_policies')
    .select('policy_key, value, description, data_type, updated_at, updated_by')
    .in('policy_key', VMM_KEYS)
    .eq('scope_type', 'global')
    .is('scope_id', null);

  if (error) {
    console.error('[voice-memo-monitor-config] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Preserve VMM_KEYS ordering so the UI renders in a stable, intentional order
  // (window → stuck → red → amber → recent → refresh → cost → digest).
  const byKey = new Map((rows ?? []).map((r) => [r.policy_key, r]));
  const ordered = VMM_KEYS.map((k) => byKey.get(k)).filter(Boolean);

  return NextResponse.json({ success: true, data: ordered });
}
