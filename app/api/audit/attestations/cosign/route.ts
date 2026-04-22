export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditAttestationService } from '@/lib/services/audit';
import type { CosignAttestationDto } from '@/lib/types/audit';

const VALID_ROLES: CosignAttestationDto['role'][] = ['cao', 'ceo', 'md_caio'];

/**
 * POST /api/audit/attestations/cosign
 *
 * Adds a cosignature to an existing attestation. Used by CAO/CEO/MD-CAIO to
 * satisfy the NAAC/NBA cosign requirement (thrash T9). Optimistic lock via
 * expected_updated_at (thrash T3).
 *
 * Error codes:
 *   409 VERSION_CONFLICT — optimistic lock miss
 *   400 validation
 *   404 attestation not found
 */
export async function POST(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as CosignAttestationDto;

    if (!body.attestation_id || !body.role) {
      return NextResponse.json(
        { error: 'Missing required fields: attestation_id, role' },
        { status: 400 }
      );
    }
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` },
        { status: 400 }
      );
    }

    try {
      const attestation = await AuditAttestationService.cosign(body, {
        userId: session.user.id,
      });
      return NextResponse.json(
        { data: attestation, metadata: { cosigned_role: body.role } },
        { status: 200 }
      );
    } catch (cosignErr) {
      const msg = cosignErr instanceof Error ? cosignErr.message : String(cosignErr);
      if (msg.includes('modified by someone else')) {
        return NextResponse.json(
          { error: msg, code: 'VERSION_CONFLICT' },
          { status: 409 }
        );
      }
      // PostgREST "No rows" or not-found shape
      if (
        msg.toLowerCase().includes('no rows') ||
        msg.toLowerCase().includes('not found')
      ) {
        return NextResponse.json(
          { error: 'Attestation not found' },
          { status: 404 }
        );
      }
      throw cosignErr;
    }
  } catch (error) {
    console.error('[audit/attestations/cosign] POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
