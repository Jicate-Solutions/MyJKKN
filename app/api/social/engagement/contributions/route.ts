export const dynamic = 'force-dynamic';

/**
 * /api/social/engagement/contributions — the contribution pipeline.
 *
 *   GET   ?deptAccountId=<uuid>  → contributions the caller may see (RLS: own rows,
 *                                  or ALL rows for a handle the caller manages).
 *   POST  { dept_account_id, title?, caption?, media_url? }
 *                               → submit a contribution as the caller (status 'submitted').
 *   PATCH { id, status, review_note?, thank? }
 *                               → owner curates (approve / decline / mark posted). RLS on
 *                                 social_contributions enforces manager-only for this path;
 *                                 a non-manager caller gets a 403 surfaced as { success:false }.
 *
 * We never pre-block writes — RLS is the gate. Reads/writes go through the RLS-scoped
 * server client (the caller's session), so the security boundary is the policy, not this code.
 */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  Contribution,
  ContributionsResponse,
  SubmitContributionBody,
  ReviewContributionBody,
} from '@/lib/types/social-engagement';

const SELECT_COLS =
  'id, dept_account_id, contributor_profile_id, title, caption, media_url, status, ig_post_id, review_note, reviewed_by, reviewed_at, thanked_at, created_at';

/** Resolve display names for a set of profile ids the caller is allowed to read. */
async function resolveNames(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data } = await db.from('profiles').select('id, full_name').in('id', unique);
  for (const row of (data as Array<{ id: string; full_name: string | null }> | null) ?? []) {
    if (row.full_name) map.set(row.id, row.full_name);
  }
  return map;
}

export async function GET(request: Request): Promise<NextResponse<ContributionsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const params = new URL(request.url).searchParams;
    const deptAccountId = params.get('deptAccountId');
    // `actionable=true` returns only the review-critical working set (submitted + approved) so the
    // owner queue can render ALL of them and no pending item is ever pushed past a page cap.
    const actionable = params.get('actionable') === 'true';
    // Truncate FIRST, then require >= 1 — guards both a missing param (Number(null)=0) and a
    // fractional one (0.5 → trunc 0), either of which would otherwise yield an empty/1-row page.
    const nLimit = Math.trunc(Number(params.get('limit')));
    const nOffset = Math.trunc(Number(params.get('offset')));
    const limit = Number.isFinite(nLimit) && nLimit >= 1 ? Math.min(nLimit, 200) : actionable ? 200 : 50;
    const offset = Number.isFinite(nOffset) && nOffset >= 0 ? nOffset : 0;

    // count:'exact' returns the full match count so a busy handle's older rows are never
    // silently dropped — the caller sees `total` and can page with offset/limit.
    let query = supabase
      .from('social_contributions')
      .select(SELECT_COLS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (deptAccountId) query = query.eq('dept_account_id', deptAccountId);
    if (actionable) query = query.in('status', ['submitted', 'approved']);

    const { data, count, error } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const rows = (data as Omit<Contribution, 'contributor_name'>[] | null) ?? [];
    const names = await resolveNames(supabase, rows.map((r) => r.contributor_profile_id));
    const contributions: Contribution[] = rows.map((r) => ({
      ...r,
      contributor_name: names.get(r.contributor_profile_id) ?? null,
    }));

    return NextResponse.json({ success: true, contributions, total: count ?? contributions.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to load contributions.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse<ContributionsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as SubmitContributionBody | null;
    if (!body?.dept_account_id) {
      return NextResponse.json({ success: false, error: 'dept_account_id is required.' }, { status: 400 });
    }
    if (!body.caption?.trim() && !body.title?.trim() && !body.media_url?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Add a title, a caption, or a link to your idea.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('social_contributions')
      .insert({
        dept_account_id: body.dept_account_id,
        contributor_profile_id: user.id, // RLS WITH CHECK enforces this equals auth.uid()
        title: body.title?.trim() || null,
        caption: body.caption?.trim() || null,
        media_url: body.media_url?.trim() || null,
        status: 'submitted',
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    return NextResponse.json({
      success: true,
      contributions: [{ ...(data as Omit<Contribution, 'contributor_name'>), contributor_name: null }],
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to submit your contribution.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request): Promise<NextResponse<ContributionsResponse>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as ReviewContributionBody | null;
    if (!body?.id || !body.status) {
      return NextResponse.json({ success: false, error: 'id and status are required.' }, { status: 400 });
    }
    const allowed = new Set(['approved', 'declined', 'posted']);
    if (!allowed.has(body.status)) {
      return NextResponse.json({ success: false, error: 'Invalid status.' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {
      status: body.status,
      review_note: body.review_note?.trim() || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // Appreciation: stamp thanked_at when approving/posting and the owner chose to thank.
    if (body.thank && (body.status === 'approved' || body.status === 'posted')) {
      patch.thanked_at = new Date().toISOString();
    }

    // Attribution: when marking posted, link the contribution to its real IG post so
    // the recognition nudge computes real-signal truthfully. Validate the chosen post
    // is one of THIS handle's recent posts via the manager-gated DEFINER picker RPC —
    // it returns only posts of a dept the caller manages, so this doubles as a
    // cross-dept guard (a foreign ig_post_id is simply not in the set → rejected).
    if (body.status === 'posted' && body.ig_post_id) {
      const { data: contrib } = await supabase
        .from('social_contributions')
        .select('dept_account_id')
        .eq('id', body.id)
        .maybeSingle();
      if (!contrib) {
        return NextResponse.json({ success: false, error: 'Not found or not permitted.' }, { status: 403 });
      }
      const { data: recent, error: recentErr } = await supabase.rpc('fn_social_recent_posts_for_handle', {
        p_dept_account_id: (contrib as { dept_account_id: string }).dept_account_id,
        p_limit: 50,
      });
      if (recentErr) {
        // A transient RPC failure must not masquerade as "post not found" (a misleading
        // 400 for a legitimate post). Surface it honestly so the owner can retry.
        return NextResponse.json(
          { success: false, error: `Could not verify the post right now: ${recentErr.message}` },
          { status: 500 },
        );
      }
      const belongs = ((recent as Array<{ post_id: string }> | null) ?? []).some(
        (p) => p.post_id === body.ig_post_id,
      );
      if (!belongs) {
        return NextResponse.json(
          { success: false, error: 'That post is not one of this handle’s recent posts.' },
          { status: 400 },
        );
      }
      patch.ig_post_id = body.ig_post_id;
    }

    const { data, error } = await supabase
      .from('social_contributions')
      .update(patch)
      .eq('id', body.id)
      .select(SELECT_COLS)
      .single();

    if (error) {
      const status = error.code === '42501' ? 403 : 400;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }
    if (!data) {
      // RLS silently filtered the row (not manager of this handle).
      return NextResponse.json({ success: false, error: 'Not found or not permitted.' }, { status: 403 });
    }
    return NextResponse.json({
      success: true,
      contributions: [{ ...(data as Omit<Contribution, 'contributor_name'>), contributor_name: null }],
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to update the contribution.' },
      { status: 500 }
    );
  }
}
