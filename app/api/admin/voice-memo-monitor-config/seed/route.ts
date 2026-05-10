export const dynamic = 'force-dynamic';

// ============================================================================
// VOICE MEMO MONITOR CONFIG — POST /seed (self-heal seed)
// ============================================================================
// Idempotent self-heal endpoint: inserts the 8 default platform_policies rows
// for the voice memo monitor when the seed migration
// (20260513120000_voice_memo_monitor_policies.sql) has not been applied.
//
// Director clicks "Initialize with defaults" on /admin/voice-memo-monitor
// when the empty state is rendered (Supabase MCP / CLI seed path unavailable).
//
// Idempotency: per-row pre-check via maybeSingle() against
// (policy_key, scope_type='global', scope_id IS NULL). Matches the WHERE NOT
// EXISTS guard in the migration verbatim. Safe to call repeatedly.
//
// RBAC: super_admin only (role='super_admin' OR is_super_admin=true).
// Service-role write bypasses RLS for the platform_policies insert.
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { POLICY_KEYS } from '@/lib/policies/keys';

type SeedRow = {
  policy_key: string;
  value: unknown;
  description: string;
  data_type: 'number' | 'object';
};

const ROWS: SeedRow[] = [
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_WINDOW_HOURS,
    value: 24,
    description:
      'Time window for live counters on the voice memo monitor page (hours). Counters show uploads in the last N hours.',
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_STUCK_THRESHOLD_MINUTES,
    value: 10,
    description:
      "Show a STUCK alert if any memo has been in 'pending' or 'transcribing' for more than this many minutes. Helps catch a wedged cron sweeper.",
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_RED_PCT,
    value: 20,
    description: "Show RED status if today's failure rate exceeds this percent.",
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_FAILURE_RATE_AMBER_PCT,
    value: 5,
    description:
      "Show AMBER status if today's failure rate exceeds this percent (and is below the red threshold).",
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_RECENT_ROWS_LIMIT,
    value: 20,
    description: 'How many recent failures and recent completions to show on the monitor page.',
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_REFRESH_INTERVAL_SECONDS,
    value: 30,
    description: 'Auto-refresh cadence on the monitor page (seconds). Set to 0 to disable auto-refresh.',
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_COST_ALERT_DAILY_INR,
    value: 100,
    description:
      'Alert if total Whisper + Gemini spend on voice-memo analysis exceeds this many rupees in a single day.',
    data_type: 'number'
  },
  {
    policy_key: POLICY_KEYS.VOICE_MEMO_MONITOR_DIRECTOR_DIGEST_CATEGORIES,
    value: {
      interested: ['interested'],
      concerned: ['concerned', 'anxious', 'hostile'],
      neutral: ['neutral']
    },
    description:
      'Maps memo sentiment values to Director digest buckets. Keys are bucket names; values are arrays of memo_sentiment values that roll up into that bucket.',
    data_type: 'object'
  }
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

export async function POST() {
  const auth = await requireSuperAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden: super_admin role required' },
      { status: auth.status }
    );
  }

  const supabase = createServiceRoleClient();
  const inserted: string[] = [];
  const skipped: string[] = [];

  // Per-row idempotent insert: check (policy_key, scope_type='global',
  // scope_id IS NULL) first; insert only if missing. Same conflict shape as
  // the migration's WHERE NOT EXISTS guard.
  for (const r of ROWS) {
    const { data: existing, error: selectError } = await supabase
      .from('platform_policies')
      .select('policy_key')
      .eq('policy_key', r.policy_key)
      .eq('scope_type', 'global')
      .is('scope_id', null)
      .maybeSingle();

    if (selectError) {
      console.error('[voice-memo-monitor-config/seed] select error:', selectError);
      return NextResponse.json(
        { error: selectError.message, partial: { inserted, skipped } },
        { status: 500 }
      );
    }

    if (existing) {
      skipped.push(r.policy_key);
      continue;
    }

    const { error: insertError } = await supabase.from('platform_policies').insert({
      policy_key: r.policy_key,
      scope_type: 'global',
      scope_id: null,
      value: r.value,
      description: r.description,
      data_type: r.data_type,
      is_system: true,
      is_active: true,
      updated_by: auth.userId
    });

    if (insertError) {
      console.error('[voice-memo-monitor-config/seed] insert error:', insertError);
      return NextResponse.json(
        { error: insertError.message, partial: { inserted, skipped } },
        { status: 500 }
      );
    }

    inserted.push(r.policy_key);
  }

  return NextResponse.json({
    success: true,
    inserted_count: inserted.length,
    skipped_count: skipped.length,
    inserted,
    skipped
  });
}
