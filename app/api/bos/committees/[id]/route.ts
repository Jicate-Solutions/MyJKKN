import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { UpdateBosCommitteeDto } from '@/types/bos';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET /api/bos/committees/[id] ─────────────────────────────────────────────
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('bos_committees')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Committee not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/bos/committees/[id]] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch committee' }, { status: 500 });
  }
}

// ── PUT /api/bos/committees/[id] ─────────────────────────────────────────────
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body: UpdateBosCommitteeDto = await request.json();

    const { data: existing, error: fetchError } = await supabase
      .from('bos_committees')
      .select('id, institutions_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Committee not found' }, { status: 404 });
    }

    const deny =
      guardInstitutionWrite(scope, existing.institutions_id) ??
      // If the caller is moving the committee to another institution, they
      // must be allowed to write there too.
      guardInstitutionWrite(scope, body.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name.trim();
    if (body.short_code !== undefined) update.short_code = body.short_code?.trim() || null;
    if (body.sort_order !== undefined) update.sort_order = body.sort_order;
    if (body.is_active !== undefined) update.is_active = body.is_active;
    if (body.institutions_id !== undefined) update.institutions_id = body.institutions_id;
    // Attach/detach a committee to/from a composition (20260706). Sending
    // composition_id re-parents an existing template committee (composition_id
    // NULL) into a composition — this is how the composition detail page's
    // "Add Committee" picker works. null detaches it back to the template pool.
    if (body.composition_id !== undefined) update.composition_id = body.composition_id;

    const { data, error } = await supabase
      .from('bos_committees')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: 'A committee with this name or short code already exists for this institution.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[PUT /api/bos/committees/[id]] Error:', error);
    const message = (error as { message?: string }).message;
    return NextResponse.json(
      { error: message ?? 'Failed to update committee' },
      { status: 500 }
    );
  }
}

// ── DELETE /api/bos/committees/[id] ──────────────────────────────────────────
// bos_members.committee_id is ON DELETE SET NULL, so deleting a committee
// moves its members to the "General" group rather than deleting them. We block
// the delete when members still reference it so that's an explicit user choice.
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
      .from('bos_committees')
      .select('id, institutions_id')
      .eq('id', id)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) {
      return NextResponse.json({ error: 'Committee not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    const { count } = await supabase
      .from('bos_members')
      .select('id', { count: 'exact', head: true })
      .eq('committee_id', id);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `This committee has ${count} member(s). Remove or reassign them first, or mark the committee inactive instead.`,
        },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('bos_committees')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/bos/committees/[id]] Error:', error);
    const message = (error as { message?: string }).message;
    return NextResponse.json(
      { error: message ?? 'Failed to delete committee' },
      { status: 500 }
    );
  }
}
