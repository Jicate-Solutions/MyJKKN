import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosMemberTypeDto } from '@/types/bos';
import { resolveBosAccess, guardInstitutionWrite, casSiblingInstitutionIds } from '@/lib/utils/bos/bos-access';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET /api/bos/member-types/[id] ───────────────────────────────────────────
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bos_member_types')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Member type not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/bos/member-types/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch member type' }, { status: 500 });
  }
}

// ── PUT /api/bos/member-types/[id] ───────────────────────────────────────────
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body: UpdateBosMemberTypeDto = await request.json();

    const { data: existing, error: fetchError } = await supabase
      .from('bos_member_types')
      .select('id, institutions_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Member type not found' }, { status: 404 });
    }

    const deny =
      guardInstitutionWrite(scope, existing.institutions_id) ??
      guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // CAS-aware rename guard — mirror of the create route. The DB unique index
    // is per-UUID, so a rename that collides with a name on the sibling CAS
    // institution would slip through and reintroduce a duplicate in the list.
    if (body.name !== undefined && body.name.trim()) {
      const targetInstitution = body.institutions_id ?? existing.institutions_id;
      const siblingIds = await casSiblingInstitutionIds(supabase, targetInstitution);
      const { data: clash } = await supabase
        .from('bos_member_types')
        .select('id')
        .in('institutions_id', siblingIds)
        .ilike('name', body.name.trim())
        .neq('id', id)
        .limit(1);
      if (clash && clash.length > 0) {
        return NextResponse.json(
          { error: 'A member type with this name already exists for this institution.' },
          { status: 409 }
        );
      }
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.base_type !== undefined) update.base_type = body.base_type;
    if (body.sort_order !== undefined) update.sort_order = body.sort_order;
    if (body.is_active !== undefined) update.is_active = body.is_active;
    if (body.institutions_id !== undefined) update.institutions_id = body.institutions_id;

    const { data, error } = await supabase
      .from('bos_member_types')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A member type with this name already exists for this institution.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[PUT /api/bos/member-types/[id]] Error:', error);
    const message = (error as { message?: string }).message;
    return NextResponse.json(
      { error: message ?? 'Failed to update member type' },
      { status: 500 }
    );
  }
}

// ── DELETE /api/bos/member-types/[id] ────────────────────────────────────────
// bos_members.member_type_id is ON DELETE SET NULL; members keep working via
// the legacy member_type column. Still block while referenced so removal is an
// explicit choice (reassign or deactivate instead).
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);

    const { data: existing, error: fetchError } = await supabase
      .from('bos_member_types')
      .select('id, institutions_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Member type not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { count } = await supabase
      .from('bos_members')
      .select('id', { count: 'exact', head: true })
      .eq('member_type_id', id);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `This member type is used by ${count} member(s). Reassign them first, or mark the type inactive instead.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('bos_member_types')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/bos/member-types/[id]] Error:', error);
    const message = (error as { message?: string }).message;
    return NextResponse.json(
      { error: message ?? 'Failed to delete member type' },
      { status: 500 }
    );
  }
}
