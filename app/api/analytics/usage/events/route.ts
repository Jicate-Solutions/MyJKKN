import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UsageTrackingService } from '@/lib/services/analytics/usage-tracking-service';
import type { UsageEventType } from '@/types/usage-analytics';

/**
 * POST /api/analytics/usage/events
 * Client-side tracking endpoint.
 *
 * Supports two modes:
 * 1. Page visit: { url: string }
 * 2. Explicit feature tracking: { module: string, feature: string, event_type: string, metadata?: object }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id, department_id')
      .eq('id', user.id)
      .single();

    const body = await request.json();

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[analytics/usage/events] Error:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}
