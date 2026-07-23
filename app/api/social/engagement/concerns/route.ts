export const dynamic = 'force-dynamic';

/**
 * /api/social/engagement/concerns — the "this post concerns me" safe channel (CARRE Respect).
 *
 *   GET   ?deptAccountId=<uuid>  → concerns the caller may see (RLS: own reports, or ALL for
 *                                  a handle the caller manages).
 *   POST  { dept_account_id, reason, post_ref?, anonymous? }
 *                               → raise a concern. When anonymous, reporter_profile_id is NULL
 *                                 so the owner can act on it without seeing who raised it.
 *   PATCH { id, status, resolution? }  → owner marks reviewing/resolved (RLS manager-only).
 *
 * The residual consent/dignity safeguard from the CARRE audit: a lightweight, low-friction
 * way to say "I was featured / this concerns me — please remove", routed to the handle owner.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ConcernReport,
  ConcernsResponse,
  ReportConcernBody,
  ResolveConcernBody,
} from '@/lib/types/social-engagement';

const SELECT_COLS =
  'id, dept_account_id, reporter_profile_id, post_ref, reason, status, resolution, created_at';

export async function GET(request: Request): Promise<NextResponse<ConcernsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const deptAccountId = new URL(request.url).searchParams.get('deptAccountId');
    let query = supabase
      .from('social_concern_reports')
      .select(SELECT_COLS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (deptAccountId) query = query.eq('dept_account_id', deptAccountId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, concerns: (data as ConcernReport[] | null) ?? [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load concerns.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse<ConcernsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as ReportConcernBody | null;
    if (!body?.dept_account_id || !body.reason?.trim()) {
      return NextResponse.json({ success: false, error: 'dept_account_id and a reason are required.' }, { status: 400 });
    }

    const row = {
      dept_account_id: body.dept_account_id,
      reporter_profile_id: body.anonymous ? null : user.id,
      post_ref: body.post_ref?.trim() || null,
      reason: body.reason.trim(),
      status: 'open' as const,
    };

    // Anonymous reports insert reporter_profile_id = NULL, which the scn_select RLS
    // (reporter = auth.uid() OR manager) hides from the submitter — so we must NOT
    // round-trip the row through `.select().single()` (it would read back 0 rows and
    // report a false failure, driving duplicate submissions). Insert only, echo nothing.
    if (body.anonymous) {
      const { error } = await supabase.from('social_concern_reports').insert(row);
      if (error) {
        const status = error.code === '42501' ? 403 : 400;
        return NextResponse.json({ success: false, error: error.message }, { status });
      }
      return NextResponse.json({ success: true, concerns: [] });
    }

    const { data, error } = await supabase
      .from('social_concern_reports')
      .insert(row)
      .select(SELECT_COLS)
      .single();

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    return NextResponse.json({ success: true, concerns: [data as ConcernReport] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to submit your concern.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse<ConcernsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as ResolveConcernBody | null;
    if (!body?.id || !body.status) {
      return NextResponse.json({ success: false, error: 'id and status are required.' }, { status: 400 });
    }
    if (!new Set(['reviewing', 'resolved']).has(body.status)) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      status: body.status,
      resolution: body.resolution?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (body.status === 'resolved') {
      patch.resolved_by = user.id;
      patch.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('social_concern_reports')
      .update(patch)
      .eq('id', body.id)
      .select(SELECT_COLS)
      .single();

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    if (!data) return NextResponse.json({ success: false, error: 'Not found or not permitted.' }, { status: 403 });
    return NextResponse.json({ success: true, concerns: [data as ConcernReport] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to resolve the concern.' },
      { status: 500 }
    );
  }
}
