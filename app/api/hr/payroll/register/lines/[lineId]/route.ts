export const dynamic = 'force-dynamic';

/**
 * PATCH /api/hr/payroll/register/lines/[lineId]
 * Body: { adjustment_amount?: number, remarks?: string | null }
 *
 * A one-off correction the formula cannot produce — most often a prior month's
 * over-payment being recovered. The amount is SUBTRACTED from net pay, so a
 * negative value pays extra.
 *
 * Without this the register could not represent what HR already does by hand:
 * in the sample file 4 of 13 rows had a Net Pay that did not equal Earnings
 * minus Deductions, explained only by a note in the last column.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

export const PATCH = withAuth(
  async (request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const lineId = params?.lineId;
      if (!lineId) {
        return NextResponse.json({ error: 'lineId is required' }, { status: 400 });
      }

      const body = await request.json().catch(() => null);
      if (!body) {
        return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
      }

      const patch: { adjustmentAmount?: number; remarks?: string | null } = {};

      if (body.adjustment_amount !== undefined && body.adjustment_amount !== null) {
        const amount = Number(body.adjustment_amount);
        if (!Number.isFinite(amount)) {
          return NextResponse.json({ error: 'adjustment_amount must be a number' }, { status: 400 });
        }
        // numeric(12,2) — a larger figure would be rejected by Postgres with a
        // less legible message than this one.
        if (Math.abs(amount) >= 1_000_000_000) {
          return NextResponse.json({ error: 'adjustment_amount is out of range' }, { status: 400 });
        }
        patch.adjustmentAmount = amount;
      }

      if (body.remarks !== undefined) {
        patch.remarks = body.remarks === null ? null : String(body.remarks).slice(0, 500);
      }

      if (patch.adjustmentAmount === undefined && patch.remarks === undefined) {
        return NextResponse.json(
          { error: 'Provide adjustment_amount, remarks, or both' },
          { status: 400 },
        );
      }

      const line = await SalaryRegisterService.updateLine(auth.supabase, lineId, patch);
      return NextResponse.json({ success: true, line });
    } catch (err: any) {
      console.error('[Salary Register] line patch error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to save the adjustment' },
        { status: 422 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.manage', requiredPermission: 'write' },
);
