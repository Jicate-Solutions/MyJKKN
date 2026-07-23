export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Feedback adapter: Instagram comment TEXT → feedback_events.
 *
 * For each graph-readable IG account, reads recent posts' comment threads via
 * the Graph API comments edge (the text + author — NOT just the count the
 * poller already stores) and normalizes them into the universal spine. The
 * daily classify routine (Claude subscription) then tags sentiment/intent/
 * topic + drafts replies.
 *
 * Pull-based backfill: works on OWNED (graph) accounts with a stored token —
 * no Meta webhook subscription needed (that's only for real-time). Bounded
 * (accounts × posts × comment pages) to stay within maxDuration. Idempotent:
 * ingest dedups on (source, source_ref = comment id).
 *
 * Auth: CRON_SECRET via ?secret= / Bearer / x-vercel-cron.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ingestFeedbackEvents } from '@/lib/services/feedback/feedback-ingest';
import type { FeedbackEventInput } from '@/lib/types/feedback-spine';
import { getMediaComments } from '@/lib/instagram/comments-client';

const GRAPH_VERSION = 'v25.0';
const MAX_ACCOUNTS = 12;
const POSTS_PER_ACCOUNT = 15;
const COMMENTS_PER_POST_CAP = 300; // bound cost on viral posts (6 pages of 50)

interface IgAccountRow {
  id: string;
  username: string | null;
  institution_id: string | null;
  access_token: string | null;
}
interface IgPostRow {
  ig_media_id: string | null;
  posted_at: string | null;
}

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.nextUrl.searchParams.get('secret') === secret) return true;
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true;
  if (req.headers.get('x-vercel-cron')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const db = createServiceRoleClient();
  const { data: accountsRaw, error: accErr } = await db
    .from('ig_accounts')
    .select('id, username, institution_id, access_token')
    .eq('metrics_source', 'graph')
    .not('access_token', 'is', null)
    .limit(MAX_ACCOUNTS);

  if (accErr) {
    return NextResponse.json({ success: false, error: accErr.message }, { status: 500 });
  }

  const accounts = (accountsRaw as IgAccountRow[]) ?? [];
  const sysToken = process.env.META_IG_SYSTEM_USER_TOKEN || '';
  let postsScanned = 0;
  let totalInserted = 0;
  const perAccount: Array<{ username: string | null; comments: number; inserted: number; error?: string }> = [];

  for (const acc of accounts) {
    const token = acc.access_token || sysToken;
    if (!token) continue;

    const { data: postsRaw } = await db
      .from('ig_posts')
      .select('ig_media_id, posted_at')
      .eq('account_id', acc.id)
      .not('ig_media_id', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(POSTS_PER_ACCOUNT);

    const events: FeedbackEventInput[] = [];
    for (const p of (postsRaw as IgPostRow[]) ?? []) {
      if (!p.ig_media_id) continue;
      postsScanned++;
      let after: string | undefined;
      let fetched = 0;
      try {
        do {
          const env = await getMediaComments(
            p.ig_media_id,
            { accessToken: token, apiVersion: GRAPH_VERSION },
            { limit: 50, after }
          );
          for (const c of env.data ?? []) {
            if (!c.text || c.text.trim().length === 0) continue; // emoji/mention-only → nothing to classify
            events.push({
              source: 'ig_comment',
              source_ref: c.id,
              institution_id: acc.institution_id,
              actor_type: 'ig_user',
              actor_ref: c.username ?? null,
              target_type: 'ig_post',
              target_ref: p.ig_media_id,
              event_type: 'comment',
              content: c.text.trim(),
              raw: { username: c.username, like_count: c.like_count, media_id: p.ig_media_id },
              occurred_at: c.timestamp ?? undefined,
            });
            fetched++;
          }
          after = env.paging?.cursors?.after;
          if (fetched >= COMMENTS_PER_POST_CAP) break;
        } while (after);
      } catch {
        // Token/permission/edge error on this post — skip it, keep going.
      }
    }

    const result = await ingestFeedbackEvents(events);
    totalInserted += result.inserted;
    perAccount.push({
      username: acc.username,
      comments: events.length,
      inserted: result.inserted,
      ...(result.error ? { error: result.error } : {}),
    });
  }

  return NextResponse.json({
    success: true,
    source: 'ig_comment',
    accounts: accounts.length,
    postsScanned,
    totalInserted,
    perAccount,
  });
}
