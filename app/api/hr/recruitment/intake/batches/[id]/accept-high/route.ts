export const dynamic = 'force-dynamic';

// POST /api/hr/recruitment/intake/batches/:id/accept-high → { decided }
// Accepts every undecided HIGH-confidence proposal as it stands.

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { acceptHigh } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse } from '../../../_lib/context';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    return NextResponse.json(await acceptHigh(gate.deps, gate.actor, id));
  } catch (err) {
    return intakeErrorResponse('POST accept-high', err);
  }
}
