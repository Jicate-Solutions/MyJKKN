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

    // BOARD-SCOPED TAXONOMY (CAS-agnostic resolution).
    // A regulation spans multiple boards; each board may use a different
    // framework. We resolve purely by regulation_id (ignoring the caller's
    // institution — same as before), then pick the row by board with a
    // regulation-wide fallback:
    //   1. if ?boardId= is supplied, prefer the most-recent row for that board;
    //   2. else fall back to the most-recent regulation-wide row (board_id NULL).
    //
    // CAS pairs (Aided + Self) historically produced TWO physical rows per
    // (regulation, board) that could drift apart. Returning the MOST-RECENTLY-
    // SAVED row within the chosen grain makes every reader agree; the companion
    // POST writes all sibling rows together so they converge after the next save.
    const boardId = new URL(request.url).searchParams.get('boardId') || null;

    const { data: rows, error } = await supabase
      .from('bos_regulation_taxonomies')
      .select('*')
      .eq('regulation_id', regulationId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[GET /api/bos/taxonomy/[regulationId]] Query error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch taxonomy' },
        { status: 500 }
      );
    }

    // Board-first, then regulation-wide (board_id NULL) fallback. Rows are already
    // ordered most-recent-first, so .find() returns the freshest match per grain.
    const boardRow = boardId
      ? (rows ?? []).find((r) => r.board_id === boardId)
      : undefined;
    const regWideRow = (rows ?? []).find((r) => r.board_id == null);
    const data = boardRow ?? regWideRow ?? null;

    // Return empty taxonomy if not found (don't 404).
    // POs/PSOs now live in bos_programme_outcomes/bos_programme_specific_outcomes tables,
    // so missing bos_regulation_taxonomies is not an error.
    if (!data) {
      return NextResponse.json({
        id: null,
        regulation_id: regulationId,
        institutions_id: null,
        board_id: boardId,
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
 *   taxonomy_type: 'finks' | 'blooms' | 'jkkn_advanced' | 'custom',
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
      // null/omitted => the regulation-wide default row; a value => that board's override.
      board_id?: string | null;
      taxonomy_type: string;
      // Optional — when omitted, the server derives k_values from the master
      // taxonomy levels (bos_taxonomy_levels) for this institution + framework.
      k_values?: Record<string, string>;
      // pos/psos kept for backward compat; POs are now stored in bos_programme_outcomes
      pos?: Record<string, unknown>;
      psos?: Record<string, unknown>;
    };

    const boardId: string | null = body.board_id ?? null;

    // Step 4: Validate required fields (k_values is optional — derived below)
    if (!body.taxonomy_type) {
      return NextResponse.json(
        { error: 'Missing required field: taxonomy_type' },
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

    // Step 4b: Resolve k_values. Prefer the client-supplied map; otherwise derive
    // it from the master framework's levels so simple callers can send just a code.
    let kValues = body.k_values;
    if (!kValues || Object.keys(kValues).length === 0) {
      const { data: framework } = await supabase
        .from('bos_taxonomy')
        .select('id')
        .eq('institutions_id', institutionsId)
        .eq('code', body.taxonomy_type)
        .maybeSingle();
      if (framework?.id) {
        const { data: levels } = await supabase
          .from('bos_taxonomy_levels')
          .select('code, name, sort_order')
          .eq('taxonomy_id', framework.id)
          .order('sort_order', { ascending: true });
        kValues = {};
        for (const l of levels ?? []) kValues[l.code] = l.name;
      }
    }
    if (!kValues || Object.keys(kValues).length === 0) {
      return NextResponse.json(
        { error: `No levels found for framework "${body.taxonomy_type}". Configure it in Taxonomy Frameworks first.` },
        { status: 400 }
      );
    }

    // Step 5: Guard institution write
    const writeError = guardInstitutionWrite(scope, institutionsId);
    if (writeError) {
      return NextResponse.json({ error: writeError }, { status: 403 });
    }

    // Step 6: Find existing rows for this (regulation, board) grain across every
    // CAS sibling institution. We converge siblings WITHIN a board grain, not the
    // whole regulation — so a per-board override never overwrites the
    // regulation-wide default (board_id NULL) or another board's row.
    let existingQuery = supabase
      .from('bos_regulation_taxonomies')
      .select('id')
      .eq('regulation_id', regulationId);
    existingQuery = boardId == null
      ? existingQuery.is('board_id', null)
      : existingQuery.eq('board_id', boardId);
    const { data: existingRows } = await existingQuery;

    // Step 7: Upsert taxonomy
    if (existingRows && existingRows.length > 0) {
      // Update every sibling row in this board grain so CAS Aided/Self converge to
      // one framework (prevents the Fink's-under-A / Bloom's-under-B drift that
      // made the form and PDF disagree).
      let updateQuery = supabase
        .from('bos_regulation_taxonomies')
        .update({
          taxonomy_type: body.taxonomy_type,
          k_values: kValues,
          pos: body.pos ?? {},
          psos: body.psos ?? null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('regulation_id', regulationId);
      updateQuery = boardId == null
        ? updateQuery.is('board_id', null)
        : updateQuery.eq('board_id', boardId);
      const { data: updated, error: updateError } = await updateQuery.select();

      if (updateError) {
        console.error('[POST /api/bos/taxonomy/[regulationId]] Update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update taxonomy' },
          { status: 500 }
        );
      }

      return NextResponse.json((updated?.[0] ?? null) as BosRegulationTaxonomy);
    } else {
      // Create new
      const { data: created, error: insertError } = await supabase
        .from('bos_regulation_taxonomies')
        .insert({
          institutions_id: institutionsId,
          regulation_id: regulationId,
          board_id: boardId,
          taxonomy_type: body.taxonomy_type,
          k_values: kValues,
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

/**
 * DELETE /api/bos/taxonomy/[regulationId]?boardId=<id>
 *
 * Removes a BOARD OVERRIDE so that board falls back to the regulation-wide
 * default. Requires a non-null boardId — the regulation-wide row (board_id NULL)
 * cannot be deleted here (it is the fallback every board depends on).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ regulationId: string }> }
) {
  try {
    const { regulationId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const boardId = new URL(request.url).searchParams.get('boardId');
    if (!boardId) {
      return NextResponse.json(
        { error: 'boardId is required — the regulation-wide default cannot be deleted.' },
        { status: 400 }
      );
    }

    // Guard write against the institution(s) that own the override rows.
    const scope = await resolveBosAccess(user.id);
    const { data: targetRows } = await supabase
      .from('bos_regulation_taxonomies')
      .select('institutions_id')
      .eq('regulation_id', regulationId)
      .eq('board_id', boardId);

    if (!targetRows || targetRows.length === 0) {
      // Nothing to delete — already inheriting the default. Idempotent success.
      return NextResponse.json({ deleted: 0 });
    }

    for (const row of targetRows) {
      const writeError = guardInstitutionWrite(scope, row.institutions_id);
      if (writeError) {
        return NextResponse.json({ error: writeError }, { status: 403 });
      }
    }

    const { error: delError, count } = await supabase
      .from('bos_regulation_taxonomies')
      .delete({ count: 'exact' })
      .eq('regulation_id', regulationId)
      .eq('board_id', boardId);

    if (delError) {
      console.error('[DELETE /api/bos/taxonomy/[regulationId]] Delete error:', delError);
      return NextResponse.json({ error: 'Failed to remove board override' }, { status: 500 });
    }

    return NextResponse.json({ deleted: count ?? targetRows.length });
  } catch (error) {
    console.error('[DELETE /api/bos/taxonomy/[regulationId]] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
