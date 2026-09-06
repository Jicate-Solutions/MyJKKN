import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fireProductionDeploy,
  productionDeployPreview,
} from '@/lib/services/orchestration/vercel-deploy';
import { recordAction } from '@/lib/services/orchestration/audit';

// POST /api/admin/orchestration/actions/deploy
//
// Fires the production Vercel deploy hook via the deploy-action service.
// Super-admin only. Requires an explicit `confirm: true` in the body — a
// deliberate server-side confirmation guard on top of whatever the client
// UI does. `fireProductionDeploy` itself fails closed if the latest
// production build isn't confirmed Ready (or can't be verified at all).
//
// Body: { confirm: true }
//
// GET /api/admin/orchestration/actions/deploy
//
// Read-only: what would the next deploy actually ship? Same super-admin gate
// as the POST — the answer names unreleased commit titles, so it is not
// public. Fires nothing.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
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

    // Always 200: the preview fails soft by design, reporting `known: false`
    // with a reason rather than erroring. A preview that cannot be computed
    // must not look like a broken endpoint — nor block the deploy.
    const preview = await productionDeployPreview();
    return NextResponse.json(preview, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

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

    const body = await request.json().catch(() => ({}));
    const { confirm } = (body ?? {}) as { confirm?: unknown };

    if (confirm !== true) {
      return NextResponse.json(
        { ok: false, error: 'Refusing: request body must include confirm: true' },
        { status: 400 }
      );
    }

    const result = await fireProductionDeploy();

    await recordAction('deploy', 'production', user.id, result.fired ? 'fired' : 'refused', result);

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
