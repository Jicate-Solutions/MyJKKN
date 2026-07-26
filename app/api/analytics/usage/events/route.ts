export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UsageTrackingService } from '@/lib/services/analytics/usage-tracking-service';
import type { UsageEventType } from '@/types/usage-analytics';

// ---------------------------------------------------------------------------
// Kill switch — platform_policies 'analytics.usage_beacon.enabled', dark by
// default (added 2026-07-26 with the UsageBeacon client). This endpoint is the
// ONLY authority: the client caches our answer but must never be trusted to
// gate itself. Fail-safe — any error reading the policy means "off".
//
// SCOPE: Mode 1 (page visits) ONLY. See the isPageVisit check below — Mode 2
// explicit tracking predates this policy and must keep working unconditionally.
//
// Cached in-process for 60s because the beacon fires on every page navigation
// and a policy round-trip per view would be pure overhead.
// ---------------------------------------------------------------------------
const POLICY_KEY = 'analytics.usage_beacon.enabled';
const POLICY_TTL_MS = 60_000;

let policyCache: { value: boolean; expiresAt: number } | null = null;

async function isBeaconEnabled(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<boolean> {
  const now = Date.now();
  if (policyCache && policyCache.expiresAt > now) return policyCache.value;

  try {
    const { data, error } = await supabase.rpc('fn_get_policy_bool', {
      p_key: POLICY_KEY,
      p_default: false,
    });
    const value = error ? false : data === true;
    policyCache = { value, expiresAt: now + POLICY_TTL_MS };
    return value;
  } catch {
    policyCache = { value: false, expiresAt: now + POLICY_TTL_MS };
    return false;
  }
}

/**
 * POST /api/analytics/usage/events
 * Client-side tracking endpoint.
 *
 * Supports two modes:
 * 1. Page visit: { url: string }
 * 2. Explicit feature tracking: { module: string, feature: string, event_type: string, metadata?: object }
 */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // The kill switch covers MODE 1 ONLY.
    //
    // Mode 2 has 16 live call sites across 6 services (billing invoices +
    // receipts, academic attendance + timetables, learner profiles, exports)
    // via lib/utils/track-usage.ts, all firing since 2026-02-06. Gating the
    // whole endpoint would silently switch those off — a regression in
    // working behaviour that has nothing to do with the beacon. Mode 1 is the
    // new, high-volume path this policy exists to control.
    const isPageVisit = !(body.module && body.feature && body.event_type) && !!body.url;
    if (isPageVisit && !(await isBeaconEnabled(supabase))) {
      // Write nothing and tell the client to stand down for the session.
      return NextResponse.json({ success: true, tracked: false });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    if (body.module && body.feature && body.event_type) {
      // Mode 2: Explicit feature tracking from client-side services
      UsageTrackingService.trackFeature({
        userId: user.id,
        module: body.module,
        feature: body.feature,
        eventType: body.event_type as UsageEventType,
        institutionId: profile?.institution_id || undefined,
        departmentId: profile?.department_id || undefined,
        role: profile?.role || undefined,
        metadata: body.metadata || {},
      }).catch(() => {});
    } else if (body.url) {
      // Mode 1: Page visit tracking
      UsageTrackingService.trackPageVisit({
        userId: user.id,
        url: body.url,
        institutionId: profile?.institution_id || undefined,
        departmentId: profile?.department_id || undefined,
        role: profile?.role || undefined,
      }).catch(() => {});
    } else {
      return NextResponse.json(
        { error: 'Either url or (module + feature + event_type) is required' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, tracked: true });
  } catch (error) {
    console.error('[analytics/usage/events] Error:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}
