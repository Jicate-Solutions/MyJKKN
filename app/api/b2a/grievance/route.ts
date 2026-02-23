import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const VALID_STATUSES = [
  'draft',
  'submitted',
  'in_review',
  'approved',
  'rejected',
  'returned',
  'fulfilled',
  'closed',
  'cancelled',
] as const;
type ServiceRequestStatus = typeof VALID_STATUSES[number];

const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
type ServiceRequestPriority = typeof VALID_PRIORITIES[number];

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

  // Step 4: Extract request meta ONCE — used in audit log regardless of outcome
  const { ipAddress, userAgent } = extractRequestMeta(request);

  // Parse query params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));
  const statusParam = url.searchParams.get('status');
  const priorityParam = url.searchParams.get('priority');
  const offset = (page - 1) * limit;

  // Validate status param
  const status: ServiceRequestStatus | null =
    statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as ServiceRequestStatus)
      : null;

  // Validate priority param
  const priority: ServiceRequestPriority | null =
    priorityParam && (VALID_PRIORITIES as readonly string[]).includes(priorityParam)
      ? (priorityParam as ServiceRequestPriority)
      : null;

  // Step 5: Fetch data
  interface ServiceRequestRow {
    id: string;
    request_number: string;
    service_type_id: string;
    requester_id: string;
    institution_id: string | null;
    status: string;
    priority: string | null;
    submitted_at: string | null;
    approved_at: string | null;
    fulfilled_at: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
  }

  let items: ServiceRequestRow[] = [];
  let total = 0;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('service_requests')
      .select(
        'id, request_number, service_type_id, requester_id, institution_id, status, priority, ' +
        'submitted_at, approved_at, fulfilled_at, closed_at, created_at, updated_at',
        { count: 'exact' }
      );

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance records.' } },
        { status: 500 }
      );
    } else {
      items = (data ?? []) as ServiceRequestRow[];
      total = count ?? 0;
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch grievance records.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/grievance',
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
    {
      success: true,
      data: {
        items,
        total,
        page,
        limit,
        hasMore: offset + items.length < total,
      },
    },
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
