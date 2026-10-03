export const dynamic = 'force-dynamic';

// GET    /api/hr/recruitment/intake/batches/:id → { batch, rows, open_jobs, skipped_files }
// DELETE /api/hr/recruitment/intake/batches/:id → { ok: true, removed_files }
//        Discards the batch: its rows and resume copies. Applications already
//        filed from it stay. Only the uploader, or a super admin.

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { discardBatch, getBatch } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse } from '../../_lib/context';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    return NextResponse.json(await getBatch(gate.deps, id));
  } catch (err) {
    return intakeErrorResponse('GET batch', err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    return NextResponse.json(await discardBatch(gate.deps, gate.actor, id));
  } catch (err) {
    return intakeErrorResponse('DELETE batch', err);
  }
}
