import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { UpdateBosTaxonomyDto } from '@/types/bos';

/**
 * GET /api/bos/taxonomies/[id]
 * Returns a single taxonomy with all its levels (sorted by sort_order, then code).
 */
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
      .from('bos_taxonomy')
      .select('*, levels:bos_taxonomy_levels(*)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[GET /api/bos/taxonomies/[id]] error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch taxonomy' },
        { status: 500 }
      );
    }
    if (!data) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 });
    }

    // Stable order: sort_order asc, then code asc as a tie-breaker.
    const levels = ((data.levels as Array<Record<string, unknown>>) ?? [])
      .slice()
      .sort((a, b) => {
        const ao = (a.sort_order as number) ?? 0;
        const bo = (b.sort_order as number) ?? 0;
        if (ao !== bo) return ao - bo;
        return String(a.code).localeCompare(String(b.code));
      });

    return NextResponse.json({ ...data, levels });
  } catch (error) {
    console.error('[GET /api/bos/taxonomies/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch taxonomy' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/bos/taxonomies/[id]
 * Updates the parent fields and (if provided) replaces the levels list
 * atomically: delete existing levels, insert the new set. System rows are
 * editable but their `is_system` flag and `code` cannot be changed.
 */
export async function PUT(
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

    const scope = await resolveBosAccess(user.id);
    const body = (await request.json()) as UpdateBosTaxonomyDto;

    // Load existing row so we can scope-check the institution and check is_system.
    const { data: existing, error: loadError } = await supabase
      .from('bos_taxonomy')
      .select('id, institutions_id, is_system, code')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !existing) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Build the update patch — never trust the client to flip is_system or change code.
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.description !== undefined) patch.description = body.description ?? null;
    if (body.is_hierarchical !== undefined) patch.is_hierarchical = body.is_hierarchical;
    if (body.is_active !== undefined) patch.is_active = body.is_active;
    patch.updated_by = user.id;

    if (Object.keys(patch).length > 1) {
      const { error: updateError } = await supabase
        .from('bos_taxonomy')
        .update(patch)
        .eq('id', id);
      if (updateError) {
        console.error('[PUT /api/bos/taxonomies/[id]] update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update taxonomy' },
          { status: 500 }
        );
      }
    }

    // Replace levels if a fresh list was sent.
    if (Array.isArray(body.levels)) {
      const codes = body.levels.map((l) => l.code?.trim());
      if (codes.some((c) => !c)) {
        return NextResponse.json(
          { error: 'Every level must have a non-empty code' },
          { status: 400 }
        );
      }
      if (new Set(codes).size !== codes.length) {
        return NextResponse.json(
          { error: 'Level codes must be unique within the taxonomy' },
          { status: 400 }
        );
      }

      const { error: deleteError } = await supabase
        .from('bos_taxonomy_levels')
        .delete()
        .eq('taxonomy_id', id);
      if (deleteError) {
        console.error('[PUT /api/bos/taxonomies/[id]] levels delete error:', deleteError);
        return NextResponse.json(
          { error: 'Failed to update taxonomy levels' },
          { status: 500 }
        );
      }

      const levelRows = body.levels.map((l, idx) => ({
        taxonomy_id: id,
        code: l.code.trim(),
        name: l.name.trim(),
        description: l.description ?? null,
        verb_examples: l.verb_examples ?? [],
        sort_order: l.sort_order ?? idx + 1,
      }));

      const { error: insertError } = await supabase
        .from('bos_taxonomy_levels')
        .insert(levelRows);
      if (insertError) {
        console.error('[PUT /api/bos/taxonomies/[id]] levels insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert taxonomy levels' },
          { status: 500 }
        );
      }
    }

    // Return the fresh row + levels.
    const { data: fresh } = await supabase
      .from('bos_taxonomy')
      .select('*, levels:bos_taxonomy_levels(*)')
      .eq('id', id)
      .single();

    return NextResponse.json(fresh);
  } catch (error) {
    console.error('[PUT /api/bos/taxonomies/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to update taxonomy' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bos/taxonomies/[id]
 * Refuses to delete `is_system = true` rows so users always have at least
 * the seeded Bloom's and Fink's frameworks. Cascade on the FK removes levels.
 */
export async function DELETE(
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

    const scope = await resolveBosAccess(user.id);

    const { data: existing, error: loadError } = await supabase
      .from('bos_taxonomy')
      .select('id, institutions_id, is_system')
      .eq('id', id)
      .maybeSingle();

    if (loadError || !existing) {
      return NextResponse.json({ error: 'Taxonomy not found' }, { status: 404 });
    }

    const deny = guardInstitutionWrite(scope, existing.institutions_id);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    if (existing.is_system) {
      return NextResponse.json(
        { error: 'System taxonomies (Bloom\'s, Fink\'s) cannot be deleted' },
        { status: 409 }
      );
    }

    const { error: delError } = await supabase
      .from('bos_taxonomy')
      .delete()
      .eq('id', id);

    if (delError) {
      console.error('[DELETE /api/bos/taxonomies/[id]] error:', delError);
      return NextResponse.json(
        { error: 'Failed to delete taxonomy' },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[DELETE /api/bos/taxonomies/[id]] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete taxonomy' },
      { status: 500 }
    );
  }
}
