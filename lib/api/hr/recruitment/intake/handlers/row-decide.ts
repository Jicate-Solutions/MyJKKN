// POST /api/hr/recruitment/intake/rows/:id/decide  { action, job_id? }
//   → { row, rule, rule_error }
// Records a person's decision. Correcting where a CVViZ title goes teaches a
// match rule credited to them (rule); if that lesson could not be kept the
// decision still stands and rule_error says why.

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { DecideRequest } from '@/types/hr-intake';
import { decide } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse, readJson } from '@/app/api/hr/recruitment/intake/_lib/context';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    const body = await readJson<Partial<DecideRequest>>(request);
    return NextResponse.json(await decide(gate.deps, gate.actor, id, body));
  } catch (err) {
    return intakeErrorResponse('POST decide', err);
  }
}
