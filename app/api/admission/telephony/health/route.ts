

// app/api/admission/telephony/health/route.ts
// GET /api/admission/telephony/health — Telephony health status

import { NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

export async function GET() {
  try {
    // Authenticate
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createServiceRoleClient();

    // Latest health event
    const { data: latest } = await supabase
      .from('telephony_health_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Recent events (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('telephony_health_events')
      .select('id, status_type, connectivity_status, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);

    // Check if we should show a warning
    const isHealthy = !latest || latest.status_type === 'OK';
    const lastIssue = recent?.find((e: Record<string, unknown>) => e.status_type !== 'OK');

    return NextResponse.json({
      status: isHealthy ? 'healthy' : (latest?.status_type as string)?.toLowerCase(),
      latest,
      recent: recent || [],
      lastIssueAt: lastIssue?.created_at ?? null,
    });
  } catch (error) {
    logger.error('admission/telephony', 'Health check error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
