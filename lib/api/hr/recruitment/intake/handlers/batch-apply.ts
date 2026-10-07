// Each filed row is a Drive upload; a large batch takes a while (300 s
// maxDuration on app/api/hr/recruitment/intake/[...path]/route.ts).

// POST /api/hr/recruitment/intake/batches/:id/apply  { row_ids?: string[] }
//   → { results: { row_id, ok, application_id, error }[] }
// Files the rows decided "file under job" through the careers path. Each row
// succeeds or fails on its own; a row already filed reports its application.

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { apply } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse, readJson } from '@/app/api/hr/recruitment/intake/_lib/context';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    const body = await readJson<{ row_ids?: string[] | null }>(request);
    return NextResponse.json(await apply(gate.deps, gate.actor, id, body?.row_ids ?? null));
  } catch (err) {
    return intakeErrorResponse('POST apply', err);
  }
}
