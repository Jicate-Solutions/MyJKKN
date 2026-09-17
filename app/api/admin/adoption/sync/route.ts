// Adoption loop — pull usage from the log that already exists.
//
// MyJKKN's usage_events (lib/utils/track-usage.ts) has recorded real feature
// events since 2026-02-06. A labelled feature that names its event is measured
// from that log: fn_adoption_sync_usage_events copies the last N days into
// feature_usage, one row per person per day. Super admins only (the RPC
// refuses everyone else with 42501); off while the adoption.loop.enabled
// policy is false.
export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request) {
  await connection();
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Sign in to pull usage.' },
      { status: 401, headers: NO_STORE }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'The request body was not readable.' },
      { status: 400, headers: NO_STORE }
    );
  }
  const days =
    typeof body?.days === 'number' && Number.isFinite(body.days)
      ? Math.min(365, Math.max(1, Math.trunc(body.days)))
      : 30;

  const { data, error } = await supabase.rpc('fn_adoption_sync_usage_events', { p_days: days });
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json(
        { error: 'Pulling usage is for super administrators only.' },
        { status: 403, headers: NO_STORE }
      );
    }
    console.error('[admin/adoption/sync] rpc failed', { days, error });
    return NextResponse.json(
      { error: 'Usage could not be pulled.' },
      { status: 500, headers: NO_STORE }
    );
  }
  const result = (data ?? {}) as {
    success?: boolean;
    error?: string;
    features?: number;
    rows?: number;
    since?: string;
  };
  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Usage was not pulled.' },
      { status: 400, headers: NO_STORE }
    );
  }
  return NextResponse.json(
    { ok: true, features: result.features ?? 0, rows: result.rows ?? 0, since: result.since ?? null },
    { headers: NO_STORE }
  );
}
