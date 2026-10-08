export const dynamic = 'force-dynamic';

// GET /api/hr/recruitment/intake/rules → { rules } (the learned matches this person can see)

import { NextResponse, connection } from 'next/server';
import { listRules } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse } from '../_lib/context';

export async function GET() {
  await connection();
  try {
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    return NextResponse.json({ rules: await listRules(gate.deps) });
  } catch (err) {
    return intakeErrorResponse('GET rules', err);
  }
}
