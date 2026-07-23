// app/api/bos/sop/[id]/comments/[commentId]/route.ts
// PUT    — edit comment body or toggle resolved state.
// DELETE — remove a comment (cascades to replies via FK).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosSopCommentDto } from '@/types/bos-sop';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as UpdateBosSopCommentDto;
    const patch: Record<string, unknown> = {};
    if (body.body !== undefined) patch.body = body.body.trim();
    if (body.is_resolved !== undefined) {
      patch.is_resolved = body.is_resolved;
      patch.resolved_at = body.is_resolved ? new Date().toISOString() : null;
      patch.resolved_by = body.is_resolved ? user.id : null;
    }

    const { data, error } = await supabase
      .from('bos_sop_comments')
      .update(patch)
      .eq('id', commentId)
      .select('*')
      .single();

    if (error) {
      console.error('[PUT comment] error:', error);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[PUT comment] error:', error);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error } = await supabase
      .from('bos_sop_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('[DELETE comment] error:', error);
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[DELETE comment] error:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
