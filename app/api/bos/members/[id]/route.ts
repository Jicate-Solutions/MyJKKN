import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosMemberDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
} from '@/lib/utils/bos/bos-access';

// Resolve the parent composition_id for a member row so we can run the
// chairman guard. Returns null if the member is missing.
async function compositionIdForMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('bos_members')
    .select('composition_id')
    .eq('id', memberId)
    .maybeSingle();
  return (data as { composition_id?: string | null } | null)?.composition_id ?? null;
}

// ── PUT /api/bos/members/[id] ─────────────────────────────────────────────────
// Chairman-only: editing a member's record is a roster action.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body: UpdateBosMemberDto = await request.json();

    const compositionId = await compositionIdForMember(supabase, id);
    if (!compositionId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      // Creator of the parent comp can also manage members (bootstrap case).
      const { data: parentComp } = await supabase
        .from('bos_compositions')
        .select('created_by')
        .eq('id', compositionId)
        .maybeSingle();
      const isCreator =
        (parentComp as { created_by?: string | null } | null)?.created_by === user.id;
      if (!isCreator) {
        const deny = guardCompositionChairman(scope, compositionId);
        if (deny) return NextResponse.json({ error: deny }, { status: 403 });
      }
    }

    // Prevent body-tampering to move a member to a composition the user
    // doesn't chair — strip composition_id from the patch for non-super-admins.
    const patch = { ...body } as Record<string, unknown>;
    if (!scope.isSuperAdmin) delete patch.composition_id;

    const { data, error } = await supabase
      .from('bos_members')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no, category )`)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/members/:id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update member' }, { status: 500 });
  }
}

// ── DELETE /api/bos/members/[id] ──────────────────────────────────────────────
// Chairman-only: removing a member.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const compositionId = await compositionIdForMember(supabase, id);
    if (!compositionId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      // Creator of the parent comp can also manage members (bootstrap case).
      const { data: parentComp } = await supabase
        .from('bos_compositions')
        .select('created_by')
        .eq('id', compositionId)
        .maybeSingle();
      const isCreator =
        (parentComp as { created_by?: string | null } | null)?.created_by === user.id;
      if (!isCreator) {
        const deny = guardCompositionChairman(scope, compositionId);
        if (deny) return NextResponse.json({ error: deny }, { status: 403 });
      }
    }

    const { error } = await supabase.from('bos_members').delete().eq('id', id);
    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/members/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
