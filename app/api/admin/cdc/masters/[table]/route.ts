export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/cdc/masters/[table]       — paginated list
 * POST /api/admin/cdc/masters/[table]       — insert new row
 *
 * ?page=1&page_size=50  (GET)
 * Role: super_admin OR cdc_head
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  listMasterRows,
  insertMasterRow,
  ALLOWED_MASTER_TABLES,
} from '@/lib/services/admin/cdc-admin-service';
import type { CdcMasterTable } from '@/types/admin/cdc';

async function requireCdcAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401 };

  // Single source of truth — mirrors the RLS write policy on every master table
  // (is_cdc_head_or_super: super-admin OR a cdc_head role via profiles.role OR a
  // multi-role assignment). Replaces the previous hardcoded legacy-role list,
  // which missed multi-role cdc_head assignments and allowed 'administrator'
  // through the API even though RLS denies it (producing a confusing 500).
  const { data: allowed, error } = await supabase.rpc('is_cdc_head_or_super');
  if (error || allowed !== true) return { ok: false as const, status: 403 };
  return { ok: true as const, userId: user.id };
}

type RouteContext = { params: Promise<{ table: string }> };

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { table } = await ctx.params;
  if (!(ALLOWED_MASTER_TABLES as string[]).includes(table)) {
    return NextResponse.json({ error: 'Unknown master table' }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('page_size') ?? '50', 10)));

  const supabase = await createClient();
  const { data, count, error } = await listMasterRows(supabase, table as CdcMasterTable, page, pageSize);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data, count, page, page_size: pageSize });
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { table } = await ctx.params;
  if (!(ALLOWED_MASTER_TABLES as string[]).includes(table)) {
    return NextResponse.json({ error: 'Unknown master table' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Strip server-managed fields from the incoming payload
  const { id: _id, created_at: _ca, updated_at: _ua, created_by: _cb, updated_by: _ub, ...payload } = body as any;

  const supabase = await createClient();
  const { data, error } = await insertMasterRow(supabase, table as CdcMasterTable, {
    ...payload,
    created_by: auth.userId,
    updated_by: auth.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data }, { status: 201 });
}
