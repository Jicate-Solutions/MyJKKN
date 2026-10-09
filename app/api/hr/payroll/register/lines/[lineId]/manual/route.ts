export const dynamic = 'force-dynamic';

/**
 * GET  /api/hr/payroll/register/lines/[lineId]/manual
 *   What the "Enter details" dialog opens with: the salary in force (or none),
 *   the statutory amounts, the run's working-days basis, and any saved entry.
 *
 * POST /api/hr/payroll/register/lines/[lineId]/manual
 *   Body: { business_working_days, casual_leave_days, comp_off_days,
 *           other_paid_leave_days, on_duty_days, unpaid_leave_days,
 *           monthly_gross | null, reason, dry_run? }
 *   dry_run = compute and return the figures (the dialog's live preview);
 *   otherwise save the days, mark the row paid + Manual, and re-total the run.
 *
 * For a person excluded for want of an attendance summary (no biometric
 * record), or a row already entered by hand. Gated on register.MANAGE — held
 * by the HR Head; super admins pass. RLS on both tables enforces it again.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';
import {
  manualEntrySchema,
  manualPreviewSchema,
} from '@/lib/validations/salary-register-manual-entry';
import type { ManualEntryInput } from '@/types/hr-payroll';

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const lineId = params?.lineId;
      if (!lineId) return NextResponse.json({ error: 'lineId is required' }, { status: 400 });

      const ctx = await SalaryRegisterService.getManualEntryContext(auth.supabase, lineId);
      return NextResponse.json(ctx);
    } catch (err: any) {
      console.error('[Salary Register] manual entry context error:', err);
      return NextResponse.json({ error: err?.message ?? 'Failed to load the row' }, { status: 422 });
    }
  },
  { requirePermission: 'hr.payroll.register.manage', requiredPermission: 'write' },
);

export const POST = withAuth(
  async (request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const lineId = params?.lineId;
      if (!lineId) return NextResponse.json({ error: 'lineId is required' }, { status: 400 });

      const body = await request.json().catch(() => null);
      if (!body) return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
      const dryRun = body.dry_run === true;

      // A preview may run before a reason is typed; a save may not.
      const schema = dryRun ? manualPreviewSchema : manualEntrySchema;
      const parsed = schema.safeParse({ ...body, monthly_gross: body.monthly_gross ?? null });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues.map((i) => i.message).join('; ') },
          { status: 400 },
        );
      }

      const result = await SalaryRegisterService.saveManualEntry(
        auth.supabase,
        lineId,
        // Validated above; the cast restores the required-ness z.infer drops
        // while strictNullChecks is off in this repo.
        { ...parsed.data, reason: parsed.data.reason ?? '' } as ManualEntryInput,
        { dryRun, userId: auth.user?.id ?? null },
      );
      return NextResponse.json(result);
    } catch (err: any) {
      console.error('[Salary Register] manual entry save error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to save the hand-entered days' },
        { status: 422 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.manage', requiredPermission: 'write' },
);
