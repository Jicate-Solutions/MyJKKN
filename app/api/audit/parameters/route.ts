export const dynamic = 'force-dynamic';

import { NextResponse, connection } from 'next/server';
import { getAuthSession } from '@/lib/supabase/server';
import { AuditParameterCatalogService } from '@/lib/services/audit';

/**
 * GET /api/audit/parameters?institution_id=<uuid>
 *
 * Returns the resolved parameter catalog for an institution — system defaults
 * merged with institution-specific overrides (override wins per code).
 *
 * If institution_id is omitted, returns ONLY system default rows (is_system=true,
 * institution_id NULL). This is the catalog-browser view used by
 * /audit/parameters/settings.
 */
export async function GET(request: Request) {
  await connection();
  try {
    const { session, error: sessionError } = await getAuthSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');

    const parameters = institutionId
      ? await AuditParameterCatalogService.listForInstitution(institutionId)
      : await AuditParameterCatalogService.listSystem();

    return NextResponse.json({
      data: parameters,
      metadata: {
        institution_id: institutionId,
        scope: institutionId ? 'institution-merged' : 'system-default',
        count: parameters.length,
      },
    });
  } catch (error) {
    console.error('[audit/parameters] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
