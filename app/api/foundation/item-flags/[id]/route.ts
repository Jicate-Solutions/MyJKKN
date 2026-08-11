export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH /api/foundation/item-flags/[id]   { status: 'dismissed' | 'fixed' }
//
// Closes a reported question. Two outcomes, both restoring the question to
// mastery scoring on the next recompute:
//   dismissed -> reviewed, the question is fine
//   fixed     -> the question was wrong and has been corrected
//
// Gated on the `foundation.items.manage` permission key, never a role name.
// The fp_item_flags_resolve policy enforces the same rule at the database, so
// this check is defence in depth AND the place an explicit, readable 403 is
// produced — a silent redirect or a bare "Forbidden" leaves the person who
// clicked with nothing to act on.
//
// Note the person who raised a flag cannot close it here even for their own
// report: a flag anyone can close is not a review, and this control exists
// precisely because nobody read the other ~101 questions.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESOLUTIONS = ['dismissed', 'fixed'] as const;
type Resolution = (typeof RESOLUTIONS)[number];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'id must be a uuid' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const status = body?.status as Resolution | undefined;
    if (!status || !RESOLUTIONS.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of ${RESOLUTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    const { data: canManage } = await (supabase as any).rpc(
      'user_has_permission',
      { permission_name: 'foundation.items.manage' },
    );
    if (!canManage) {
      return NextResponse.json(
        {
          error:
            'You do not have access to close reported questions. Ask whoever holds the Foundation question bank for your college.',
          requiredPermission: 'foundation.items.manage',
        },
        { status: 403 },
      );
    }

    const { data, error } = await (supabase as any)
      .from('fp_item_flags')
      .update({
        status,
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, item_id, flagged_by, reason, status, resolved_by, resolved_at, created_at, updated_at',
      )
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // RLS filtered the row out, or the id does not exist. Both read the same
    // from here and both mean: nothing was changed.
    if (!data) {
      return NextResponse.json(
        { error: 'That report was not found, or you cannot act on it.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not close the report' },
      { status: 500 },
    );
  }
}
