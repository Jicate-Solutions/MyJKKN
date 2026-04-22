export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditAttestationService } from '@/lib/services/audit';
import type { SignAttestationDto } from '@/lib/types/audit';

export async function POST(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as SignAttestationDto;

    if (!body.audit_cycle_id || !body.parameter_code || !body.institution_id || !body.attestation) {
      return NextResponse.json(
        { error: 'Missing required fields: audit_cycle_id, parameter_code, institution_id, attestation' },
        { status: 400 }
      );
    }

    try {
      const attestation = await AuditAttestationService.sign(body, { userId: session.user.id });
      return NextResponse.json({ data: attestation, metadata: { signed: true } }, { status: 200 });
    } catch (signErr) {
      // Thrash T3 optimistic-lock conflict → 409
      const msg = signErr instanceof Error ? signErr.message : String(signErr);
      if (msg.includes('modified by someone else') || msg.includes('just modified')) {
        return NextResponse.json({ error: msg, code: 'VERSION_CONFLICT' }, { status: 409 });
      }
      // Thrash T9 NAAC/NBA cosign enforcement → 422
      if (msg.includes('CAO and CEO co-signatures')) {
        return NextResponse.json({ error: msg, code: 'MISSING_COSIGNATURES' }, { status: 422 });
      }
      throw signErr;
    }
  } catch (error) {
    console.error('[audit/attestations/sign] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
