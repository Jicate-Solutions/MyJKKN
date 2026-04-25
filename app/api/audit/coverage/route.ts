export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditCoverageService } from '@/lib/services/audit';

/**
 * GET /api/audit/coverage?cycle_id=<uuid>&body=<NAAC|...>&institution_id=<uuid>
 *
 * Returns one CoverageCell per (body × institution) pair for the given cycle.
 * Optional filters:
 *   - body: restrict to a single body code (case-insensitive)
 *   - institution_id: restrict to a single institution within cycle scope
 */
export async function GET(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get('cycle_id');
    if (!cycleId) {
      return NextResponse.json(
        { error: 'Missing required query param: cycle_id' },
        { status: 400 }
      );
    }

    const body = searchParams.get('body') ?? undefined;
    const institutionId = searchParams.get('institution_id') ?? undefined;

    const cells = await AuditCoverageService.getForCycle(cycleId, {
      body,
      institutionId,
    });

    return NextResponse.json({
      data: cells,
      metadata: {
        cycle_id: cycleId,
        body: body ? body.toUpperCase() : null,
        institution_id: institutionId ?? null,
        count: cells.length,
      },
    });
  } catch (error) {
    console.error('[audit/coverage] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
