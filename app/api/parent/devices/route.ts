import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, parentErrorResponse } from '@/lib/utils/parent-access';

export const runtime = 'nodejs';

/**
 * POST /api/parent/devices — register a Web Push subscription for this parent.
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 * Sending pushes is dev-stubbed until VAPID keys are configured (Phase A6 live).
 */
export async function POST(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    };
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const db = createServiceRoleClient();
    await db.from('pp_devices').upsert(
      {
        parent_account_id: scope.parentAccountId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.userAgent ?? null,
      },
      { onConflict: 'parent_account_id,endpoint' }
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
