export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Foundation Programme — "report a problem with this question".
//
// GET  /api/foundation/item-flags?status=open&examDefinitionId=<uuid>
// POST /api/foundation/item-flags   { item_id, reason? }
//
// Reads and writes run through the SESSION client, never service-role, so the
// fp_item_flags policies are the real boundary:
//   - raise   -> any signed-in person, only in their own name, only status 'open'
//   - read    -> reviewers see all; everyone else sees only what they raised
//   - resolve -> foundation.items.manage only (see ./[id]/route.ts)
//
// Raising is deliberately NOT permission-gated. The whole point of the control
// is that the person who meets a bad question can say so in one tap, whoever
// they are; review is where the gate belongs.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'dismissed', 'fixed'] as const;
const MAX_REASON = 2000;

export async function GET(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const examDefinitionId = params.get('examDefinitionId');
    const itemId = params.get('itemId');

    if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json(
        { error: `status must be one of ${STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    if (examDefinitionId && !UUID_RE.test(examDefinitionId)) {
      return NextResponse.json(
        { error: 'examDefinitionId must be a uuid' },
        { status: 400 },
      );
    }
    if (itemId && !UUID_RE.test(itemId)) {
      return NextResponse.json({ error: 'itemId must be a uuid' }, { status: 400 });
    }

    // The exam filter lives on the item, not the flag, so it only bites through
    // an INNER embed — a plain embed would null the item out and still return
    // every flag. But fp_items is staff-only under RLS, so an inner join would
    // also drop a learner's own reports entirely. Hence: inner ONLY when the
    // caller is actually filtering by exam (a reviewer, who can read fp_items).
    const embed = examDefinitionId
      ? 'item:fp_items!inner(id, exam_definition_id, topic_id, difficulty, stem, is_active)'
      : 'item:fp_items!fp_item_flags_item_id_fkey(id, exam_definition_id, topic_id, difficulty, stem, is_active)';

    let query = (supabase as any)
      .from('fp_item_flags')
      .select(
        `id, item_id, flagged_by, reason, status, resolved_by, resolved_at,
         created_at, updated_at, ${embed}`,
      )
      .order('created_at', { ascending: false })
      .limit(200);

    if (status) query = query.eq('status', status);
    if (itemId) query = query.eq('item_id', itemId);
    if (examDefinitionId) {
      query = query.eq('item.exam_definition_id', examDefinitionId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not load reported questions' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const itemId = body?.item_id;
    const rawReason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (!itemId || !UUID_RE.test(String(itemId))) {
      return NextResponse.json(
        { error: 'item_id is required and must be a uuid' },
        { status: 400 },
      );
    }
    if (rawReason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `reason must be ${MAX_REASON} characters or fewer` },
        { status: 400 },
      );
    }

    const { data, error } = await (supabase as any)
      .from('fp_item_flags')
      .insert({
        item_id: itemId,
        flagged_by: user.id,
        reason: rawReason || null,
        status: 'open',
      })
      .select(
        'id, item_id, flagged_by, reason, status, resolved_by, resolved_at, created_at, updated_at',
      )
      .single();

    if (error) {
      // 23505 = the one-open-flag-per-person index. Already reported by this
      // person is a success from their point of view, not an error to debug.
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'You have already reported this question. It is in the review queue.' },
          { status: 409 },
        );
      }
      if (error.code === '23503') {
        return NextResponse.json({ error: 'That question no longer exists.' }, { status: 404 });
      }
      // RLS rejection or anything else the policies refused.
      if (error.code === '42501') {
        return NextResponse.json(
          { error: 'You are not allowed to report this question.' },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Could not record the report' },
      { status: 500 },
    );
  }
}
