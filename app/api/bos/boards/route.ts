import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveBosAccess, resolveCoeInstitutionCode } from '@/lib/utils/bos/bos-access';

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

    const scope = await resolveBosAccess(user.id);
    const { searchParams } = new URL(request.url);
    const institutionsId = searchParams.get('institutionsId');

    // Super-admin can query any institution; regular users can query their own
    // institution or CAS siblings (via allInstitutionIds).
    let targetMyJkknId: string | null = null;
    if (scope.isSuperAdmin) {
      targetMyJkknId = institutionsId ?? null;
    } else if (institutionsId) {
      // User requested a specific institution — allow if it's a CAS sibling.
      targetMyJkknId = scope.allInstitutionIds.includes(institutionsId)
        ? institutionsId
        : null;
    } else {
      // No specific institution requested — use user's default scope.
      targetMyJkknId = scope.institutionsId ?? null;
    }

    if (!targetMyJkknId) {
      return NextResponse.json({ data: [], count: 0 });
    }

    const institutionCode = await resolveCoeInstitutionCode(targetMyJkknId);
    if (!institutionCode) {
      console.warn('[GET /api/bos/boards] Could not resolve COE institution_code for MyJKKN id:', targetMyJkknId);
      return NextResponse.json({ data: [], count: 0 });
    }

    const coe = CoeRestClient.create();
    let raw: unknown;
    try {
      raw = await coe.get<unknown>('/api/public/boards', {
        institution_code: institutionCode,
      });
    } catch (coeErr) {
      if (coeErr instanceof CoeApiError && coeErr.status === 404) {
        console.warn('[GET /api/bos/boards] COE /api/public/boards 404 for institution_code=%s (myJkknId=%s)', institutionCode, targetMyJkknId);
        return NextResponse.json({ data: [], count: 0 });
      }
      throw coeErr;
    }

    const boards: CoeBoard[] = Array.isArray(raw)
      ? (raw as CoeBoard[])
      : (((raw as { data?: CoeBoard[] })?.data) ?? []);

    return NextResponse.json({ data: boards, count: boards.length });
  } catch (error) {
    console.error('[GET /api/bos/boards]', error);
    return NextResponse.json({ error: 'Failed to fetch boards' }, { status: 500 });
  }
}
