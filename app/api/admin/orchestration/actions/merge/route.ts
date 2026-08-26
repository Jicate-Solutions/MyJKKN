import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mergePullRequest, type MergeMethod } from '@/lib/services/orchestration/github-merge';
import { recordAction } from '@/lib/services/orchestration/audit';

// POST /api/admin/orchestration/actions/merge
//
// Merges one pull request via the merge-action service. Super-admin only.
// Requires an explicit `confirm: true` in the body — this is a deliberate
// server-side confirmation guard on top of whatever the client UI does, so
// this route can never be triggered by an accidental/malformed request.
//
// Body: { prNumber: number, confirm: true, method?: 'squash'|'merge'|'rebase' }

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_METHODS: readonly MergeMethod[] = ['squash', 'merge', 'rebase'];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    const isSuper = profile?.role === 'super_admin' || profile?.is_super_admin === true;
    if (!isSuper) {
      return NextResponse.json({ ok: false, error: 'Forbidden: super_admin only' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }

    const { prNumber, confirm, method } = body as {
      prNumber?: unknown;
      confirm?: unknown;
      method?: unknown;
    };

    if (confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Refusing: request body must include confirm: true' },
        { status: 400 }
      );
    }

    if (typeof prNumber !== 'number' || !Number.isInteger(prNumber) || prNumber <= 0) {
      return NextResponse.json({ ok: false, error: 'prNumber must be a positive integer' }, { status: 400 });
    }

    let mergeMethod: MergeMethod | undefined;
    if (method !== undefined) {
      if (typeof method !== 'string' || !VALID_METHODS.includes(method as MergeMethod)) {
        return NextResponse.json(
          { ok: false, error: `method must be one of: ${VALID_METHODS.join(', ')}` },
          { status: 400 }
        );
      }
      mergeMethod = method as MergeMethod;
    }

    const result = await mergePullRequest(prNumber, { method: mergeMethod });

    await recordAction(
      'merge',
      `PR #${prNumber}`,
      user.id,
      result.merged ? 'merged' : 'refused',
      result
    );

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
