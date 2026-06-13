import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosCompositionDto } from '@/types/bos';
import {
  resolveBosBoardScope,
  guardCompositionChairman,
} from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/compositions/[id] ───────────────────────────────────────────
// Returns a single composition with its board info and full member list.
// Read-gating: super-admin sees all; principal sees comps in their institution(s);
// board members see only the compositions they belong to.
export async function GET(
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
    const scope = await resolveBosBoardScope(user.id);

    const { data, error } = await supabase
      .from('bos_compositions')
      .select(
        `
        *,
        members:bos_members (
          *,
          expert:bos_external_experts ( id, name, title, category, institution_name )
        )
        `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
      }
      throw error;
    }

    // Visibility check:
    //   - super-admin               → always
    //   - principal                 → same institution(s)
    //   - composition member        → listed in bos_members
    //   - creator (bootstrap case)  → row carries created_by = this user. Needed
    //     because between POST → first chairman insert, the HOD has no member
    //     row yet but must be able to see + finish setting up their composition.
    if (!scope.isSuperAdmin) {
      const row = data as { institutions_id?: string | null; created_by?: string | null };
      const compInstitution = row.institutions_id ?? null;
      const inMyInstitution = compInstitution
        ? scope.allInstitutionIds.includes(compInstitution) || scope.institutionsId === compInstitution
        : false;
      const isCreator = row.created_by != null && row.created_by === user.id;
      const visible = scope.isPrincipal
        ? inMyInstitution
        : (scope.memberOf.has(id) || isCreator);
      if (!visible) {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
      }
    }

    // Enrich with board metadata from COE so the meeting form can render the
    // board name/code without a second round-trip. Mirrors the list endpoint.
    const row = data as { institutions_id?: string | null; board_id?: string | null };
    let board: { board_code: string; board_name: string; board_type?: string | null } | null = null;
    if (row.institutions_id && row.board_id) {
      try {
        const { fetchCoeBoardMaps } = await import('@/lib/utils/bos/coe-boards');
        const coeBoardMap = await fetchCoeBoardMaps([row.institutions_id]);
        const b = coeBoardMap.get(row.board_id);
        if (b) board = { board_code: b.board_code, board_name: b.board_name, board_type: b.board_type };
      } catch (e) {
        console.warn('[bos/compositions/[id]] board enrichment failed:', e);
      }
    }

    return NextResponse.json({ ...data, board });
  } catch (error) {
    console.error('[bos/compositions/[id]] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch composition' }, { status: 500 });
  }
}

// ── PUT /api/bos/compositions/[id] ───────────────────────────────────────────
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

    // Chairman OR creator: editing a composition record (term dates,
    // ratification, board re-assignment) is normally chairman-only, but the
    // user who created the row can still edit until they delegate the chairman
    // role (otherwise they couldn't finish setup post-creation).
    const scope = await resolveBosBoardScope(user.id);
    const { data: existing } = await supabase
      .from('bos_compositions')
      .select('created_by')
      .eq('id', id)
      .maybeSingle();
    const isCreator =
      (existing as { created_by?: string | null } | null)?.created_by === user.id;

    if (!scope.isSuperAdmin && !isCreator) {
      const deny = guardCompositionChairman(scope, id);
      if (deny) return NextResponse.json({ error: deny }, { status: 403 });
    }

    const body: UpdateBosCompositionDto = await request.json();

    // Strip institutions_id from the patch for non-super-admins so a chairman
    // can't relocate a composition to another institution by tampering the body.
    const patch = { ...body };
    if (!scope.isSuperAdmin) {
      delete (patch as { institutions_id?: string }).institutions_id;
    }

    // If the board is being re-assigned, re-resolve board_type from COE so the
    // denormalized value on the row stays in sync. Best-effort: a COE failure
    // leaves board_type unchanged rather than blocking the edit.
    let resolvedBoardType: string | null | undefined;
    if (patch.board_id) {
      try {
        const { data: existingForInst } = await supabase
          .from('bos_compositions')
          .select('institutions_id')
          .eq('id', id)
          .maybeSingle();
        const instId =
          (patch as { institutions_id?: string }).institutions_id ??
          (existingForInst as { institutions_id?: string } | null)?.institutions_id;
        if (instId) {
          const { fetchCoeBoardMap } = await import('@/lib/utils/bos/coe-boards');
          const boardMap = await fetchCoeBoardMap(instId);
          resolvedBoardType = boardMap.get(patch.board_id)?.board_type ?? null;
        }
      } catch (boardLookupErr) {
        console.warn('[bos/compositions/[id]] board_type re-lookup failed:', boardLookupErr);
      }
    }

    const payload = {
      ...patch,
      ...(resolvedBoardType !== undefined ? { board_type: resolvedBoardType } : {}),
      ratified_date: patch.ratified_date || null,
      term_end_date: patch.term_end_date || null,
      constituted_by: patch.constituted_by || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bos_compositions')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
      }
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'A composition for this board already exists for the selected term start date.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[bos/compositions/[id]] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update composition' }, { status: 500 });
  }
}

// ── DELETE /api/bos/compositions/[id] ────────────────────────────────────────
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

    // Chairman OR creator: same loosening as PUT — the creator can delete
    // their own freshly-made composition if they hit a wrong-board mistake
    // before members are added.
    const scope = await resolveBosBoardScope(user.id);
    const { data: existing } = await supabase
      .from('bos_compositions')
      .select('created_by')
      .eq('id', id)
      .maybeSingle();
    const isCreator =
      (existing as { created_by?: string | null } | null)?.created_by === user.id;

    if (!scope.isSuperAdmin && !isCreator) {
      const deny = guardCompositionChairman(scope, id);
      if (deny) return NextResponse.json({ error: deny }, { status: 403 });
    }

    const { error } = await supabase.from('bos_compositions').delete().eq('id', id);

    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[bos/compositions/[id]] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete composition' }, { status: 500 });
  }
}
