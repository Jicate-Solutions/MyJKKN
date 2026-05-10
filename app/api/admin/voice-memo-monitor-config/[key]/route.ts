export const dynamic = 'force-dynamic';

// ============================================================================
// VOICE MEMO MONITOR CONFIG — PATCH /[key] (update one policy value)
// ============================================================================
// Sibling of GET ../route.ts. Updates a single platform_policies row scoped
// to (policy_key, 'global', NULL). Validates by data_type:
//   - The 7 number keys accept only finite, non-negative numbers.
//   - The director_digest_categories key accepts an object whose values are
//     arrays of strings (sentiment buckets).
// RBAC: super_admin only.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, createClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

const ALLOWED_KEYS: string[] = [
  POLICY_KEYS.VOICE_MEMO_MONITOR_WINDOW_HOURS,
  POLICY_KEYS.VOICE_MEMO_MONITOR_STUCK_THRESHOLD_MINUTES,
  POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_RED_PCT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_AMBER_PCT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_RECENT_ROWS_LIMIT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_REFRESH_INTERVAL_SECONDS,
  POLICY_KEYS.VOICE_MEMO_MONITOR_COST_ALERT_DAILY_INR,
  POLICY_KEYS.VOICE_MEMO_MONITOR_DIRECTOR_DIGEST_CATEGORIES,
];

const NUMBER_KEYS = new Set<string>([
  POLICY_KEYS.VOICE_MEMO_MONITOR_WINDOW_HOURS,
  POLICY_KEYS.VOICE_MEMO_MONITOR_STUCK_THRESHOLD_MINUTES,
  POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_RED_PCT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_AMBER_PCT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_RECENT_ROWS_LIMIT,
  POLICY_KEYS.VOICE_MEMO_MONITOR_REFRESH_INTERVAL_SECONDS,
  POLICY_KEYS.VOICE_MEMO_MONITOR_COST_ALERT_DAILY_INR,
]);

const OBJECT_KEY: string = POLICY_KEYS.VOICE_MEMO_MONITOR_DIRECTOR_DIGEST_CATEGORIES;

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

type RouteContext = { params: Promise<{ key: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required' },
      { status: auth.status }
    );
  }

  const { key: rawKey } = await ctx.params;
  const key = decodeURIComponent(rawKey);
  if (!ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown or non-editable policy key' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !('value' in body)) {
    return NextResponse.json({ error: 'Body must include { value: <new value> }' }, { status: 400 });
  }

  const incoming = (body as { value: unknown }).value;

  if (NUMBER_KEYS.has(key)) {
    if (typeof incoming !== 'number' || !Number.isFinite(incoming) || incoming < 0) {
      return NextResponse.json({ error: 'Value must be a non-negative number' }, { status: 400 });
    }
  } else if (key === OBJECT_KEY) {
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      return NextResponse.json(
        { error: 'Value must be an object whose entries are arrays of sentiment strings' },
        { status: 400 }
      );
    }
    for (const [bucket, members] of Object.entries(incoming as Record<string, unknown>)) {
      if (!Array.isArray(members) || !members.every((m) => typeof m === 'string')) {
        return NextResponse.json(
          { error: `Bucket "${bucket}" must be an array of strings` },
          { status: 400 }
        );
      }
    }
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('platform_policies')
    .update({
      value: incoming,
      updated_at: new Date().toISOString(),
      updated_by: auth.userId
    })
    .eq('policy_key', key)
    .eq('scope_type', 'global')
    .is('scope_id', null)
    .select('policy_key, value, updated_at, updated_by')
    .maybeSingle();

  if (error) {
    console.error('[voice-memo-monitor-config/[key]] PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Policy row not found — has the seed migration run?' },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true, data });
}
