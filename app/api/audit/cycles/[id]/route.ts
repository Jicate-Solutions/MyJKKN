export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditCycleService } from '@/lib/services/audit';
import type { AuditCyclePhase } from '@/lib/types/audit';

const VALID_PHASES: AuditCyclePhase[] = [
  'draft',
  'in-progress',
  'rectification',
  'peer-visit',
  'closed',
];

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cycle = await AuditCycleService.get(params.id);
    if (!cycle) {
      return NextResponse.json({ error: 'Audit cycle not found' }, { status: 404 });
    }

    return NextResponse.json({ data: cycle, metadata: { id: params.id } });
  } catch (error) {
    console.error('[audit/cycles/:id] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as { phase?: AuditCyclePhase };
    if (!body.phase) {
      return NextResponse.json(
        { error: 'Missing required field: phase' },
        { status: 400 }
      );
    }
    if (!VALID_PHASES.includes(body.phase)) {
      return NextResponse.json(
        { error: `Invalid phase. Must be one of: ${VALID_PHASES.join(', ')}` },
        { status: 400 }
      );
    }

    try {
      const cycle = await AuditCycleService.transitionPhase(params.id, body.phase);
      return NextResponse.json({ data: cycle, metadata: { phase: body.phase } });
    } catch (transitionErr) {
      const msg = transitionErr instanceof Error ? transitionErr.message : String(transitionErr);
      if (msg.includes('not found')) {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      throw transitionErr;
    }
  } catch (error) {
    console.error('[audit/cycles/:id] PATCH error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Service enforces creator+draft rule; RLS backstops with
    //   USING ((created_by = auth.uid() AND phase = 'draft') OR is_super_admin())
    try {
      await AuditCycleService.deleteDraft(params.id);
      return NextResponse.json(
        { data: { id: params.id, deleted: true }, metadata: { deleted: true } },
        { status: 200 }
      );
    } catch (deleteErr) {
      const msg = deleteErr instanceof Error ? deleteErr.message : String(deleteErr);
      if (msg.includes('not found')) {
        return NextResponse.json({ error: msg }, { status: 404 });
      }
      if (msg.includes('Only draft cycles')) {
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      throw deleteErr;
    }
  } catch (error) {
    console.error('[audit/cycles/:id] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
