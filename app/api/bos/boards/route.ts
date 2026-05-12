import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CoeRestClient, CoeApiError } from '@/lib/services/coe/coe-rest-client';
import { resolveBosAccess, resolveCoeInstitutionId } from '@/lib/utils/bos/bos-access';

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
// Super-admin may query any institution; others locked to their own scope.
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

    const targetMyJkknId = scope.isSuperAdmin
      ? (institutionsId ?? null)
      : (scope.institutionsId ?? null);

    if (!targetMyJkknId) {
      return NextResponse.json({ data: [], count: 0 });
    }

    const coeInstitutionId = await resolveCoeInstitutionId(targetMyJkknId);
    if (!coeInstitutionId) {
      console.warn('[GET /api/bos/boards] Could not resolve COE institution id for MyJKKN id:', targetMyJkknId);
      return NextResponse.json({ data: [], count: 0 });
    }

    const coe = CoeRestClient.create();
    let raw: unknown;
    try {
      raw = await coe.get<unknown>('/api/v1/boards', {
        institutions_id: coeInstitutionId,
        is_active: 'true',
      });
    } catch (coeErr) {
      // COE returns 404 when the institution has no boards configured — treat as empty.
      if (coeErr instanceof CoeApiError && coeErr.status === 404) {
        console.warn('[GET /api/bos/boards] COE returned 404 for coeInstitutionId=%s (myJkknId=%s) — no boards configured', coeInstitutionId, targetMyJkknId);
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
