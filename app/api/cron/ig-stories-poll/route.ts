// =====================================================================
// /api/cron/ig-stories-poll — Phase 1B (Agent ι, 2026-05-30)
// =====================================================================
// Polls active Instagram stories for every active ig_accounts row whose
// last_polled_at is older than ig.stories.poll_interval_minutes
// (default 120m).
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> header (Vercel) OR
// ?secret=<value> query param for manual runs. Pattern mirrors
// pde-quest-risk-tier + counselor-shift-flip.
//
// Honors policy `ig.stories.is_enabled` — when false the cron exits 200
// with `{skipped:true}` so the schedule keeps running without any Graph
// calls or DB writes.
//
// Cadence: recommended schedule (added in a separate vercel.json PR):
//   "schedule": "0 */2 * * *"  // every 2 hours
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStories, getStoryInsights } from '@/lib/instagram/stories-client';

const JOB_NAME = 'ig-stories-poll';

export async function GET(request: NextRequest) {
  const started = Date.now();
  const ranAt = new Date().toISOString();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'unauthorized' },
      { status: 401 }
    );
  }

  const supabase = createServiceRoleClient();

  try {
    // Policy gate — kill switch
    const { data: isEnabledRaw } = await supabase.rpc('fn_get_policy', {
      p_key: 'ig.stories.is_enabled',
      p_scope_id: null,
    });
    if (isEnabledRaw === false) {
      return NextResponse.json({
        ok: true,
        job: JOB_NAME,
        ran_at: ranAt,
        skipped: true,
        reason: 'ig.stories.is_enabled=false',
      });
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, error: 'INSTAGRAM_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    // Poll interval — defaults to 120 minutes
    const { data: pollMinutesRaw } = await supabase.rpc('fn_get_policy', {
      p_key: 'ig.stories.poll_interval_minutes',
      p_scope_id: null,
    });
    const pollMinutes = typeof pollMinutesRaw === 'number' ? pollMinutesRaw : 120;
    const staleBeforeIso = new Date(Date.now() - pollMinutes * 60 * 1000).toISOString();

    // Fetch active accounts due for polling
    const { data: accounts, error: acctErr } = await supabase
      .from('ig_accounts')
      .select('id, ig_user_id, username')
      .eq('status', 'active')
      .or(`last_polled_at.is.null,last_polled_at.lt.${staleBeforeIso}`);
    if (acctErr) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: acctErr.message },
        { status: 500 }
      );
    }

    const accountList = accounts ?? [];
    let storiesUpserted = 0;
    let insightsCaptured = 0;
    let errors = 0;

    for (const account of accountList) {
      try {
        const stories = await getStories(account.ig_user_id, { accessToken });
        for (const story of stories) {
          try {
            const postedAt = story.timestamp ?? new Date().toISOString();
            const expiresAt = new Date(Date.parse(postedAt) + 24 * 60 * 60 * 1000).toISOString();
            await supabase.from('ig_stories').upsert(
              {
                story_id: story.id,
                ig_account_id: account.id,
                media_type: story.media_type ?? null,
                permalink: story.permalink ?? null,
                media_url: story.media_url ?? null,
                thumbnail_url: story.thumbnail_url ?? null,
                posted_at: postedAt,
                expires_at: expiresAt,
                last_polled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'story_id', ignoreDuplicates: false }
            );
            storiesUpserted++;

            // Best-effort insights capture
            try {
              const insights = await getStoryInsights(story.id, { accessToken });
              const rows = insights.map((insight) => ({
                story_id: story.id,
                metric: insight.name,
                value: insight.values?.[0]?.value ?? 0,
                captured_at: new Date().toISOString(),
              }));
              if (rows.length > 0) {
                await supabase.from('ig_story_insights').insert(rows);
                insightsCaptured += rows.length;
              }
            } catch (insightErr) {
              // story too new / privacy — non-fatal
              console.warn(`[cron:${JOB_NAME}] insights skip ${story.id}:`, insightErr instanceof Error ? insightErr.message : insightErr);
            }
          } catch (storyErr) {
            errors++;
            console.warn(`[cron:${JOB_NAME}] story upsert error for ${story.id}:`, storyErr instanceof Error ? storyErr.message : storyErr);
          }
        }

        await supabase
          .from('ig_accounts')
          .update({ last_polled_at: new Date().toISOString() })
          .eq('id', account.id);
      } catch (acctRunErr) {
        errors++;
        console.error(`[cron:${JOB_NAME}] account ${account.id} failed:`, acctRunErr);
      }
    }

    const elapsedMs = Date.now() - started;
    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      elapsed_ms: elapsedMs,
      accounts_polled: accountList.length,
      stories_upserted: storiesUpserted,
      insights_captured: insightsCaptured,
      errors,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cron:${JOB_NAME}] Exception:`, err);
    return NextResponse.json(
      { ok: false, job: JOB_NAME, ran_at: ranAt, error: message },
      { status: 500 }
    );
  }
}
