import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveBosAccess, guardInstitutionWrite } from '@/lib/utils/bos/bos-access';
import { BosRegulationTaxonomy } from '@/types/bos';

/**
 * GET /api/bos/taxonomy/[regulationId]
 *
 * Fetch taxonomy configuration for a regulation.
 * Includes: K-values, Programme Outcomes (POs), Programme Specific Outcomes (PSOs).
 *
 * Query parameters:
 * - institutionsId (override for super admin)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ regulationId: string }> }
) {
  try {
    // Step 0: Await params (Next.js 16 requirement)
    const { regulationId } = await params;

    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Parse query parameters
    const { searchParams } = new URL(request.url);

    // 4-level fallback — mirrors POST handler so GET never runs without an institution filter.
    // Without a filter, maybeSingle() throws PGRST116 if multiple institutions share this regulation.
    let institutionsId: string | null =
      searchParams.get('institutionsId') ||
      scope.institutionsId ||
      scope.userInstitutionId ||
      null;

    if (!institutionsId) {
      const { data: reg } = await supabase
        .from('regulations')
        .select('institution_id')
        .eq('id', regulationId)
        .maybeSingle();
      institutionsId = reg?.institution_id ?? null;
    }

    // For CAS institutions two UUIDs (Aided + Self) share the same counselling_code.
    // The taxonomy may be stored under either sibling UUID, so use allInstitutionIds
    // to do an IN filter rather than an exact match — avoids "not found" false negatives.
    const filterIds: string[] = scope.allInstitutionIds.length > 0
      ? scope.allInstitutionIds
      : (institutionsId ? [institutionsId] : []);

    // Step 4: Build query
    let query = supabase
      .from('bos_regulation_taxonomies')
      .select('*')
      .eq('regulation_id', regulationId);

    if (filterIds.length > 1) {
      query = query.in('institutions_id', filterIds);
    } else if (filterIds.length === 1) {
      query = query.eq('institutions_id', filterIds[0]);
    }

    // Step 5: Execute query
    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[GET /api/bos/taxonomy/[regulationId]] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch taxonomy' },
        { status: 500 }
      );
    }

    // Return empty taxonomy if not found (don't 404).
    // POs/PSOs now live in bos_programme_outcomes/bos_programme_specific_outcomes tables,
    // so missing bos_regulation_taxonomies is not an error.
    if (!data) {
      return NextResponse.json({
        id: null,
        regulation_id: regulationId,
        institutions_id: null,
        taxonomy_type: null,
        k_values: {},
        pos: {},
        psos: null,
        created_at: null,
        updated_at: null,
      } as Partial<BosRegulationTaxonomy>);
    }

    return NextResponse.json(data as BosRegulationTaxonomy);
  } catch (error) {
    console.error('[GET /api/bos/taxonomy/[regulationId]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bos/taxonomy/[regulationId]
 *
 * Create or update taxonomy configuration for a regulation.
 *
 * Body:
 * {
 *   taxonomy_type: 'finks' | 'blooms' | 'custom',
 *   k_values: { K1: "...", K2: "...", ... },
 *   pos?: Record<string, unknown>  (legacy; POs now live in bos_programme_outcomes)
 *   psos?: Record<string, unknown> (legacy; PSOs now live in bos_programme_specific_outcomes)
 * }
 *
 * Returns: Created or updated taxonomy
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ regulationId: string }> }
) {
  try {
    // Step 0: Await params (Next.js 15 requirement)
    const { regulationId } = await params;

    // Step 1: Authenticate user
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 2: Resolve institution scope
    const scope = await resolveBosAccess(user.id);

    // Step 3: Parse request body
    const body = (await request.json()) as {
      institutions_id?: string;
      taxonomy_type: string;
      k_values: Record<string, string>;
      // pos/psos kept for backward compat; POs are now stored in bos_programme_outcomes
      pos?: Record<string, unknown>;
      psos?: Record<string, unknown>;
    };

    // Step 4: Validate required fields (pos is optional — normalized tables are authoritative now)
    if (!body.taxonomy_type || !body.k_values) {
      return NextResponse.json(
        { error: 'Missing required fields: taxonomy_type, k_values' },
        { status: 400 }
      );
    }

    // Super-admin has institutionsId=null by design; fall back to their own institution,
    // then to the regulation's institution as a last resort.
    let institutionsId: string | null =
      body.institutions_id || scope.institutionsId || scope.userInstitutionId || null;

    if (!institutionsId) {
      const { data: reg } = await supabase
        .from('regulations')
        .select('institution_id')
        .eq('id', regulationId)
        .maybeSingle();
      institutionsId = reg?.institution_id ?? null;
    }

    if (!institutionsId) {
      return NextResponse.json(
        { error: 'Cannot determine institution for this regulation.' },
        { status: 400 }
      );
    }

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, institutionsId);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Check if taxonomy already exists — only filter by institutions_id when non-null
    let existingQuery = supabase
      .from('bos_regulation_taxonomies')
      .select('id')
      .eq('regulation_id', regulationId)
      .eq('institutions_id', institutionsId);

    const { data: existing } = await existingQuery.maybeSingle();

    // Step 7: Upsert taxonomy
    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('bos_regulation_taxonomies')
        .update({
          taxonomy_type: body.taxonomy_type,
          k_values: body.k_values,
          pos: body.pos ?? {},
          psos: body.psos ?? null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error('[POST /api/bos/taxonomy/[regulationId]] Update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update taxonomy' },
          { status: 500 }
        );
      }

      return NextResponse.json(updated as BosRegulationTaxonomy);
    } else {
      // Create new
      const { data: created, error: insertError } = await supabase
        .from('bos_regulation_taxonomies')
        .insert({
          institutions_id: institutionsId,
          regulation_id: regulationId,
          taxonomy_type: body.taxonomy_type,
          k_values: body.k_values,
          pos: body.pos ?? {},
          psos: body.psos ?? null,
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error('[POST /api/bos/taxonomy/[regulationId]] Insert error:', insertError);
        return NextResponse.json(
          { error: 'Failed to create taxonomy' },
          { status: 500 }
        );
      }

      return NextResponse.json(created as BosRegulationTaxonomy, { status: 201 });
    }
  } catch (error) {
    console.error('[POST /api/bos/taxonomy/[regulationId]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
