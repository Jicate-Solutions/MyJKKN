export const dynamic = 'force-dynamic';

// GET /api/hr/recruitment/intake/institutions → { institutions, home_institution_id }
// The colleges this person may file an upload under: every college their own
// access reaches (role_has_institution_access), plus their home college for
// the default. Director ruling 2026-10-01: HR may upload for any of them.

import { NextResponse, connection } from 'next/server';
import { accessibleInstitutions } from '@/lib/services/hr/intake/intake-service';
import { intakeContext, intakeErrorResponse } from '../_lib/context';

export async function GET() {
  await connection();
  try {
    const gate = await intakeContext();
    if (gate instanceof NextResponse) return gate;
    return NextResponse.json({
      institutions: await accessibleInstitutions(gate.deps),
      home_institution_id: gate.actor.institution_id,
    });
  } catch (err) {
    return intakeErrorResponse('GET institutions', err);
  }
}
