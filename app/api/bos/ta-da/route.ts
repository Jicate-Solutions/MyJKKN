import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  resolveBosBoardScope,
  compositionScopeFilter,
  hasBosPermission,
  isBosReadAllObserver,
} from '@/lib/utils/bos/bos-access';

// ── GET /api/bos/ta-da?meetingId= ────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    // View-only observer tier: holder of the view grant who sits on no board reads all institutions (never widens writes).
    const hasView = await hasBosPermission(user.id, 'academic.bos-ta-da.view');
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const scopeFilter = compositionScopeFilter(scope, canReadAllBos);

    // No BoS access at all → empty list (no DB hit).
    if (scopeFilter.kind === 'none') {
      return NextResponse.json([]);
    }

    const { searchParams } = new URL(request.url);
    const meetingId = searchParams.get('meetingId');
    const boardId = searchParams.get('boardId');
    const claimStatus = searchParams.get('claimStatus');

    // Institution filter resolution — always operates on the institution_code /
    // counselling_code natural key, which dedups CAS Aided+SF (two MyJKKN UUIDs,
    // one code). The local `institutions_id` column is a UUID, so we expand to
    // the full sibling list and filter `IN (uuids)`.
    //
    // Client convention (see hooks/bos/use-bos-institution-scope.ts): the client
    // resolves the picker's chosen UUID through `useBosInstitutionScope` and
    // sends the full CAS sibling list as a CSV in `?institutionsIds=<csv>` —
    // same convention used by /bos/compositions and /api/bos/lookup/facilitators.
    //
    //   - super-admin: prefer ?institutionsIds= CSV; if only the legacy
    //     ?institutionsId= singular is present, expand it server-side via COE
    //     as a defense layer.
    //   - principal:   scopeFilter.ids (resolveBosAccess already expanded via COE)
    //   - board member: skip — the composition_id join below is the authoritative scope,
    //     and forcing institutions_id = primary breaks cross-institution board memberships
    let institutionIdsFilter: string[] = [];
    if (scope.isSuperAdmin) {
      const csv = searchParams.get('institutionsIds');
      if (csv) {
        institutionIdsFilter = csv.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        const single = searchParams.get('institutionsId');
        if (single) {
          try {
            const { resolveInstitutionContext } = await import(
              '@/lib/utils/institutions/institution-resolver'
            );
            const ctx = await resolveInstitutionContext(single, supabase);
            institutionIdsFilter =
              ctx?.myjkkn_institution_ids && ctx.myjkkn_institution_ids.length > 0
                ? ctx.myjkkn_institution_ids
                : [single];
          } catch {
            institutionIdsFilter = [single];
          }
        }
      }
    } else if (scopeFilter.kind === 'byInstitution') {
      institutionIdsFilter = scopeFilter.ids;
    }

    // Composition embed becomes !inner whenever we need to filter on a column
    // that lives on it (board membership scope) or on its parent composition
    // (boardId filter). Otherwise we omit the embed entirely to keep the
    // response shape minimal.
    const needsCompositionJoin =
      scopeFilter.kind === 'byComposition' || !!boardId;
    // `meeting:` is a second, ALIASED embed of the same bos_meetings
    // relationship (PostgREST allows this) carrying the convening council for
    // the printed claim form; the unaliased !inner embed stays dedicated to
    // filtering so the .eq('bos_meetings...') paths below keep working.
    const meetingEmbed =
      'meeting:bos_meetings ( id, meeting_type, committee:bos_committees ( name ) )';
    const selectClause = needsCompositionJoin
      ? `
        *,
        bos_meetings!inner ( composition_id, bos_compositions!inner ( board_id ) ),
        ${meetingEmbed},
        member:bos_members (
          id, display_name, display_designation, display_institution, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `
      : `
        *,
        ${meetingEmbed},
        member:bos_members (
          id, display_name, display_designation, display_institution, member_type,
          contact_no, email, staff_id,
          staff:staff ( id, phone )
        ),
        expert:bos_external_experts ( id, name, title, designation, institution_name, email, contact_no )
      `;

    // Observer bypasses board-scoped RLS via service-role; route-level authz above is the source of truth.
    const readDb = canReadAllBos ? createServiceRoleClient() : supabase;
    let query = readDb
      .from('bos_ta_da_claims')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (meetingId) query = query.eq('meeting_id', meetingId);
    if (claimStatus) query = query.eq('claim_status', claimStatus);

    if (institutionIdsFilter.length === 1) {
      query = query.eq('institutions_id', institutionIdsFilter[0]);
    } else if (institutionIdsFilter.length > 1) {
      query = query.in('institutions_id', institutionIdsFilter);
    }

    // Board-membership scope.
    //  - 'all'           : super-admin — no filter
    //  - 'byInstitution' : principal — handled by institutionIdsFilter above (CAS-aware)
    //  - 'byComposition' : member/chairman — join filter on parent meeting
    if (scopeFilter.kind === 'byComposition') {
      query = query.in('bos_meetings.composition_id', scopeFilter.ids);
    }

    // Board filter — joins through bos_meetings.bos_compositions.board_id.
    // Independent of scope filter; both can apply simultaneously.
    if (boardId) {
      query = query.eq('bos_meetings.bos_compositions.board_id', boardId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Strip the bos_meetings embed used purely as a join-filter — the client
    // contract didn't include it before, and shape parity matters here.
    const normalized = (data ?? []).map((row: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { bos_meetings: _join, ...rest } = row;
      return rest;
    });

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('[bos/ta-da] GET error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch TA/DA claims';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/bos/ta-da is intentionally not exported.
// As of 2026-05-21 SOP redesign, TA/DA claims are auto-generated by
// POST /api/bos/meetings/[id]/attendance — manual claim creation has
// been retired. Removing the export turns "no manual create" into a
// real system invariant (curl can't bypass it), not just a UI convention.
