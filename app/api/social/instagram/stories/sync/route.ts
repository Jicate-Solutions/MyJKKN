export const dynamic = 'force-dynamic';

/**
 * POST /api/social/instagram/stories/sync
 *
 * Pulls active stories from Graph for a single IG account and upserts them
 * into ig_stories. Also captures one round of story insights into
 * ig_story_insights. Idempotent: upserts on story_id.
 *
 * Body:
 *   ig_account_id: string    — UUID FK into ig_accounts (required)
 *
 * Auth: super_admin OR institution_admin in the account's institution.
 *
 * Honors policy `ig.stories.is_enabled`. When false, returns 200 with a
 * `skipped: true` body so the caller knows nothing was written.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getStories, getStoryInsights } from '@/lib/instagram/stories-client';

interface SyncedStory {
  story_id: string;
  status: 'upserted' | 'error';
  error?: string;
  insights_captured?: number;
}

export async function POST(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { ig_account_id?: string };
    const igAccountId = body.ig_account_id;
    if (!igAccountId) {
      return NextResponse.json(
        { success: false, error: 'ig_account_id is required' },
        { status: 400 }
      );
    }

    // Resolve account + auth gate
    const { data: account } = await supabase
      .from('ig_accounts')
      .select('id, institution_id, ig_user_id, username')
      .eq('id', igAccountId)
      .single();
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();
    const isSuperAdmin = profile?.role === 'super_admin';
    const isInstitutionAdmin =
      profile?.role === 'institution_admin' && profile?.institution_id === account.institution_id;

    // 2026-06-11 granular-permission retrofit: roles granted
    // social.instagram.manage via Role Management pass too, restricted to
    // accounts in their own institution like institution_admin.
    let hasManagePerm = false;
    if (!isSuperAdmin && !isInstitutionAdmin && profile?.institution_id === account.institution_id) {
      const { data: perm } = await supabase.rpc('user_has_permission', {
        permission_name: 'social.instagram.manage',
      });
      hasManagePerm = !!perm;
    }

    if (!isSuperAdmin && !isInstitutionAdmin && !hasManagePerm) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    // Policy gate
    const { data: isEnabledRaw } = await supabase.rpc('fn_get_policy', {
      p_key: 'ig.stories.is_enabled',
      p_scope_id: null,
    });
    if (isEnabledRaw === false) {
      return NextResponse.json({
        success: true,
        data: { skipped: true, reason: 'ig.stories.is_enabled=false' },
      });
    }

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'INSTAGRAM_ACCESS_TOKEN not configured' },
        { status: 503 }
      );
    }

    const serviceClient = createServiceRoleClient();

    // 1. Fetch active stories
    const stories = await getStories(account.ig_user_id, { accessToken });

    if (stories.length === 0) {
      // Mark this account as polled so the cron can skip it for ig.stories.poll_interval_minutes
      await serviceClient
        .from('ig_accounts')
        .update({ last_polled_at: new Date().toISOString() })
        .eq('id', account.id);
      return NextResponse.json({
        success: true,
        data: { synced: 0, total: 0, results: [] },
      });
    }

    const results: SyncedStory[] = [];
    let synced = 0;

    // 2. Upsert each story + capture insights
    await Promise.all(
      stories.map(async (story) => {
        try {
          const postedAt = story.timestamp ?? new Date().toISOString();
          const postedAtMs = Date.parse(postedAt);
          const expiresAt = new Date(postedAtMs + 24 * 60 * 60 * 1000).toISOString();

          const { error: storyErr } = await serviceClient
            .from('ig_stories')
            .upsert(
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
          if (storyErr) {
            results.push({ story_id: story.id, status: 'error', error: storyErr.message });
            return;
          }

          // Capture insights. Soft-fail: a 400 with code 100/2108006 means
          // "no data yet" — common for stories <1h old.
          let insightsCaptured = 0;
          try {
            const insights = await getStoryInsights(story.id, { accessToken });
            const rows = insights.map((insight) => ({
              story_id: story.id,
              metric: insight.name,
              value: insight.values?.[0]?.value ?? 0,
              captured_at: new Date().toISOString(),
            }));
            if (rows.length > 0) {
              const { error: insightErr } = await serviceClient
                .from('ig_story_insights')
                .insert(rows);
              if (!insightErr) {
                insightsCaptured = rows.length;
              }
            }
          } catch (insightErr) {
            // Story too new for insights — non-fatal.
            console.warn(`[ig-stories-sync] insights skip for ${story.id}:`, insightErr instanceof Error ? insightErr.message : insightErr);
          }

          synced++;
          results.push({ story_id: story.id, status: 'upserted', insights_captured: insightsCaptured });
        } catch (err) {
          results.push({
            story_id: story.id,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      })
    );

    // Mark account polled
    await serviceClient
      .from('ig_accounts')
      .update({ last_polled_at: new Date().toISOString() })
      .eq('id', account.id);

    return NextResponse.json({
      success: true,
      data: { synced, total: stories.length, results },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
