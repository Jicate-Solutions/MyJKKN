export const dynamic = 'force-dynamic';

// GET /api/billing/transport/collectables  — billing.transport.view
// Lists transport (bus) fee collectables for bus-requiring dayscholars. Scoping + the
// permission gate live in fn_list_transport_collectables (SECURITY DEFINER); this route
// only forwards the optional institution / academic-year narrowing filters.

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { TransportCollectionService } from '@/lib/services/billing/transport/transport-collection-service';

export const GET = withAuth(
  async (request) => {
    const { searchParams } = new URL(request.url);
    const institutionId = searchParams.get('institution_id');
    const academicYearId = searchParams.get('academic_year_id');

    const rows = await TransportCollectionService.listCollectables({
      institutionIds: institutionId ? [institutionId] : null,
      academicYearId: academicYearId || null,
    });
    return NextResponse.json({ success: true, data: rows });
  },
  { requiredPermission: 'read', requirePermission: 'billing.transport.view', allowApiKey: false },
);
