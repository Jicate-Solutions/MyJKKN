export const dynamic = 'force-dynamic';

// OneMark Wave 3 Lane D — edit or remove one picture on a question.
//
//   PATCH  /api/foundation/onemark/assets/<assetId>  { alt_text?, sort_order? }
//          -> 200 { ok: true, asset }
//   DELETE /api/foundation/onemark/assets/<assetId>
//          -> 200 { ok: true }
//
// Both gate on foundation.items.manage (ruling #4) and both write through the
// caller's OWN client so onemark_question_assets' write policy decides. The
// service-role client is used only to take the bytes out of the private bucket
// after the row is gone.
//
// A PATCH may not blank alt text: ruling #4 makes the description part of the
// picture, and this route plus POST are the only writers, so "an approved item
// carries a picture nobody can read" has no path through the application.

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { altTextProblem } from '@/lib/onemark/assets/approval';
import { ONEMARK_ASSET_BUCKET } from '@/lib/onemark/assets/constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_COLUMNS = 'id, item_id, asset_type, storage_path, alt_text, sort_order, created_at, updated_at';
const WRITE_PERMISSION = 'foundation.items.manage';

async function gate() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 }) };
  const { data: canManage } = await (supabase as any).rpc('user_has_permission', {
    permission_name: WRITE_PERMISSION,
  });
  if (canManage !== true) {
    return {
      error: NextResponse.json(
        { ok: false, error: 'Only a question author can change a picture on a question.' },
        { status: 403 },
      ),
    };
  }
  return { supabase };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  await connection();
  try {
    const { assetId } = await params;
    if (!UUID_RE.test(assetId)) {
      return NextResponse.json({ ok: false, error: 'A valid asset id is required' }, { status: 400 });
    }
    const g = await gate();
    if ('error' in g) return g.error;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, error: 'Expected a JSON body' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if ('alt_text' in body) {
      const altText = String((body as any).alt_text ?? '').trim();
      const problem = altTextProblem(altText);
      if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
      patch.alt_text = altText;
    }
    if ('sort_order' in body) {
      const n = Number((body as any).sort_order);
      if (!Number.isInteger(n) || n < 1 || n > 99) {
        return NextResponse.json(
          { ok: false, error: 'Position must be a whole number between 1 and 99.' },
          { status: 400 },
        );
      }
      patch.sort_order = n;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ ok: false, error: 'Nothing to change' }, { status: 400 });
    }

    const { data, error } = await (g.supabase as any)
      .from('onemark_question_assets')
      .update(patch)
      .eq('id', assetId)
      .select(ASSET_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error('[PATCH /api/foundation/onemark/assets/[assetId]]', error.message);
      return NextResponse.json({ ok: false, error: `Could not save the change — ${error.message}` }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'That picture is no longer on this question.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, asset: data });
  } catch (err) {
    console.error('[PATCH /api/foundation/onemark/assets/[assetId]]', err);
    return NextResponse.json({ ok: false, error: 'Could not save the change.' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  await connection();
  try {
    const { assetId } = await params;
    if (!UUID_RE.test(assetId)) {
      return NextResponse.json({ ok: false, error: 'A valid asset id is required' }, { status: 400 });
    }
    const g = await gate();
    if ('error' in g) return g.error;

    // Delete the row first: if RLS refuses, the bytes are still there and
    // nothing has been lost. Only a deleted row releases its object.
    const { data, error } = await (g.supabase as any)
      .from('onemark_question_assets')
      .delete()
      .eq('id', assetId)
      .select('id, storage_path')
      .maybeSingle();
    if (error) {
      console.error('[DELETE /api/foundation/onemark/assets/[assetId]]', error.message);
      return NextResponse.json(
        { ok: false, error: `Could not remove the picture — ${error.message}` },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: 'That picture is no longer on this question.' }, { status: 404 });
    }

    if (data.storage_path) {
      const admin = createServiceRoleClient();
      const { error: removeError } = await admin.storage.from(ONEMARK_ASSET_BUCKET).remove([data.storage_path]);
      if (removeError) {
        // The question no longer shows it; the bytes outliving the row is a
        // storage-cleanup matter, not a failure the author must retry.
        console.error(
          '[DELETE /api/foundation/onemark/assets/[assetId]] orphan left in bucket:',
          data.storage_path,
          removeError.message,
        );
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/foundation/onemark/assets/[assetId]]', err);
    return NextResponse.json({ ok: false, error: 'Could not remove the picture.' }, { status: 500 });
  }
}
