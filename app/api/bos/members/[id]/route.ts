import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { UpdateBosMemberDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
  guardAcademicCouncilWrite,
  guardGoverningBodyWrite,
} from '@/lib/utils/bos/bos-access';

// Resolve the parent composition for a member row so we can run the right
// write-gate. Returns the composition_id plus the council flags + institution
// (a council body — Academic Council / Governing Body — authorizes the principal
// instead of the board chairman).
async function parentCompositionForMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
): Promise<{
  compositionId: string;
  isCouncil: boolean;
  isGoverningBody: boolean;
  institutionsId: string | null;
} | null> {
  const { data: member } = await supabase
    .from('bos_members')
    .select('composition_id')
    .eq('id', memberId)
    .maybeSingle();
  const compositionId = (member as { composition_id?: string | null } | null)?.composition_id ?? null;
  if (!compositionId) return null;
  const { data: comp } = await supabase
    .from('bos_compositions')
    .select('is_academic_council, is_governing_body, institutions_id')
    .eq('id', compositionId)
    .maybeSingle();
  const c = comp as {
    is_academic_council?: boolean;
    is_governing_body?: boolean;
    institutions_id?: string | null;
  } | null;
  const isGoverningBody = c?.is_governing_body === true;
  return {
    compositionId,
    isCouncil: c?.is_academic_council === true || isGoverningBody,
    isGoverningBody,
    institutionsId: c?.institutions_id ?? null,
  };
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

    const parent = await parentCompositionForMember(supabase, id);
    if (!parent) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      if (parent.isCouncil) {
        // Council roster (Academic Council / Governing Body): the principal
        // manages members, not a board chairman.
        const deny = parent.isGoverningBody
          ? guardGoverningBodyWrite(scope, parent.institutionsId)
          : guardAcademicCouncilWrite(scope, parent.institutionsId);
        if (deny) return NextResponse.json({ error: deny }, { status: 403 });
      } else {
        // Creator of the parent comp can also manage members (bootstrap case).
        const { data: parentComp } = await supabase
          .from('bos_compositions')
          .select('created_by')
          .eq('id', parent.compositionId)
          .maybeSingle();
        const isCreator =
          (parentComp as { created_by?: string | null } | null)?.created_by === user.id;
        if (!isCreator) {
          const deny = guardCompositionChairman(scope, parent.compositionId);
          if (deny) return NextResponse.json({ error: deny }, { status: 403 });
        }
      }
    }

    // Prevent body-tampering to move a member to a composition the user
    // doesn't chair — strip composition_id from the patch for non-super-admins.
    const patch = { ...body } as Record<string, unknown>;
    if (!scope.isSuperAdmin) delete patch.composition_id;

    // AC roster writes bypass the board-keyed RLS (route-level authz is the
    // source of truth). BoS writes stay on the user-context client.
    // `parent.isCouncil` — the field was renamed when Governing Body joined
    // Academic Council on this gate; the old name silently resolved to
    // undefined, so council writes fell back to the user-context client.
    const writeDb = parent.isCouncil ? createServiceRoleClient() : supabase;

    const { data, error } = await writeDb
      .from('bos_members')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(`*, expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no, category ), member_type_rec:bos_member_types ( id, name, base_type )`)
      .single();

    if (error) throw error;

    // A PUT can move a member to another committee or member type, which
    // changes which group it belongs to — so both ranks have to be rebuilt.
    // Idempotent, so it's harmless when the patch touched neither.
    const { error: renumberErr } = await createServiceRoleClient().rpc(
      'bos_renumber_member_order',
      { p_composition_id: parent.compositionId },
    );
    if (renumberErr) {
      console.warn('[bos/members/:id] renumber after update failed:', renumberErr);
    }

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

    const parent = await parentCompositionForMember(supabase, id);
    if (!parent) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const scope = await resolveBosBoardScope(user.id);
    if (!scope.isSuperAdmin) {
      if (parent.isCouncil) {
        // Council roster (Academic Council / Governing Body): the principal
        // manages members, not a board chairman.
        const deny = parent.isGoverningBody
          ? guardGoverningBodyWrite(scope, parent.institutionsId)
          : guardAcademicCouncilWrite(scope, parent.institutionsId);
        if (deny) return NextResponse.json({ error: deny }, { status: 403 });
      } else {
        // Creator of the parent comp can also manage members (bootstrap case).
        const { data: parentComp } = await supabase
          .from('bos_compositions')
          .select('created_by')
          .eq('id', parent.compositionId)
          .maybeSingle();
        const isCreator =
          (parentComp as { created_by?: string | null } | null)?.created_by === user.id;
        if (!isCreator) {
          const deny = guardCompositionChairman(scope, parent.compositionId);
          if (deny) return NextResponse.json({ error: deny }, { status: 403 });
        }
      }
    }

    // AC roster writes bypass the board-keyed RLS (route-level authz is the
    // source of truth). BoS writes stay on the user-context client.
    // `parent.isCouncil` — the field was renamed when Governing Body joined
    // Academic Council on this gate; the old name silently resolved to
    // undefined, so council writes fell back to the user-context client.
    const writeDb = parent.isCouncil ? createServiceRoleClient() : supabase;

    const { error } = await writeDb.from('bos_members').delete().eq('id', id);
    if (error) throw error;

    // Close the hole the delete left in the sequence (…7, 9, 10…) and rebuild
    // group_position. Non-fatal: the member is already gone either way.
    const { error: renumberErr } = await createServiceRoleClient().rpc(
      'bos_renumber_member_order',
      { p_composition_id: parent.compositionId },
    );
    if (renumberErr) {
      console.warn('[bos/members/:id] renumber after delete failed:', renumberErr);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/members/:id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
  }
}
