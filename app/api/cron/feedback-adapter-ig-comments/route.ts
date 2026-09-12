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
 * FAIR QUEUE (2026-09-09) — this route used to select its accounts with a bare
 * `.limit(12)` and NO `.order()` at all, so PostgREST sent `LIMIT 12` with no
 * ORDER BY and Postgres returned arbitrary heap order. The route also wrote
 * nothing back, so a row that fell outside the window had no mechanism to ever
 * be promoted. Measured in production: the routine ran daily for 66 days
 * (2026-06-26 → 2026-09-05) against 59 eligible accounts and only 11 distinct
 * accounts EVER produced a row; 22 accounts that have posts to scan had never
 * ingested a single comment, carrying 119 Meta-counted comments in the exact
 * top-15-posts window this route reads. Same starvation shape as the metrics
 * poller fix (#3358); ordering oldest-scanned-first + persisting the cursor
 * makes the truncated tail rotate. See instagram-metrics-poller/route.ts:1357.
 *
 * Auth: CRON_SECRET via ?secret= / Bearer / x-vercel-cron.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { ingestFeedbackEvents } from '@/lib/services/feedback/feedback-ingest';
import type { FeedbackEventInput } from '@/lib/types/feedback-spine';
import { getMediaComments } from '@/lib/instagram/comments-client';
import { redactCredentials } from '@/lib/meta/graph-api-client';

const GRAPH_VERSION = 'v25.0';
const MAX_ACCOUNTS = 12;
const POSTS_PER_ACCOUNT = 15;
const COMMENTS_PER_POST_CAP = 300; // bound cost on viral posts (6 pages of 50)

/**
 * Wall clock is the REAL bound, not MAX_ACCOUNTS. The header above says the run
 * is "bounded to stay within maxDuration" (300s) and 12 was a conservative
 * stand-in for that — worst case 12 × 15 posts × 6 pages = 1,080 Graph calls.
 * It is not a rate-limit cap: all 59 eligible accounts carry their OWN token
 * (59 distinct access_token values verified in prod), and IG Graph limits are
 * per-app/per-user, not per-run. With a real budget doing the bounding,
 * MAX_ACCOUNTS becomes a safety ceiling that can be raised on evidence.
 * 270s leaves ~30s headroom under maxDuration for the account already in flight
 * plus the closing Sentry write and JSON response — same figure as the poller.
 */
const SCAN_BUDGET_MS = 270_000;

/**
 * Rotation cursor. A NEW column, deliberately NOT `last_polled_at`: that column
 * is a cadence GATE for instagram-metrics-poller (:1344) and ig-stories-poll
 * (:101), so a write from here would make those pollers skip accounts they had
 * never polled — re-creating the exact starvation #3358 just fixed.
 */
const CURSOR_COLUMN = 'last_comment_scan_at';

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

  const start = Date.now();
  const db = createServiceRoleClient();

  const eligibleQuery = () =>
    db
      .from('ig_accounts')
      .select('id, username, institution_id, access_token')
      .eq('metrics_source', 'graph')
      .not('access_token', 'is', null);

  // How big the queue actually is. Without this the response cannot tell
  // "covered everything" from "reached the cap and dropped the rest" — the old
  // `accounts: accounts.length` was always 12 and therefore reported nothing.
  const { count: eligibleTotal } = await db
    .from('ig_accounts')
    .select('id', { count: 'exact', head: true })
    .eq('metrics_source', 'graph')
    .not('access_token', 'is', null);

  // Longest-waiting-first, with id as a deterministic tie-break. All rows start
  // at NULL, so `nullsFirst` puts the never-scanned accounts at the very front —
  // no backfill needed, that IS the desired "never scanned, go first" semantics.
  const ordered = await eligibleQuery()
    .order(CURSOR_COLUMN, { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(MAX_ACCOUNTS);

  // DEGRADE, DON'T FAIL CLOSED. The cursor column arrives in a migration that
  // ships in this same changeset, but migrations here are freeze-gated while the
  // code deploys on merge, so "code live, migration pending" is a realistic
  // intermediate state. If the order references a column that does not exist yet
  // PostgREST rejects the whole select, and failing there would return 500 having
  // ingested nothing for ALL 59 accounts — strictly worse than today. So retry
  // once with the ORIGINAL query (no order at all), which is byte-for-byte
  // today's behaviour, and skip the cursor writes until the column exists.
  let cursorColumnPresent = true;
  let accountsRaw = ordered.data as IgAccountRow[] | null;
  let selectError = ordered.error?.message ?? null;

  if (ordered.error) {
    cursorColumnPresent = false;
    const fallback = await eligibleQuery().limit(MAX_ACCOUNTS);
    accountsRaw = fallback.data as IgAccountRow[] | null;
    selectError = fallback.error?.message ?? null;
  }

  if (selectError) {
    return NextResponse.json({ success: false, error: selectError }, { status: 500 });
  }

  const accounts = accountsRaw ?? [];
  const sysToken = process.env.META_IG_SYSTEM_USER_TOKEN || '';
  let postsScanned = 0;
  let totalInserted = 0;
  let accountsScanned = 0;
  let budgetSkipped = 0;
  let totalPostErrors = 0;
  const perAccount: Array<{
    username: string | null;
    comments: number;
    inserted: number;
    postErrors: number;
    error?: string;
  }> = [];

  /**
   * Stamp UNCONDITIONALLY once an account has had its turn, including when it
   * errored. Stamping only on success would let one account with a broken
   * comments permission sit at the head of the queue forever — the same trap in
   * a new costume. Chosen tradeoff: a transient failure costs that account one
   * day's turn rather than blocking every account behind it.
   */
  const stampScanned = async (id: string) => {
    if (!cursorColumnPresent) return;
    await db
      .from('ig_accounts')
      .update({ [CURSOR_COLUMN]: new Date().toISOString() })
      .eq('id', id);
  };

  for (const acc of accounts) {
    if (Date.now() - start > SCAN_BUDGET_MS) {
      // Deliberately NOT stamped: an account the budget never reached must keep
      // its place at the front of the queue for the next run.
      budgetSkipped = accounts.length - accountsScanned;
      break;
    }
    accountsScanned++;

    const token = acc.access_token || sysToken;
    if (!token) {
      // Unreachable while the select filters access_token IS NOT NULL, but stamp
      // anyway — an un-stamped `continue` is a queue-head wedge waiting to happen.
      await stampScanned(acc.id);
      perAccount.push({
        username: acc.username,
        comments: 0,
        inserted: 0,
        postErrors: 0,
        error: 'no access token',
      });
      continue;
    }

    const { data: postsRaw } = await db
      .from('ig_posts')
      .select('ig_media_id, posted_at')
      .eq('account_id', acc.id)
      .not('ig_media_id', 'is', null)
      .order('posted_at', { ascending: false })
      .limit(POSTS_PER_ACCOUNT);

    const events: FeedbackEventInput[] = [];
    let postErrors = 0;
    let firstPostError: string | undefined;

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
      } catch (e) {
        // OBSERVABILITY, not a diagnosed second bug. There is no evidence today
        // of a comments-edge permission failure anywhere in the data. The point
        // is that the previous bare `} catch {}` made one IMPOSSIBLE to see: a
        // token/permission error and an account with genuinely no comments both
        // produced exactly zero rows and zero signal. Redacted before it is
        // surfaced — a Graph error string can carry the query it was built from.
        postErrors++;
        totalPostErrors++;
        if (!firstPostError) {
          firstPostError = redactCredentials(
            e instanceof Error ? e.message : String(e)
          ).slice(0, 300);
        }
      }
    }

    const result = await ingestFeedbackEvents(events);
    totalInserted += result.inserted;
    await stampScanned(acc.id);
    perAccount.push({
      username: acc.username,
      comments: events.length,
      inserted: result.inserted,
      postErrors,
      ...(result.error ? { error: result.error } : firstPostError ? { error: firstPostError } : {}),
    });
  }

  const accountsTotal = eligibleTotal ?? accounts.length;
  // Everything the run did not touch — capped out of the window AND truncated by
  // the budget. `budgetSkipped` breaks out only the latter.
  const accountsSkipped = Math.max(accountsTotal - accountsScanned, 0);

  Sentry.captureMessage('IG comments adapter run complete', {
    level: 'info',
    extra: {
      accounts_scanned: accountsScanned,
      accounts_selected: accounts.length,
      accounts_total: accountsTotal,
      accounts_skipped: accountsSkipped,
      accounts_skipped_budget: budgetSkipped,
      posts_scanned: postsScanned,
      total_inserted: totalInserted,
      post_errors: totalPostErrors,
      cursor_column_present: cursorColumnPresent,
      duration_ms: Date.now() - start,
    },
  });

  return NextResponse.json({
    success: true,
    source: 'ig_comment',
    accounts_scanned: accountsScanned,
    accounts_selected: accounts.length,
    accounts_total: accountsTotal,
    accounts_skipped: accountsSkipped,
    accounts_skipped_budget: budgetSkipped,
    cursor_column_present: cursorColumnPresent,
    postsScanned,
    totalInserted,
    postErrors: totalPostErrors,
    perAccount,
  });
}
