import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { YouTubeService } from '@/lib/services/social-media/youtube-service';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Shared snapshot collection logic
 */
async function runSnapshotCollection(
  institutionId: string,
  triggeredBy: 'cron' | 'manual' | 'api',
  platform: string,
  accountId?: string | null
) {
  const serviceSupabase = getServiceSupabase();

  // Create cron log entry
  const { data: cronLog } = await serviceSupabase
    .from('sm_cron_log')
    .insert({
      institution_id: institutionId,
      cron_type: 'snapshot',
      triggered_by: triggeredBy,
      status: 'running',
    })
    .select()
    .single();

  const startTime = Date.now();
  const results: { platform: string; processed: number; succeeded: number; failed: number; details: any[] }[] = [];

  // YouTube pull
  if (platform === 'all' || platform === 'youtube') {
    try {
      const ytService = new YouTubeService();

      if (accountId) {
        const { data: account } = await serviceSupabase
          .from('sm_accounts')
          .select('id, username, institution_id')
          .eq('id', accountId)
          .eq('platform', 'youtube')
          .single();

        if (account) {
          const result = await ytService.pullAccount(account);
          results.push({
            platform: 'youtube',
            processed: 1,
            succeeded: result.success ? 1 : 0,
            failed: result.success ? 0 : 1,
            details: [result],
          });
        }
      } else {
        const ytResults = await ytService.pullAllAccounts(institutionId);
        results.push({
          platform: 'youtube',
          processed: ytResults.totalProcessed,
          succeeded: ytResults.totalSucceeded,
          failed: ytResults.totalFailed,
          details: ytResults.results,
        });
      }
    } catch (err) {
      results.push({
        platform: 'youtube',
        processed: 0,
        succeeded: 0,
        failed: 1,
        details: [{ error: err instanceof Error ? err.message : 'YouTube pull failed' }],
      });
    }
  }

  // Instagram pull (placeholder — requires Meta Business Verification)
  if (platform === 'all' || platform === 'instagram') {
    results.push({
      platform: 'instagram',
      processed: 0,
      succeeded: 0,
      failed: 0,
      details: [{ message: 'Instagram auto-pull not yet configured. Awaiting Meta Business Verification.' }],
    });
  }

  // Update cron log
  const durationSeconds = (Date.now() - startTime) / 1000;
  const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
  const totalSucceeded = results.reduce((sum, r) => sum + r.succeeded, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const errors = results
    .flatMap(r => r.details.filter((d: any) => d.error))
    .map((d: any) => ({ error: d.error, account: d.username || d.accountId }));

  if (cronLog) {
    await serviceSupabase
      .from('sm_cron_log')
      .update({
        completed_at: new Date().toISOString(),
        status: totalFailed === 0 ? 'completed' : totalSucceeded > 0 ? 'partial' : 'failed',
        accounts_processed: totalProcessed,
        accounts_succeeded: totalSucceeded,
        accounts_failed: totalFailed,
        errors,
        duration_seconds: Math.round(durationSeconds * 100) / 100,
      })
      .eq('id', cronLog.id);
  }

  return {
    success: true,
    triggered_by: triggeredBy,
    duration_seconds: Math.round(durationSeconds * 100) / 100,
    total_processed: totalProcessed,
    total_succeeded: totalSucceeded,
    total_failed: totalFailed,
    results,
    cron_log_id: cronLog?.id,
  };
}

/**
 * GET /api/social-media/cron
 *
 * Dual-purpose:
 *   1. Vercel Cron trigger (has Authorization: Bearer <CRON_SECRET>)
 *   2. Authenticated user fetching cron logs (has session cookie)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  // Check if this is a Vercel Cron call
  if (authHeader === `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    // Vercel Cron trigger — run snapshot collection
    const result = await runSnapshotCollection(
      'a1111111-1111-1111-1111-111111111111',
      'cron',
      'all'
    );
    return NextResponse.json(result);
  }

  // Otherwise return cron logs for authenticated user
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50);

    const serviceSupabase = getServiceSupabase();
    const { data: logs, error } = await serviceSupabase
      .from('sm_cron_log')
      .select('*')
      .eq('institution_id', profile.institution_id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return NextResponse.json({ data: logs || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/social-media/cron
 *
 * Manual trigger for snapshot collection.
 * Only super_admin/admin/principal can trigger.
 *
 * Query params:
 *   - platform: 'youtube' | 'instagram' | 'all' (default: 'all')
 *   - account_id: optional single account to refresh
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = request.headers.get('x-cron-secret');
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'all';
    const accountId = searchParams.get('account_id');

    let institutionId: string;
    let triggeredBy: 'cron' | 'manual' | 'api';

    if (cronSecret && process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET) {
      institutionId = 'a1111111-1111-1111-1111-111111111111';
      triggeredBy = 'cron';
    } else {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('institution_id, role')
        .eq('id', user.id)
        .single();

      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      const adminRoles = ['super_admin', 'admin', 'principal'];
      if (!adminRoles.includes(profile.role)) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

      institutionId = profile.institution_id;
      triggeredBy = 'manual';
    }

    const result = await runSnapshotCollection(institutionId, triggeredBy, platform, accountId);
    return NextResponse.json(result);

  } catch (err) {
    console.error('Cron error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
