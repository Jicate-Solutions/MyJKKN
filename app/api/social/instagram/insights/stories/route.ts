export const dynamic = 'force-dynamic';

/**
 * GET /api/social/instagram/insights/stories  (contract C5)
 *
 * Query params:
 *   account_id — uuid, optional (filters ig_stories.ig_account_id; omit = all
 *                visible accounts, RLS-scoped)
 *   days       — int, default 30, clamped to [1, 365]
 *
 * Response (success envelope) — FINAL SHAPE (mirrors the real ig_stories +
 * ig_story_insights columns from migration 20260530161509_ig_stories_dm.sql):
 *   { success: true, data: {
 *       stories: [{
 *         id: string,                       // ig_stories.id (uuid)
 *         story_id: string,                 // Meta-side story media id
 *         account_id: string,               // ig_stories.ig_account_id
 *         media_type: 'IMAGE'|'VIDEO'|null,
 *         permalink: string|null,
 *         media_url: string|null,
 *         thumbnail_url: string|null,
 *         posted_at: string,
 *         expires_at: string,
 *         // pivoted from ig_story_insights (metric, value) rows — LATEST
 *         // captured_at per (story, metric); missing metric → 0:
 *         impressions: number, reach: number, exits: number, replies: number,
 *         taps_forward: number, taps_back: number,
 *         insights_updated_at: string|null  // newest captured_at among the
 *                                           // story's insight rows
 *       }],
 *       rollup: { stories: number, impressions: number, reach: number,
 *                 exits: number, replies: number, taps_forward: number,
 *                 taps_back: number }
 *   } }
 *
 * Stories are ordered posted_at desc. ig_story_insights stores one row per
 * (story, metric, captured_at) snapshot; the last row before expiry is the
 * canonical final value, so latest-per-(story, metric) is correct for both
 * live and expired stories.
 *
 * Auth: any authenticated user; row visibility enforced by ig_stories /
 * ig_story_insights RLS (institution match via parent account OR super_admin)
 * via the user-session client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const MAX_PAGES = 20;
const IN_CHUNK = 200;

const STORY_METRICS = ['impressions', 'reach', 'exits', 'replies', 'taps_forward', 'taps_back'] as const;
type StoryMetric = (typeof STORY_METRICS)[number];

interface StoryRow {
  id: string;
  story_id: string;
  ig_account_id: string;
  media_type: string | null;
  permalink: string | null;
  media_url: string | null;
  thumbnail_url: string | null;
  posted_at: string;
  expires_at: string;
}

interface InsightRow {
  story_id: string;
  metric: string;
  value: number | string | null;
  captured_at: string;
}

function parseDays(raw: string | null, def: number): number | null {
  if (raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, 365);
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const days = parseDays(searchParams.get('days'), 30);

    if (days === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid days parameter — must be a positive integer' },
        { status: 400 }
      );
    }
    if (accountId && !UUID_RE.test(accountId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid account_id parameter — must be a UUID' },
        { status: 400 }
      );
    }

    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    // 1. Stories in window (paginated past the ~1000-row cap).
    const storyRows: StoryRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      let query = supabase
        .from('ig_stories')
        .select('id, story_id, ig_account_id, media_type, permalink, media_url, thumbnail_url, posted_at, expires_at')
        .gte('posted_at', sinceIso)
        .order('posted_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (accountId) query = query.eq('ig_account_id', accountId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      const batch = (data ?? []) as StoryRow[];
      storyRows.push(...batch);
      if (batch.length < PAGE) break;
    }

    // 2. Latest insight per (story, metric) — batched .in() chunks on the
    //    TEXT story_id FK, newest-first, first-seen-wins dedupe.
    const latestInsight = new Map<string, InsightRow>(); // key: `${story_id}|${metric}`
    const latestCapturedAt = new Map<string, string>(); // story_id → newest captured_at
    const storyIds = storyRows.map((s) => s.story_id);
    for (let i = 0; i < storyIds.length; i += IN_CHUNK) {
      const chunk = storyIds.slice(i, i + IN_CHUNK);
      const { data, error } = await supabase
        .from('ig_story_insights')
        .select('story_id, metric, value, captured_at')
        .in('story_id', chunk)
        .order('captured_at', { ascending: false });
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      for (const row of (data ?? []) as InsightRow[]) {
        const key = `${row.story_id}|${row.metric}`;
        if (!latestInsight.has(key)) latestInsight.set(key, row);
        if (!latestCapturedAt.has(row.story_id)) latestCapturedAt.set(row.story_id, row.captured_at);
      }
    }

    // 3. Pivot metric rows into columns per story + accumulate the rollup.
    const rollup: Record<StoryMetric, number> & { stories: number } = {
      stories: storyRows.length,
      impressions: 0,
      reach: 0,
      exits: 0,
      replies: 0,
      taps_forward: 0,
      taps_back: 0,
    };

    const stories = storyRows.map((s) => {
      const metrics = {} as Record<StoryMetric, number>;
      for (const metric of STORY_METRICS) {
        const raw = latestInsight.get(`${s.story_id}|${metric}`)?.value;
        const value = raw === null || raw === undefined ? 0 : Number(raw);
        metrics[metric] = Number.isFinite(value) ? value : 0;
        rollup[metric] += metrics[metric];
      }
      return {
        id: s.id,
        story_id: s.story_id,
        account_id: s.ig_account_id,
        media_type: s.media_type,
        permalink: s.permalink,
        media_url: s.media_url,
        thumbnail_url: s.thumbnail_url,
        posted_at: s.posted_at,
        expires_at: s.expires_at,
        ...metrics,
        insights_updated_at: latestCapturedAt.get(s.story_id) ?? null,
      };
    });

    return NextResponse.json({ success: true, data: { stories, rollup } });
  } catch (error) {
    console.error('[ig-insights-stories] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Stories query failed' },
      { status: 500 }
    );
  }
}
