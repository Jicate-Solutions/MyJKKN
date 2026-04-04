export const dynamic = 'force-dynamic';

// app/api/telephony/inbound-sync/route.ts
// POST /api/telephony/inbound-sync — Manual trigger for inbound CDR sync (admin only)

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { InboundCallSyncService, type SyncOptions } from '@/lib/services/telephony/inbound-call-sync-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(request: NextRequest) {
  try {
    // Authenticate — require admin or super_admin
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createServiceRoleClient();

    // Check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile || !['super_admin', 'admin'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const institutionId = body.institutionId || profile.institution_id;

    if (!institutionId) {
      return NextResponse.json(
        { error: 'BAD_REQUEST', message: 'institutionId is required' },
        { status: 400 }
      );
    }

    const options: SyncOptions = {
      fromDate: body.fromDate,
      toDate: body.toDate,
      fullSync: body.fullSync || false,
    };

    logger.info('telephony/inbound-sync', 'Manual sync triggered', {
      institutionId,
      userId: user.id,
      options,
    });

    const result = await InboundCallSyncService.syncInboundCalls(
      institutionId,
      supabase,
      options
    );

    return NextResponse.json({
      success: result.errors.length === 0,
      data: result,
    });
  } catch (error) {
    logger.error('telephony/inbound-sync', 'Manual sync failed', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
