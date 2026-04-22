export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

  // Step 4: Extract request meta ONCE — used in audit log regardless of outcome
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Next.js 15 async params
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: `/api/b2a/grievance/${id}`,
      module: 'grievance',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_ID', message: 'Invalid record ID format.' } },
      { status: 400 }
    );
  }

  // Step 5: Fetch single grievance ticket
  interface GrievanceDetail {
    id: string;
    ticket_number: string;
    category_id: string;
    institution_id: string;
    subject: string;
    description: string;
    priority: string | null;
    status: string | null;
    raised_by_type: string;
    raised_by_id: string | null;
    raised_by_name: string | null;
    raised_by_email: string | null;
    raised_by_phone: string | null;
    assigned_to: string | null;
    assigned_at: string | null;
    department_id: string | null;
    sla_hours: number;
    sla_deadline: string;
    sla_status: string | null;
    resolution: string | null;
    resolved_at: string | null;
    resolved_by: string | null;
    satisfaction_rating: number | null;
    satisfaction_feedback: string | null;
    is_emergency: boolean;
    is_anonymous: boolean;
    is_icc_only: boolean;
    escalation_level: number;
    sla_breached_at: string | null;
    withdrawn_at: string | null;
    withdrawn_reason: string | null;
    created_at: string | null;
    updated_at: string | null;
  }

  let record: GrievanceDetail | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('grievance_tickets')
      .select(
        'id, ticket_number, category_id, institution_id, subject, description, priority, status, ' +
        'raised_by_type, raised_by_id, raised_by_name, raised_by_email, raised_by_phone, ' +
        'assigned_to, assigned_at, department_id, sla_hours, sla_deadline, sla_status, ' +
        'resolution, resolved_at, resolved_by, satisfaction_rating, satisfaction_feedback, ' +
        'is_emergency, is_anonymous, is_icc_only, escalation_level, sla_breached_at, ' +
        'withdrawn_at, withdrawn_reason, created_at, updated_at'
      )
      .eq('id', id);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        statusCode = 404;
        errorResponse = NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Grievance record not found.' } },
          { status: 404 }
        );
      } else {
        statusCode = 500;
        errorResponse = NextResponse.json(
          { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance record.' } },
          { status: 500 }
        );
      }
    } else {
      record = data as unknown as GrievanceDetail;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance record.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: `/api/b2a/grievance/${id}`,
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
    { success: true, data: record! },
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
