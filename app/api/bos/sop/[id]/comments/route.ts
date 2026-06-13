// app/api/bos/sop/[id]/comments/route.ts
// GET  /api/bos/sop/[id]/comments — list comments (threaded into replies tree).
// POST /api/bos/sop/[id]/comments — add a comment or reply.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BosSopComment, CreateBosSopCommentDto } from '@/types/bos-sop';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bos_sop_comments')
      .select('*')
      .eq('document_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET comments] error:', error);
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
    }

    // Build a parent → replies tree (one level deep is sufficient for SOP review).
    const all = (data ?? []) as BosSopComment[];
    const byId = new Map<string, BosSopComment>();
    all.forEach((c) => byId.set(c.id, { ...c, replies: [] }));
    const roots: BosSopComment[] = [];
    byId.forEach((c) => {
      if (c.parent_id && byId.has(c.parent_id)) {
        byId.get(c.parent_id)!.replies!.push(c);
      } else {
        roots.push(c);
      }
    });

    return NextResponse.json(roots);
  } catch (error) {
    console.error('[GET comments] error:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CreateBosSopCommentDto;
    if (!body.body?.trim()) {
      return NextResponse.json({ error: 'body is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('bos_sop_comments')
      .insert({
        document_id: id,
        parent_id: body.parent_id ?? null,
        range_from: body.range_from ?? null,
        range_to: body.range_to ?? null,
        anchor_text: body.anchor_text ?? null,
        body: body.body.trim(),
        created_by: user.id,
      })
      .select('*')
      .single();

    if (error) {
      console.error('[POST comment] error:', error);
      return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error('[POST comment] error:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
