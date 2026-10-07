// DELETE /api/hr/recruitment/intake/rules/:id → { ok: true }

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { deleteRule } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse } from '@/app/api/hr/recruitment/intake/_lib/context';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    await deleteRule(gate.deps, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return intakeErrorResponse('DELETE rule', err);
  }
}
