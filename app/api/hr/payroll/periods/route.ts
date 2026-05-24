export const dynamic = 'force-dynamic';

/**
 * GET  /api/hr/payroll/periods — paginated list with filters
 * POST /api/hr/payroll/periods — create a new period in 'draft' state
 *
 * Uses withAuth with requirePermission so Director/admin/super_admin pass
 * automatically and HR officers pass when they hold the permission key.
 */

import { NextResponse, connection } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { PayrollPeriodsService } from '@/lib/services/hr/payroll/periods-service';
import type { PayrollPeriodFilters, PayrollPeriodStatus, PayrollEngineType } from '@/types/hr-payroll';

// ── GET — list periods ──────────────────────────────────────────

export const GET = withAuth(async (request, auth) => {
  await connection();
  try {
    const url = new URL(request.url);

    const filters: PayrollPeriodFilters = {};
    const orgId = url.searchParams.get('hr_organization_id');
    if (orgId) filters.hr_organization_id = orgId;

    const instId = url.searchParams.get('institution_id');
    if (instId) filters.institution_id = instId;

    const engine = url.searchParams.get('engine_type') as PayrollEngineType | null;
    if (engine) filters.engine_type = engine;

    const year = url.searchParams.get('period_year');
    if (year) filters.period_year = parseInt(year, 10);

    const month = url.searchParams.get('period_month');
    if (month) filters.period_month = parseInt(month, 10);

    const statusParam = url.searchParams.getAll('status') as PayrollPeriodStatus[];
    if (statusParam.length === 1) filters.status = statusParam[0];
    else if (statusParam.length > 1) filters.status = statusParam;

    const backdated = url.searchParams.get('is_backdated');
    if (backdated === 'true') filters.is_backdated = true;
    else if (backdated === 'false') filters.is_backdated = false;

    const page = url.searchParams.get('page');
    if (page) filters.page = parseInt(page, 10);

    const pageSize = url.searchParams.get('pageSize');
    if (pageSize) filters.pageSize = parseInt(pageSize, 10);

    const result = await PayrollPeriodsService.listPeriods(auth.supabase, filters);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[hr/payroll/periods] GET error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.view' });

// ── POST — create period ────────────────────────────────────────

export const POST = withAuth(async (request, auth) => {
  await connection();
  try {
    const body = await request.json();

    const result = await PayrollPeriodsService.createPeriod(auth.supabase, {
      hr_organization_id: body.hr_organization_id,
      institution_id: body.institution_id,
      engine_type: body.engine_type,
      period_year: body.period_year,
      period_month: body.period_month,
      is_backdated: body.is_backdated,
      backdate_reason: body.backdate_reason,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error('[hr/payroll/periods] POST error', err);
    const status = err instanceof Error && err.message.includes('required') ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status },
    );
  }
}, { allowApiKey: false, requirePermission: 'hr.payroll.manage' });
