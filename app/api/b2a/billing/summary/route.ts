import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, resolveInstitutionId } from '@/lib/api-keys/authenticate';
import { checkRateLimit } from '@/lib/api-keys/rate-limiter';
import { logApiUsage, extractRequestMeta } from '@/lib/api-keys/audit-logger';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

  // Step 5: Fetch aggregate data in parallel
  type SummaryData = {
    currency: 'INR';
    totalBilled: number;
    totalOutstanding: number;
    totalOverdue: number;
    paidCount: number;
    unpaidCount: number;
    collectionRate: number;
  };

  let summaryData: SummaryData | null = null;
  let statusCode = 200;
  let errorResponse: NextResponse | null = null;

  try {
    const supabase = createServiceRoleClient();

    // Query 1: All bills — count + final_amount sum (for totalBilled)
    const allBillsQuery = (() => {
      let q = supabase
        .from('billing_student_bills')
        .select('final_amount')
        .limit(5000); // Safety cap — use DB RPC for production-scale sum
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 2: Paid bills — count + final_amount sum (for paid collection)
    const paidBillsCountQuery = (() => {
      let q = supabase
        .from('billing_student_bills')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid');
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 3: Outstanding bills — balance_amount sum (unpaid + partial + overdue)
    const outstandingBillsQuery = (() => {
      let q = supabase
        .from('billing_student_bills')
        .select('balance_amount')
        .in('status', ['unpaid', 'partial', 'overdue'])
        .gt('balance_amount', 0)
        .limit(5000); // Safety cap — use DB RPC for production-scale sum
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 4: Unpaid/partial/overdue count
    const unpaidCountQuery = (() => {
      let q = supabase
        .from('billing_student_bills')
        .select('id', { count: 'exact', head: true })
        .in('status', ['unpaid', 'partial', 'overdue']);
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    // Query 5: Overdue bills — balance_amount sum (due_date < today AND balance > 0)
    const today = new Date().toISOString().split('T')[0];
    const overdueBillsQuery = (() => {
      let q = supabase
        .from('billing_student_bills')
        .select('balance_amount')
        .in('status', ['unpaid', 'partial', 'overdue'])
        .lt('due_date', today)
        .gt('balance_amount', 0)
        .limit(5000); // Safety cap
      if (institutionId) q = q.eq('institution_id', institutionId);
      return q;
    })();

    const [
      allBillsResult,
      paidCountResult,
      outstandingResult,
      unpaidCountResult,
      overdueResult,
    ] = await Promise.all([
      allBillsQuery,
      paidBillsCountQuery,
      outstandingBillsQuery,
      unpaidCountQuery,
      overdueBillsQuery,
    ]);

    // Check ALL Promise.all results for errors
    const firstError = [allBillsResult, paidCountResult, outstandingResult, unpaidCountResult, overdueResult]
      .find(r => r.error)?.error;

    if (firstError) {
      statusCode = 500;
      errorResponse = NextResponse.json(
        { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch billing summary.' } },
        { status: 500 }
      );
    } else {
      // Sum final_amount for all bills — typeof guard for financial safety
      const totalBilled = (allBillsResult.data ?? []).reduce(
        (sum, row) => sum + (typeof row.final_amount === 'number' ? row.final_amount : 0),
        0
      );

      // Sum balance_amount for outstanding bills — typeof guard for financial safety
      const totalOutstanding = (outstandingResult.data ?? []).reduce(
        (sum, row) => sum + (typeof row.balance_amount === 'number' ? row.balance_amount : 0),
        0
      );

      // Sum balance_amount for overdue bills — typeof guard for financial safety
      const totalOverdue = (overdueResult.data ?? []).reduce(
        (sum, row) => sum + (typeof row.balance_amount === 'number' ? row.balance_amount : 0),
        0
      );

      const paidCount = paidCountResult.count ?? 0;
      const unpaidCount = unpaidCountResult.count ?? 0;

      // collectionRate = ((totalBilled - totalOutstanding) / totalBilled) * 100, edge case: 0 if totalBilled = 0
      const collectionRate =
        totalBilled > 0
          ? Math.round(((totalBilled - totalOutstanding) / totalBilled) * 1000) / 10
          : 0;

      summaryData = {
        currency: 'INR',
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalOverdue: Math.round(totalOverdue * 100) / 100,
        paidCount,
        unpaidCount,
        collectionRate,
      };
    }
  } catch {
    statusCode = 500;
    errorResponse = NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch billing summary.' } },
      { status: 500 }
    );
  }

  // Step 6: Single audit log call — always fires, success AND error paths
  logApiUsage({
    apiKeyId: context.keyId,
    endpoint: '/api/b2a/billing/summary',
    module: 'billing',
    institutionId,
    statusCode,
    responseTimeMs: Date.now() - startTime,
    ipAddress,
    userAgent,
  });

  // Step 7: Return error or success
  if (errorResponse) return errorResponse;

  return NextResponse.json(
    { success: true, data: summaryData! },
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
