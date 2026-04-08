

// app/api/admission/counselors/sync/route.ts
// POST — Trigger counselor sync from Exotel agent map to admission_counselors table
// GET  — Return last sync time + current counselor count

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { CounselorSyncService } from '@/lib/services/telephony/counselor-sync-service';
import { logger } from '@/lib/utils/enhanced-logger';

export async function POST(_request: NextRequest) {
  try {
    // Auth check — only logged-in users can trigger manual sync
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Use service role client for admin-level DB access
    const supabase = createServiceRoleClient();

    logger.info('counselor-sync/api', 'Manual sync triggered', { userId: user.id });

    const result = await CounselorSyncService.syncFromExotel(supabase);

    return NextResponse.json({
      success: result.errors.length === 0,
      ...result,
    });
  } catch (error) {
    logger.error('counselor-sync/api', 'Manual sync failed', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Auth check
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const supabase = createServiceRoleClient();
    const status = await CounselorSyncService.getSyncStatus(supabase);

    return NextResponse.json(status);
  } catch (error) {
    logger.error('counselor-sync/api', 'Status check failed', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Status check failed',
      },
      { status: 500 }
    );
  }
}
