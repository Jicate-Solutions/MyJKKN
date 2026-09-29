export const dynamic = 'force-dynamic';

/**
 * GET /api/hr/payroll/pay-bands
 *
 * Every college's recorded pay band, for the Pay Band Check screen.
 *
 * THIS ROUTE IS THE ONLY RESTRICTION ON THE READ. The bands are the
 * `hr.pay_scales` rows of platform_policies, and that table's SELECT policy is
 * `auth.uid() IS NOT NULL` — Postgres lets any signed-in account read them. So
 * the permission check below is not a courtesy on top of RLS; it is the whole
 * gate, which is why the screen must never query the table from the browser.
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
import { PayBandPolicyService } from '@/lib/services/hr/pay-bands/pay-band-policy-service';

export const GET = withAuth(
  async (_request, auth) => {
    await connection();
    try {
      const body = await PayBandPolicyService.load(auth.supabase);
      return NextResponse.json(body);
    } catch (err: unknown) {
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
