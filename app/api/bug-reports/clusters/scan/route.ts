export const dynamic = 'force-dynamic';
export const maxDuration = 180; // the scan can take a couple of minutes on a large pool

import { NextResponse, connection } from 'next/server';
import { createAdminClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { requireBugAdmin } from '../_auth';

/**
 * POST /api/bug-reports/clusters/scan
 * On-demand "Scan now" from the Groups tab. Same fn the nightly cron runs;
 * idempotent full recompute of proposals.
 */
export async function POST() {
  await connection();
  try {
    const { response } = await requireBugAdmin();
    if (response) return response;

    const adminSupabase = createAdminClient();
    const { data, error } = await (adminSupabase as any).rpc('fn_bug_cluster_scan');

    if (error) throw error;
    if (!data?.success) {
      return NextResponse.json({ error: data?.error ?? 'scan failed' }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (error) {
    logger.error('bug-reports/clusters', 'On-demand scan failed', error);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
