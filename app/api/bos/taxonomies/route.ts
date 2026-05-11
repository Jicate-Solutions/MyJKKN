import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import {
  BosTaxonomyFilters,
  BosTaxonomySummary,
  CreateBosTaxonomyDto,
} from '@/types/bos';

/**
 * GET /api/bos/taxonomies
 * List taxonomy frameworks for the user's institution (or a chosen institution
 * for super-admin). Each row includes a level_count so the list view can show
 * how many K-values / dimensions each framework defines.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const { searchParams } = new URL(request.url);

    const filters: BosTaxonomyFilters = {
      institutionsId: scope.isSuperAdmin
        ? searchParams.get('institutionsId') ?? undefined
        : scope.institutionsId ?? undefined,
      isActive: searchParams.has('isActive')
        ? searchParams.get('isActive') === 'true'
        : undefined,
      search: searchParams.get('search') ?? undefined,
      page: searchParams.has('page') ? parseInt(searchParams.get('page')!) : 1,
      limit: searchParams.has('limit') ? parseInt(searchParams.get('limit')!) : 20,
      sortBy: searchParams.get('sortBy') ?? 'name',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') ?? 'asc',
    };

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    // Use an embedded count for the levels relationship; also join institution name.
    let query = supabase
      .from('bos_taxonomy')
      .select('*, bos_taxonomy_levels(count), institutions(name, display_name)', { count: 'exact' });

    if (filters.institutionsId) {
      query = query.eq('institutions_id', filters.institutionsId);
    }
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive);
    }
    if (filters.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
      );
    }

    query = query
      .order(filters.sortBy ?? 'name', { ascending: filters.sortOrder !== 'desc' })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Flatten the embedded count into level_count; extract institution display name.
    const rows: BosTaxonomySummary[] = (data ?? []).map((row: Record<string, unknown>) => {
      const lvls = row.bos_taxonomy_levels as Array<{ count: number }> | undefined;
      const level_count = Array.isArray(lvls) && lvls.length > 0 ? lvls[0].count : 0;
      const inst = row.institutions as { name?: string; display_name?: string } | null | undefined;
      const institution_name = inst?.display_name ?? inst?.name ?? undefined;
      const { bos_taxonomy_levels: _omit, institutions: _omit2, ...rest } = row;
      return { ...(rest as BosTaxonomySummary), level_count, institution_name };
    });

    return NextResponse.json({
      data: rows,
      metadata: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/bos/taxonomies] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch taxonomies' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bos/taxonomies
 * Create a new taxonomy with its levels. Levels are inserted in the same
 * request after the parent so the caller never sees an empty taxonomy.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const body = (await request.json()) as CreateBosTaxonomyDto;

    if (!body.code || !body.name || !Array.isArray(body.levels) || body.levels.length === 0) {
      return NextResponse.json(
        { error: 'code, name, and at least one level are required' },
        { status: 400 }
      );
    }

    let institutionsId =
      body.institutions_id ?? scope.institutionsId ?? scope.userInstitutionId ?? undefined;
    if (!institutionsId) {
      const coeToken = request.cookies.get('access_token')?.value ?? '';
      try {
        const payload = JSON.parse(atob(coeToken.split('.')[1] ?? ''));
        if (typeof payload?.institution_id === 'string') institutionsId = payload.institution_id;
      } catch { /* ignore — malformed token */ }
    }
    if (!institutionsId) {
      return NextResponse.json(
        { error: 'institutions_id is required' },
        { status: 400 }
      );
    }

    const deny = guardInstitutionWrite(scope, institutionsId);
    if (deny) return NextResponse.json({ error: deny }, { status: 403 });

    // Validate levels — codes must be non-empty and unique within the request.
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

    // 1. Insert the parent taxonomy row.
    const { data: created, error: insertError } = await supabase
      .from('bos_taxonomy')
      .insert({
        institutions_id: institutionsId,
        code: body.code.trim(),
        name: body.name.trim(),
        description: body.description ?? null,
        is_hierarchical: body.is_hierarchical ?? true,
        is_active: body.is_active ?? true,
        is_system: false, // user-created rows are never system rows
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      // Likely unique constraint on (institutions_id, code).
      const isConflict = insertError.code === '23505';
      console.error('[POST /api/bos/taxonomies] insert error:', insertError);
      return NextResponse.json(
        {
          error: isConflict
            ? 'A taxonomy with this code already exists for this institution'
            : 'Failed to create taxonomy',
        },
        { status: isConflict ? 409 : 500 }
      );
    }

    // 2. Insert levels.
    const levelRows = body.levels.map((l, idx) => ({
      taxonomy_id: created.id,
      code: l.code.trim(),
      name: l.name.trim(),
      description: l.description ?? null,
      verb_examples: l.verb_examples ?? [],
      sort_order: l.sort_order ?? idx + 1,
    }));

    const { data: insertedLevels, error: levelsError } = await supabase
      .from('bos_taxonomy_levels')
      .insert(levelRows)
      .select();

    if (levelsError) {
      // Roll back the parent so we don't leave an empty taxonomy behind.
      await supabase.from('bos_taxonomy').delete().eq('id', created.id);
      console.error('[POST /api/bos/taxonomies] levels insert error:', levelsError);
      return NextResponse.json(
        { error: 'Failed to create taxonomy levels' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ...created, levels: insertedLevels ?? [] },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/bos/taxonomies] error:', error);
    return NextResponse.json(
      { error: 'Failed to create taxonomy' },
      { status: 500 }
    );
  }
}
