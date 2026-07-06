export const dynamic = 'force-dynamic';

/**
 * /api/social/engagement/rota — the weekly contributor rota (who owns the handle each week).
 *
 *   GET  ?deptAccountId=<uuid>  → the handle's rota (any authenticated user may see it;
 *                                 RLS scr_select = auth.uid() IS NOT NULL).
 *   POST { dept_account_id, week_start, contributor_profile_id, note? }
 *                               → assign/replace the week's contributor. RLS scr_manage
 *                                 restricts writes to handle-managers; a non-manager gets 403.
 *
 * UNIQUE(dept_account_id, week_start) → one contributor per handle per week; POST upserts.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { RotaEntry, RotaResponse, AssignRotaBody } from '@/lib/types/social-engagement';

const SELECT_COLS =
  'id, dept_account_id, week_start, contributor_profile_id, status, note, created_at';

async function resolveNames(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await db.from('profiles').select('id, full_name').in('id', unique);
  for (const row of (data as Array<{ id: string; full_name: string | null }> | null) ?? []) {
    if (row.full_name) map.set(row.id, row.full_name);
  }
  return map;
}

export async function GET(request: Request): Promise<NextResponse<RotaResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const deptAccountId = new URL(request.url).searchParams.get('deptAccountId');
    if (!deptAccountId) {
      return NextResponse.json({ success: false, error: 'deptAccountId is required.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('social_contributor_rota')
      .select(SELECT_COLS)
      .eq('dept_account_id', deptAccountId)
      .order('week_start', { ascending: false })
      .limit(26);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const rows = (data as Omit<RotaEntry, 'contributor_name'>[] | null) ?? [];
    const names = await resolveNames(supabase, rows.map((r) => r.contributor_profile_id));
    const rota: RotaEntry[] = rows.map((r) => ({ ...r, contributor_name: names.get(r.contributor_profile_id) ?? null }));
    return NextResponse.json({ success: true, rota });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load the rota.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse<RotaResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as AssignRotaBody | null;
    if (!body?.dept_account_id || !body.week_start || !body.contributor_profile_id) {
      return NextResponse.json(
        { success: false, error: 'dept_account_id, week_start and contributor_profile_id are required.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('social_contributor_rota')
      .upsert(
        {
          dept_account_id: body.dept_account_id,
          week_start: body.week_start,
          contributor_profile_id: body.contributor_profile_id,
          note: body.note?.trim() || null,
          assigned_by: user.id,
          status: 'assigned',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'dept_account_id,week_start' }
      )
      .select(SELECT_COLS)
      .single();

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    return NextResponse.json({
      success: true,
      rota: [{ ...(data as Omit<RotaEntry, 'contributor_name'>), contributor_name: null }],
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to assign the rota.' },
      { status: 500 }
    );
  }
}
