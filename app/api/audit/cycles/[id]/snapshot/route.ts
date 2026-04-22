export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditCycleService } from '@/lib/services/audit';

/**
 * POST /api/audit/cycles/[id]/snapshot
 *
 * Freezes parameter_catalog_snapshot on a DRAFT cycle and transitions it to
 * IN-PROGRESS. Delegates to AuditCycleService.transitionPhase(id, 'in-progress')
 * which reads the live audit_parameter_catalog and persists the snapshot.
 *
 * Idempotent via service — calling on an already in-progress cycle returns
 * the current cycle unchanged (phase check guards snapshot rewrite).
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const current = await AuditCycleService.get(params.id);
    if (!current) {
      return NextResponse.json({ error: 'Audit cycle not found' }, { status: 404 });
    }
    if (current.phase !== 'draft') {
      return NextResponse.json(
        {
          error: `Cannot snapshot a cycle in phase '${current.phase}'. Snapshot requires phase='draft'.`,
        },
        { status: 400 }
      );
    }

    const cycle = await AuditCycleService.transitionPhase(params.id, 'in-progress');
    return NextResponse.json(
      {
        data: cycle,
        metadata: {
          snapshot_taken: true,
          previous_phase: 'draft',
          new_phase: 'in-progress',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[audit/cycles/:id/snapshot] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
