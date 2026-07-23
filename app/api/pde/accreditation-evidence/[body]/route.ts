/**
 * PDE Accreditation Evidence — JSON API for accreditation packets.
 * ============================================================================
 *
 * GET /api/pde/accreditation-evidence/{body}?institution_id=<uuid>
 *
 * Returns the aggregated `pde_demonstrations` packet for the given body.
 * Body is case-insensitive and validated against the supported set.
 *
 * Auth:
 *   - Caller must be authenticated.
 *   - Super-admins see all institutions.
 *   - Other roles are RLS-narrowed to their institution via the underlying
 *     `pde_demonstrations` policy. The optional `institution_id` query param
 *     is honored as a filter but RLS will still block cross-institution reads.
 *
 * Phase: PDE Tier 4 T4.5 (2026-05-19).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  PDEAccreditationEvidenceService,
  type AccreditationBodyForEvidence,
} from '@/lib/services/pde-accreditation-evidence-service';

const SUPPORTED_BODIES: AccreditationBodyForEvidence[] = [
  'NAAC',
  'NBA',
  'IQAC',
  'NIRF',
  'QS',
  'DCI',
  'PCI',
  'INC',
  'AICTE',
  'NCTE',
  'UGC',
];

function normalizeBody(raw: string): AccreditationBodyForEvidence | null {
  const upper = raw.toUpperCase() as AccreditationBodyForEvidence;
  return SUPPORTED_BODIES.includes(upper) ? upper : null;
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ body: string }> }
) {
  await connection();
  try {
    const { body: bodyRaw } = await ctx.params;
    const body = normalizeBody(bodyRaw);
    if (!body) {
      return NextResponse.json(
        {
          error: `Unsupported accreditation body: ${bodyRaw}`,
          supported: SUPPORTED_BODIES,
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const institutionId = url.searchParams.get('institution_id');

    const packet = await PDEAccreditationEvidenceService.getEvidenceForBody(
      body,
      institutionId || null
    );

    return NextResponse.json({ data: packet });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
