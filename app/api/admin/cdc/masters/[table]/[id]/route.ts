export const dynamic = 'force-dynamic';

/**
 * PATCH  /api/admin/cdc/masters/[table]/[id]  — update one row
 * DELETE /api/admin/cdc/masters/[table]/[id]  — soft-delete (is_active=false)
 *
 * Role: super_admin OR cdc_head
 * System rows (is_system=true) cannot be deleted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  updateMasterRow,
  toggleMasterRowActive,
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

type RouteContext = { params: Promise<{ table: string; id: string }> };

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { table, id } = await ctx.params;
  if (!(ALLOWED_MASTER_TABLES as string[]).includes(table)) {
    return NextResponse.json({ error: 'Unknown master table' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Strip server-managed fields
  const { id: _id, created_at: _ca, created_by: _cb, updated_at: _ua, updated_by: _ub, ...payload } = body as any;

  const supabase = await createClient();
  const { data, error } = await updateMasterRow(supabase, table as CdcMasterTable, id, {
    ...payload,
    updated_by: auth.userId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  const auth = await requireCdcAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status: auth.status }
    );
  }

  const { table, id } = await ctx.params;
  if (!(ALLOWED_MASTER_TABLES as string[]).includes(table)) {
    return NextResponse.json({ error: 'Unknown master table' }, { status: 400 });
  }

  // Guard: do not delete system rows
  const supabase = await createClient();
  const { data: row } = await supabase
    .from(table)
    .select('is_system')
    .eq('id', id)
    .single();

  if (row?.is_system) {
    return NextResponse.json(
      { error: 'System rows cannot be deleted. Toggle is_active instead.' },
      { status: 400 }
    );
  }

  const { error } = await toggleMasterRowActive(supabase, table as CdcMasterTable, id, false);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
