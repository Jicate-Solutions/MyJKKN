import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // Step 1: Authenticate
  const authResult = await authenticateApiKey(request, { requiredModule: 'billing' });
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
  const dueBefore = url.searchParams.get('due_before');
  const limitParam = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100));

  // Validate due_before date format if provided
  if (dueBefore !== null && !DATE_RE.test(dueBefore)) {
    logApiUsage({
      apiKeyId: context.keyId,
      endpoint: '/api/b2a/billing/outstanding',
      module: 'billing',
      institutionId,
      statusCode: 400,
      responseTimeMs: Date.now() - startTime,
      ipAddress,
      userAgent,
    });
    return NextResponse.json(
      { error: { code: 'INVALID_DATE', message: 'Invalid due_before format. Use YYYY-MM-DD.' } },
      { status: 400 }
    );
  }

  // Step 5: Fetch data
  type OutstandingRow = {
    id: string;
    student_id: string;
    institution_id: string;
    balance_amount: number;
    due_date: string;
    status: string;
  };

  let items: OutstandingRow[] = [];
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    let query = supabase
      .from('billing_student_bills')
      .select('id, student_id, institution_id, balance_amount, due_date, status')
      .in('status', ['unpaid', 'partial', 'overdue'])
      .gt('balance_amount', 0);

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (dueBefore) {
      query = query.lt('due_date', dueBefore);
    }

    query = query
      .order('due_date', { ascending: true })
      .limit(Math.min(limitParam, 500)); // Safety cap of 500

    const { data, error } = await query;

    if (error) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch outstanding bills.' } },
        { status: 500 }
      );
    } else {
      items = (data ?? []) as OutstandingRow[];
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch outstanding bills.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/billing/outstanding',
    module: 'billing',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  // Sum balance_amount in JS with typeof guard — financial data safety
  const totalOutstanding = items.reduce(
    (sum, row) => sum + (typeof row.balance_amount === 'number' ? row.balance_amount : 0),
    0
  );

  return NextResponse.json(
    {
      success: true,
      data: {
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        currency: 'INR',
        count: items.length,
        items,
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
