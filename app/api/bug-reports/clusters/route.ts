export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from './_auth';

/**
 * GET /api/bug-reports/clusters?status=proposed|confirmed|dismissed
 * Duplicate-group proposals for the admin Groups tab.
 */
export async function GET(request: NextRequest) {
  await connection();
  try {
    const { response } = await requireBugAdmin();
    if (response) return response;

    const status = request.nextUrl.searchParams.get('status') || 'proposed';
    const adminSupabase = createAdminClient();
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_cluster_list', {
      p_status: status
    });

    if (error) throw error;
    if (!data?.success) {
      return NextResponse.json({ error: data?.error ?? 'list failed' }, { status: 502 });
    }
    return NextResponse.json({ clusters: data.clusters ?? [] });
  } catch (error) {
    logger.error('bug-reports/clusters', 'Failed to list clusters', error);
    return NextResponse.json({ error: 'Failed to load groups' }, { status: 500 });
  }
}
