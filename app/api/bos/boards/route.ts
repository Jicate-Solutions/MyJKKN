import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import { resolveBosAccess } from '@/lib/utils/bos/bos-access';

interface CoeInstitution {
  id: string;
  institution_code: string;
  name: string;
  myjkkn_institution_ids: string[] | null;
  is_active: boolean;
}

interface BoardItem {
  id: string;
  board_code: string;
  board_name: string;
  board_type: string | null;
  display_name?: string | null;
  institutions_id?: string;
}

// ── GET /api/bos/boards ──────────────────────────────────────────────────────
// Returns BoS boards for the institution dropdowns.
//
// Mapping: BoS forms send a MyJKKN institutions_id (the FK used inside
// MyJKKN's bos_* tables). Boards live in COE under a COE institutions_id.
// We translate via COE.institutions.myjkkn_institution_ids so the form layer
// keeps speaking MyJKKN UUIDs while the storage layer (board) speaks COE.
//
// We deliberately call COE's already-live `/api/public/boards` (not v1/boards)
// because COE's middleware gates /api/master/* behind a session cookie that
// our server-to-server CoeRestClient cannot supply. /api/public/* is on the
// `publicApiRoutes` allowlist (COE middleware.ts), accepts `institution_code`,
// and returns the same `board` rows — making this resilient to the COE dev
// server not hot-reloading the freshly-added /api/v1/boards file.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosAccess(user.id);
    const { searchParams } = new URL(request.url);

    const myjkknInstitutionsId = scope.isSuperAdmin
      ? (searchParams.get('institutionsId') ?? undefined)
      : scope.institutionsId ?? undefined;

    if (!myjkknInstitutionsId) {
      return NextResponse.json([]);
    }

    const coe = CoeRestClient.create();

    // ── 1. Resolve MyJKKN institutions_id → COE institution(s) ─────────────
    const coeInstitutions = await coe.get<CoeInstitution[]>('/api/v1/institutions');
    const matchedCoeInstitutions = (coeInstitutions ?? []).filter((ci) =>
      (ci.myjkkn_institution_ids ?? []).includes(myjkknInstitutionsId),
    );

    if (matchedCoeInstitutions.length === 0) {
      return NextResponse.json([]);
    }

    // ── 2. Fetch boards for each matched COE institution_code and merge ────
    // /api/public/boards filters by `institution_code` and prepends a synthetic
    // `{id:'none', ...}` row used by an unrelated public form — we strip it.
    const allBoards: BoardItem[] = [];
    const seen = new Set<string>();

    for (const ci of matchedCoeInstitutions) {
      if (!ci.institution_code) continue;
      const boards = await coe
        .get<BoardItem[]>('/api/public/boards', {
          institution_code: ci.institution_code,
        })
        .catch(() => [] as BoardItem[]);

      for (const b of boards ?? []) {
        if (b.id === 'none' || seen.has(b.id)) continue;
        seen.add(b.id);
        allBoards.push(b);
      }
    }

    // Sort by board_name for stable dropdown order
    allBoards.sort((a, b) => a.board_name.localeCompare(b.board_name));

    return NextResponse.json(allBoards);
  } catch (error) {
    console.error('[bos/boards] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
  }
}
