export const dynamic = 'force-dynamic';

/**
 * GET    /api/hr/payroll/register/[runId] — one frozen register with all of
 *        its rows, included and excluded.
 * DELETE /api/hr/payroll/register/[runId] — remove the register and every
 *        line on it. SUPER ADMIN ONLY. Irreversible.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { getErrorMessage } from '@/lib/utils';
import { SalaryRegisterService } from '@/lib/services/hr/payroll/salary-register-service';

export const GET = withAuth(
  async (_request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const runId = params?.runId;
      if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
      }

      const detail = await SalaryRegisterService.getRunDetail(auth.supabase, runId);
      return NextResponse.json(detail);
    } catch (err: any) {
      console.error('[Salary Register] detail error:', err);
      return NextResponse.json(
        { error: err?.message ?? 'Failed to load the register' },
        { status: 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.view', requiredPermission: 'read' },
);

/**
 * withAuth's requirePermission is the is_super_admin OR is_admin OR key triad,
 * which is wider than this action allows — an admin or an HR Head passes it.
 * So the handler asks is_super_admin() itself, the same predicate the DELETE
 * policies use, before the service touches anything. Match the server's exact
 * predicate: the page gates the action on profile.is_super_admin alone.
 */
export const DELETE = withAuth(
  async (_request, auth, context) => {
    await connection();
    try {
      const params = await context?.params;
      const runId = params?.runId;
      if (!runId) {
        return NextResponse.json({ error: 'runId is required' }, { status: 400 });
      }

      const { data: isSuperAdmin, error: gateErr } = await auth.supabase.rpc('is_super_admin');
      if (gateErr || isSuperAdmin !== true) {
        return NextResponse.json(
          { error: 'Only a super admin can delete a salary register.' },
          { status: 403 },
        );
      }

      const deleted = await SalaryRegisterService.deleteRun(auth.supabase, runId, auth.user.id);
      return NextResponse.json({ success: true, deleted });
    } catch (err: unknown) {
      console.error('[Salary Register] delete error:', err);
      // The service's guard errors carry a code; a PostgrestError is a plain
      // object, so getErrorMessage rather than `instanceof Error`.
      const code = (err as { code?: string })?.code;
      return NextResponse.json(
        { error: getErrorMessage(err) },
        { status: code === '42501' ? 403 : code === 'P0002' ? 404 : 500 },
      );
    }
  },
  { requirePermission: 'hr.payroll.register.manage', requiredPermission: 'write' },
);
