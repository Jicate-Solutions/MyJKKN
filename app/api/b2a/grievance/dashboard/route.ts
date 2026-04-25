export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'grievance' });
  if ('error' in authResult) return authResult.error;
  const { context } = authResult;

  // Step 2: Rate limit
  const rateLimitResult = checkRateLimit(context.keyId);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please try again later.' } },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
          'Retry-After': String(Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // Step 3: Resolve institution scope
  const institutionId = resolveInstitutionId(context, request);

  // Step 4: Extract request meta ONCE
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Step 5: Fetch aggregate counts in parallel — one query per status.
  // Also emergency + sla_breached counters (NAAC 7.7.1 surfaces these).
  type DashboardData = {
    byStatus: {
      open: number;
      in_progress: number;
      pending_info: number;
      resolved: number;
      closed: number;
      reopened: number;
    };
    flags: {
      emergency_open: number;
      sla_breached: number;
    };
    summary: {
      total: number;
      active: number;
      completed: number;
      resolutionRate: number;
    };
  };

  let dashboardData: DashboardData | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    const makeCountQueryByStatus = (status: string) => {
      const base = supabase
        .from('grievance_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      return institutionId ? base.eq('institution_id', institutionId) : base;
    };

    const emergencyOpenQuery = (() => {
      const base = supabase
        .from('grievance_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('is_emergency', true)
        .not('status', 'in', '(resolved,closed)');
      return institutionId ? base.eq('institution_id', institutionId) : base;
    })();

    const slaBreachedQuery = (() => {
      const base = supabase
        .from('grievance_tickets')
        .select('id', { count: 'exact', head: true })
        .eq('sla_status', 'breached')
        .not('status', 'in', '(resolved,closed)');
      return institutionId ? base.eq('institution_id', institutionId) : base;
    })();

    const [
      openResult,
      inProgressResult,
      pendingInfoResult,
      resolvedResult,
      closedResult,
      reopenedResult,
      emergencyOpenResult,
      slaBreachedResult,
    ] = await Promise.all([
      makeCountQueryByStatus('open'),
      makeCountQueryByStatus('in_progress'),
      makeCountQueryByStatus('pending_info'),
      makeCountQueryByStatus('resolved'),
      makeCountQueryByStatus('closed'),
      makeCountQueryByStatus('reopened'),
      emergencyOpenQuery,
      slaBreachedQuery,
    ]);

    const firstError = [
      openResult,
      inProgressResult,
      pendingInfoResult,
      resolvedResult,
      closedResult,
      reopenedResult,
      emergencyOpenResult,
      slaBreachedResult,
    ].find(r => r.error)?.error;

    if (firstError) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance dashboard data.' } },
        { status: 500 }
      );
    } else {
      const open = openResult.count ?? 0;
      const in_progress = inProgressResult.count ?? 0;
      const pending_info = pendingInfoResult.count ?? 0;
      const resolved = resolvedResult.count ?? 0;
      const closed = closedResult.count ?? 0;
      const reopened = reopenedResult.count ?? 0;
      const emergency_open = emergencyOpenResult.count ?? 0;
      const sla_breached = slaBreachedResult.count ?? 0;

      const total = open + in_progress + pending_info + resolved + closed + reopened;
      const active = open + in_progress + pending_info + reopened;
      const completed = resolved + closed;
      const resolutionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0;

      dashboardData = {
        byStatus: {
          open,
          in_progress,
          pending_info,
          resolved,
          closed,
          reopened,
        },
        flags: {
          emergency_open,
          sla_breached,
        },
        summary: {
          total,
          active,
          completed,
          resolutionRate,
        },
      };
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance dashboard data.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/grievance/dashboard',
    module: 'grievance',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    { success: true, data: dashboardData! },
    {
      status: 200,
      headers: {
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': String(rateLimitResult.remaining),
        'X-RateLimit-Reset': rateLimitResult.resetAt.toISOString(),
        'Cache-Control': 'no-store',
      },
    }
  );
}
