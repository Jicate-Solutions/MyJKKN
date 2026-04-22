export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditAttestationService } from '@/lib/services/audit';
import type { SignAttestationDto } from '@/lib/types/audit';

/**
 * GET /api/audit/attestations?cycle_id=<uuid>
 *
 * Returns all attestations for a cycle (one per parameter × institution).
 * RLS scopes result by role / institution access.
 */
export async function GET(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const cycleId = searchParams.get('cycle_id');
    if (!cycleId) {
      return NextResponse.json(
        { error: 'Missing required query param: cycle_id' },
        { status: 400 }
      );
    }

    const attestations = await AuditAttestationService.list(cycleId);
    return NextResponse.json({
      data: attestations,
      metadata: { cycle_id: cycleId, count: attestations.length },
    });
  } catch (error) {
    console.error('[audit/attestations] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audit/attestations
 *
 * Upsert-style sign endpoint — alternative to /attestations/sign which exists
 * for clarity but both funnel into AuditAttestationService.sign. Kept here so
 * REST clients that expect "POST to collection to create" work naturally.
 *
 * Error mapping matches /sign route:
 *   409 VERSION_CONFLICT — optimistic lock miss (thrash T3)
 *   422 MISSING_COSIGNATURES — NAAC/NBA sign blocked by DB cosign check (thrash T9)
 *   400 validation
 */
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
        {
          error:
            'Missing required fields: audit_cycle_id, parameter_code, institution_id, attestation',
        },
        { status: 400 }
      );
    }

    try {
      const attestation = await AuditAttestationService.sign(body, {
        userId: session.user.id,
      });
      return NextResponse.json(
        { data: attestation, metadata: { signed: true } },
        { status: 201 }
      );
    } catch (signErr) {
      const msg = signErr instanceof Error ? signErr.message : String(signErr);
      if (msg.includes('modified by someone else') || msg.includes('just modified')) {
        return NextResponse.json(
          { error: msg, code: 'VERSION_CONFLICT' },
          { status: 409 }
        );
      }
      if (msg.includes('CAO and CEO co-signatures')) {
        return NextResponse.json(
          { error: msg, code: 'MISSING_COSIGNATURES' },
          { status: 422 }
        );
      }
      throw signErr;
    }
  } catch (error) {
    console.error('[audit/attestations] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
