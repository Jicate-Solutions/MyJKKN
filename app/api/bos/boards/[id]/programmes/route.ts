import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/bos/boards/[id]/programmes
 * List programmes assigned to a board.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id: boardId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data, error } = await supabase
      .from('bos_board_programmes')
      .select('*')
      .eq('board_id', boardId)
      .eq('is_active', true)
      .order('programme_code', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    console.error('[GET /api/bos/boards/[id]/programmes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bos/boards/[id]/programmes
 * Add a programme to a board.
 *
 * Body: { programme_code: string; programme_name?: string }
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id: boardId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);

    const body = (await request.json()) as {
      programme_code: string;
      programme_name?: string;
      institutions_id?: string;
    };

    // institutions_id required for non-admin permission guard
    const institutionsId = body.institutions_id ?? scope.institutionsId ?? null;
    const writeError = guardInstitutionWrite(scope, institutionsId);
    if (writeError) return NextResponse.json({ error: writeError }, { status: 403 });

    if (!body.programme_code?.trim()) {
      return NextResponse.json({ error: 'programme_code is required' }, { status: 400 });
    }

    const { data: created, error: insertError } = await supabase
      .from('bos_board_programmes')
      .upsert(
        {
          board_id: boardId,
          institutions_id: institutionsId,
          programme_code: body.programme_code.trim().toUpperCase(),
          programme_name: body.programme_name?.trim() ?? null,
          is_active: true,
          created_by: user.id,
        },
        { onConflict: 'board_id,programme_code', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/bos/boards/[id]/programmes]', insertError);
      return NextResponse.json({ error: 'Failed to add programme' }, { status: 500 });
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('[POST /api/bos/boards/[id]/programmes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/bos/boards/[id]/programmes?programmeCode=UEN
 * Remove a programme from a board (soft delete via is_active=false).
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id: boardId } = await params;
    const { searchParams } = new URL(request.url);
    const programmeCode = searchParams.get('programmeCode');

    if (!programmeCode) {
      return NextResponse.json({ error: 'programmeCode query param required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const scope = await resolveBosAccess(user.id);

    // Derive institutions_id from an existing programme row (already stored)
    // or fall back to the caller's own scope for non-admins.
    const { data: existingProg } = await supabase
      .from('bos_board_programmes')
      .select('institutions_id')
      .eq('board_id', boardId)
      .limit(1)
      .maybeSingle();

    const institutionsId = existingProg?.institutions_id ?? scope.institutionsId ?? null;
    const writeError = guardInstitutionWrite(scope, institutionsId);
    if (writeError) return NextResponse.json({ error: writeError }, { status: 403 });

    const { error } = await supabase
      .from('bos_board_programmes')
      .update({ is_active: false })
      .eq('board_id', boardId)
      .eq('programme_code', programmeCode.toUpperCase());

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/bos/boards/[id]/programmes]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
