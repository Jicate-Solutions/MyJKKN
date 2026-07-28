import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveBosBoardScope, resolveCoeInstitutionCode, resolveCoeInstitutionById, hasAnyBosPermission, isBosReadAllObserver, BOS_LOOKUP_VIEW_KEYS } from '@/lib/utils/bos/bos-access';

interface CoeBoard {
  id: string;
  board_code: string;
  board_name: string;
  board_type?: string | null;
  institutions_id?: string;
  is_active?: boolean;
}

// ── GET /api/bos/boards ───────────────────────────────────────────────────────
// Returns boards for a given institution from the COE API.
// Query param: institutionsId (MyJKKN UUID)
// Super-admin may query any institution; regular users can query their own
// institution or CAS siblings (institutions with the same counselling_code).
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const scope = await resolveBosBoardScope(user.id);
    // Read-only observer: a role holding ANY BoS lookup view grant (courses/
    // scheme/syllabus — see BOS_LOOKUP_VIEW_KEYS) may read any institution's
    // boards, like a super-admin. VIEW ONLY — only the scope gate is relaxed;
    // the COE/MyJKKN id resolution below is untouched.
    const hasView = await hasAnyBosPermission(user.id, BOS_LOOKUP_VIEW_KEYS);
    const canReadAllBos = isBosReadAllObserver(scope, hasView);
    const seeAll = scope.isSuperAdmin || canReadAllBos;
    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get('institutionsId');

    // The requested id may live in EITHER id space:
    //   • a MyJKKN institution UUID — scope-based callers (sidebar, scope strip)
    //   • a COE institution UUID    — the course edit page derives it from the
    //     COE course record's `institutions_id`, which is a COE id, not a
    //     MyJKKN one. Passing it raw used to fail the MyJKKN-only check below
    //     and return an empty list ("No boards available for this institution").
    // Resolve to a COE institution_code (the natural key /api/public/boards
    // wants) plus the MyJKKN UUIDs it bridges to (for authorization).
    async function resolveTarget(
      id: string,
    ): Promise<{ code: string; myJkknIds: string[] } | null> {
      const codeFromMyJkkn = await resolveCoeInstitutionCode(id);
      if (codeFromMyJkkn) return { code: codeFromMyJkkn, myJkknIds: [id] };
      const coe = await resolveCoeInstitutionById(id);
      if (coe) return { code: coe.institution_code, myJkknIds: coe.myjkkn_institution_ids };
      return null;
    }

    let target: { code: string; myJkknIds: string[] } | null = null;

    if (requestedId) {
      const resolved = await resolveTarget(requestedId);
      // Super-admin may query any institution; others only if the resolved
      // institution maps to one of their (CAS-expanded) MyJKKN institutions.
      const authorized =
        !!resolved &&
        (seeAll ||
          resolved.myJkknIds.some((mid) => scope.allInstitutionIds.includes(mid)));
      if (authorized) target = resolved;
    }

    // Fall back to the caller's own institution when no id was supplied, or the
    // requested one couldn't be resolved/authorized. Keeps the edit page
    // working for non-super-admins even if the COE id can't be mapped, and
    // never leaks a foreign institution's boards.
    if (!target && !seeAll && scope.institutionsId) {
      const code = await resolveCoeInstitutionCode(scope.institutionsId);
      if (code) target = { code, myJkknIds: [scope.institutionsId] };
    }

    if (!target) {
      return NextResponse.json({ data: [], count: 0 });
    }

    const institutionCode = target.code;

    const coe = CoeRestClient.create();
    let raw: unknown;
    try {
      raw = await coe.get<unknown>('/api/public/boards', {
        institution_code: institutionCode,
      });
    } catch (coeErr) {
      if (coeErr instanceof CoeApiError && coeErr.status === 404) {
        console.warn('[GET /api/bos/boards] COE /api/public/boards 404 for institution_code=%s (requestedId=%s)', institutionCode, requestedId);
        return NextResponse.json({ data: [], count: 0 });
      }
      throw coeErr;
    }

    // COE's envelope has drifted between shapes over time. Extract the board
    // array from whichever known shape arrives, and NEVER let a non-array slip
    // through — a non-array `data` would crash every consumer that does
    // `boardsRaw.map(...)` (the composition edit form, the service, etc.).
    const extractBoards = (value: unknown): CoeBoard[] => {
      if (Array.isArray(value)) return value as CoeBoard[];
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (Array.isArray(obj.data)) return obj.data as CoeBoard[];
        if (Array.isArray(obj.boards)) return obj.boards as CoeBoard[];
        // Nested one level deeper, e.g. { data: { boards: [...] } }.
        if (obj.data && typeof obj.data === 'object') {
          const inner = obj.data as Record<string, unknown>;
          if (Array.isArray(inner.boards)) return inner.boards as CoeBoard[];
        }
      }
      console.warn('[GET /api/bos/boards] Unexpected COE response shape for institution_code=%s', institutionCode);
      return [];
    };
    const boards = extractBoards(raw);

    return NextResponse.json({ data: boards, count: boards.length });
  } catch (error) {
    console.error('[GET /api/bos/boards]', error);
    return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
  }
}
