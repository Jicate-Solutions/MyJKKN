export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/pay-bands
 *
 * Every college's recorded pay band, for the Pay Band Check screen.
 *
 * TWO LOCKS. The bands are the `hr.pay_scales` rows of platform_policies,
 * whose SELECT policy is `auth.uid() IS NOT NULL`, so the table itself protects
 * nothing. This route checks the key first, and the read then goes through
 * hr_pay_band_policies(), which checks the key again in Postgres and returns
 * only the colleges role_has_institution_access() admits for the caller — the
 * same scoping hr_staff_salary_directory() applies to the people on this
 * screen. No college id is read from the request. The screen must never query
 * the table from the browser.
 *
 * Gated on hr.payroll.salary.view — the same key as Employee Salaries, TDS Bands
 * and Annual Increments. No new key: a key does nothing until it is in a role's
 * JSONB, and putting one there is a live change.
 *
 * allowApiKey: false — this is a browser screen's data, not an integration
 * endpoint, and an API key skips withAuth's permission check.
 *
 * READ ONLY. There is no POST, PUT, PATCH or DELETE here.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import {
  PayBandAccessError,
  PayBandPolicyService,
} from '@/lib/services/hr/pay-bands/pay-band-policy-service';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    try {
      const body = await PayBandPolicyService.load(auth.supabase);
      return NextResponse.json(body);
    } catch (err: unknown) {
      // withAuth's gate also admits is_admin(); the database function asks
      // only for the key, as the salary directory does. Say so, don't 500.
      if (err instanceof PayBandAccessError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      console.error('[HR Pay Bands] read error:', err);
      const message = err instanceof Error ? err.message : 'Failed to read the pay bands';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  },
  {
    requirePermission: 'hr.payroll.salary.view',
    requiredPermission: 'read',
    allowApiKey: false,
  },
);
