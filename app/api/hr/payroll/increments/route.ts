export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/increments[?asOf=YYYY-MM-DD]
 *
 * Who is due an annual increment, how much, and — for everyone who is not —
 * the reason in one sentence. Grouped by college.
 *
 * READ ONLY BY CONSTRUCTION. There is no POST, PUT, PATCH or DELETE here and no
 * writer anywhere behind it. A proposal on this route never becomes pay: the
 * Director ruled on 2026-09-18 that a band is reference only and that no salary
 * moves without his per-person approval.
 *
 * Gated on hr.payroll.salary.view — the same key as Employee Salaries and TDS
 * Bands, held by hr_head alone plus super admin. A proposal states a person's
 * current pay and what it would become, so it is the salary decision, not the
 * payer-directory one. No new permission key was invented: a key does nothing
 * until it is in a role's JSONB, and putting one there is a live change.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { IncrementReportService } from '@/lib/services/hr/increments/increment-report-service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const GET = withAuth(
  async (request, auth) => {
    await connection();
    try {
      const url = new URL(request.url);
      const asOfParam = url.searchParams.get('asOf');

      if (asOfParam !== null && !ISO_DATE.test(asOfParam)) {
        return NextResponse.json(
          { error: 'asOf must be a date written as YYYY-MM-DD' },
          { status: 400 },
        );
      }

      const report = await IncrementReportService.build(auth.supabase, {
        asOf: asOfParam ?? undefined,
      });

      return NextResponse.json(report);
    } catch (err: any) {
      console.error('[HR Increments] report error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to work out who is due an increment' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.salary.view', requiredPermission: 'read' },
);
