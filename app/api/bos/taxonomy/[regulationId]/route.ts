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
    const institutionsId = searchParams.get('institutionsId') || scope.institutionId;

    // Step 4: Build query
    let query = supabase
      .from('bos_regulation_taxonomies')
      .select('*')
      .eq('regulation_id', regulationId)
      .eq('institutions_id', institutionsId);

    // Step 5: Execute query
    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('[GET /api/bos/taxonomy/[regulationId]] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch taxonomy' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Taxonomy not found for this regulation' },
        { status: 404 }
      );
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
 *   pos: { PO1: "...", PO2: "...", ... },
 *   psos?: { PSO1: "...", PSO2: "...", ... }
 * }
 *
 * Returns: Created or updated taxonomy
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { regulationId: string } }
) {
  try {
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
      pos: Record<string, string>;
      psos?: Record<string, string>;
    };

    // Step 4: Validate required fields
    if (!body.taxonomy_type || !body.k_values || !body.pos) {
      return NextResponse.json(
        { error: 'Missing required fields: taxonomy_type, k_values, pos' },
        { status: 400 }
      );
    }

    const institutionsId = body.institutions_id || scope.institutionId;

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, institutionsId);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Check if taxonomy already exists
    const { data: existing } = await supabase
      .from('bos_regulation_taxonomies')
      .select('id')
      .eq('institutions_id', institutionsId)
      .eq('regulation_id', params.regulationId)
      .maybeSingle();

    // Step 7: Upsert taxonomy
    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('bos_regulation_taxonomies')
        .update({
          taxonomy_type: body.taxonomy_type,
          k_values: body.k_values,
          pos: body.pos,
          psos: body.psos || null,
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
          regulation_id: params.regulationId,
          taxonomy_type: body.taxonomy_type,
          k_values: body.k_values,
          pos: body.pos,
          psos: body.psos || null,
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
