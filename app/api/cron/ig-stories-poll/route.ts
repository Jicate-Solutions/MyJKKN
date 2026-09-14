// =====================================================================
// /api/cron/ig-stories-poll — Phase 1B (Agent ι, 2026-05-30)
// =====================================================================
// Polls active Instagram stories for every active ig_accounts row this job
// has not itself attempted within ig.stories.poll_interval_minutes
// (default 120m).
//
// FRESHNESS SOURCE (changed 2026-09-09) — this job used to both READ and
// WRITE `ig_accounts.last_polled_at`, a column it does not own. That column
// has SIX writers on main: instagram-metrics-poller:1618 (hourly, `29 * * * *`),
// ig-business-discovery-poll:281 (hourly, `17 * * * *`),
// ig-login-insights-poll:392 (hourly, `37 * * * *`), this route,
// social/instagram/stories/sync/route.ts:114+194 (manual) and
// social/instagram/account-profile/route.ts:190 (manual). Three HOURLY crons
// stamping a column read through a 120-minute staleness gate meant this
// 2-hourly job could almost never see an account as due: measured on prod
// 2026-09-09, 23 of 25 active accounts were fresh-blocked and only 2 were
// eligible. Reading another job's timestamp is not a freshness signal, it is
// a coin flip on cron ordering.
//
// This job now reads its OWN last attempt out of social_instagram_logs
// (event_type='stories_poll'), where it already writes, and no longer writes
// ig_accounts.last_polled_at at all — that write also corrupted the metrics
// poller's fair-queue ordering key (instagram-metrics-poller:1357 orders by
// last_polled_at ascending to decide who waited longest).
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
const GRAPH_API_VERSION = 'v25.0';

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

    // Token fallback chain — matches instagram-metrics-poller + meta-facebook-poll.
    // (INSTAGRAM_ACCESS_TOKEN / META_ACCESS_TOKEN are not provisioned in prod Vercel.)
    const accessToken =
      process.env.META_IG_SYSTEM_USER_TOKEN ||
      process.env.MESSENGER_PAGE_ACCESS_TOKEN ||
      process.env.META_PAGE_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        {
          ok: false,
          job: JOB_NAME,
          error:
            'no Instagram access token configured (META_IG_SYSTEM_USER_TOKEN / MESSENGER_PAGE_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN)',
        },
        { status: 503 }
      );
    }

    // Poll interval — defaults to 120 minutes
    const { data: pollMinutesRaw } = await supabase.rpc('fn_get_policy', {
      p_key: 'ig.stories.poll_interval_minutes',
      p_scope_id: null,
    });
    const pollMinutes = typeof pollMinutesRaw === 'number' ? pollMinutesRaw : 120;
    // Minus a 5-minute grace margin, exactly as instagram-metrics-poller:1310
    // does for the same reason: this run stamps its attempt SECONDS after the
    // schedule fires, so the next run's `now - pollMinutes` cutoff lands just
    // BEFORE that stamp and skips the account, halving the effective cadence.
    // Harmless while the freshness column was shared and stamped by three
    // other hourly jobs; load-bearing now that the signal is this job's own.
    const staleBeforeIso = new Date(
      Date.now() - (pollMinutes - 5) * 60 * 1000
    ).toISOString();

    // Fetch active accounts, then subtract the ones THIS job already attempted
    // inside the window. Split into two cheap reads instead of one filter
    // because the freshness signal now lives in another table; at 25 active
    // accounts and ~1 run of log rows in scope this is trivial, and the
    // second read is served by idx_social_instagram_logs_event_time
    // (event_type, occurred_at DESC).
    const { data: accounts, error: acctErr } = await supabase
      .from('ig_accounts')
      .select('id, ig_user_id, username')
      .eq('status', 'active');
    if (acctErr) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: acctErr.message },
        { status: 500 }
      );
    }

    // Gate on last ATTEMPT (success OR error), not last success: a broken
    // token must not turn into a retry storm, and every account must still be
    // re-attempted every cadence so the outage's true size is reported.
    const { data: recentAttempts, error: attemptErr } = await supabase
      .from('social_instagram_logs')
      .select('account_id')
      .eq('event_type', 'stories_poll')
      .gt('occurred_at', staleBeforeIso);
    if (attemptErr) {
      return NextResponse.json(
        { ok: false, job: JOB_NAME, ran_at: ranAt, error: attemptErr.message },
        { status: 500 }
      );
    }
    const attemptedRecently = new Set(
      (recentAttempts ?? []).map((row) => row.account_id).filter(Boolean)
    );

    // Last time stories capture actually WORKED, for the response body. Null
    // here is the honest answer today: social_instagram_logs holds 3,470
    // stories_poll error rows and zero success rows since 2026-06-10.
    const { data: lastSuccessRow } = await supabase
      .from('social_instagram_logs')
      .select('occurred_at')
      .eq('event_type', 'stories_poll')
      .eq('status', 'success')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastSuccessIso: string | null = lastSuccessRow?.occurred_at ?? null;

    const accountList = (accounts ?? []).filter(
      (account) => !attemptedRecently.has(account.id)
    );
    let storiesUpserted = 0;
    let insightsCaptured = 0;
    let errors = 0;
    // `errors` mixes story-level upsert failures with whole-account failures,
    // so it cannot answer "is stories capture down?". Count whole-account
    // failures separately — only this one is incremented in catch(acctRunErr).
    let accountsFailed = 0;

    for (const account of accountList) {
      let perAccountUpserted = 0;
      let perAccountInsights = 0;
      try {
        const stories = await getStories(account.ig_user_id, {
          accessToken,
          apiVersion: GRAPH_API_VERSION,
        });
        for (const story of stories) {
          try {
            const postedAt = story.timestamp ?? new Date().toISOString();
            const expiresAt = new Date(Date.parse(postedAt) + 24 * 60 * 60 * 1000).toISOString();
            const { error: upsertErr } = await supabase.from('ig_stories').upsert(
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
            // supabase-js RESOLVES on a DB error, it does not throw, so the
            // old code counted a failed upsert as a captured story. That was
            // survivable while nothing downstream read the count; it is not
            // survivable now that the success log row below asserts "stories
            // really landed" on the strength of it.
            if (upsertErr) throw upsertErr;
            storiesUpserted++;
            perAccountUpserted++;

            // Best-effort insights capture
            try {
              const insights = await getStoryInsights(story.id, {
                accessToken,
                apiVersion: GRAPH_API_VERSION,
              });
              const rows = insights.map((insight) => ({
                story_id: story.id,
                metric: insight.name,
                value: insight.values?.[0]?.value ?? 0,
                captured_at: new Date().toISOString(),
              }));
              if (rows.length > 0) {
                const { error: insightInsertErr } = await supabase
                  .from('ig_story_insights')
                  .insert(rows);
                // Same resolve-don't-throw trap as the story upsert above:
                // without this check a rejected insert still incremented the
                // count. Insights stay best-effort — a failure here is logged
                // and does not fail the story.
                if (insightInsertErr) throw insightInsertErr;
                insightsCaptured += rows.length;
                perAccountInsights += rows.length;
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

        // Record the attempt where this job can read it back. Replaces the
        // old `ig_accounts.update({ last_polled_at })` — see the header note:
        // that column has six writers, so stamping it both concealed this
        // job's failures behind another job's timestamp (jkkn_computerscience
        // errored at 2026-09-09 00:30:19Z and its last_polled_at reads
        // 00:30:33Z, written 14s later by the metrics poller) and corrupted
        // the metrics poller's fair-queue ordering key.
        //
        // `status` is CHECK-constrained to ('success','error'), so a partial
        // run cannot have its own status value. It is recorded as 'error'
        // with payload.partial — which is also what we want the freshness
        // query to see: `status='success'` must mean every story landed.
        const complete = perAccountUpserted === stories.length;
        await supabase.from('social_instagram_logs').insert({
          account_id: account.id,
          event_type: 'stories_poll',
          status: complete ? 'success' : 'error',
          error_message: complete
            ? null
            : `partial stories capture: ${perAccountUpserted}/${stories.length} stories upserted`,
          payload: {
            ig_user_id: account.ig_user_id,
            job: JOB_NAME,
            stories_seen: stories.length,
            stories_upserted: perAccountUpserted,
            insights_captured: perAccountInsights,
            ...(complete ? {} : { partial: true }),
          },
        });
      } catch (acctRunErr) {
        errors++;
        accountsFailed++;
        console.error(`[cron:${JOB_NAME}] account ${account.id} failed:`, acctRunErr);
        // Best-effort audit log — schema: account_id / event_type / status / payload
        await supabase.from('social_instagram_logs').insert({
          account_id: account.id,
          event_type: 'stories_poll',
          status: 'error',
          error_message:
            acctRunErr instanceof Error ? acctRunErr.message : String(acctRunErr),
          payload: { ig_user_id: account.ig_user_id, job: JOB_NAME },
        });
      }
    }

    const elapsedMs = Date.now() - started;

    // A run where every account threw returned ok:true / HTTP 200, so Vercel
    // showed green through a 91-day outage. Fail loudly instead.
    //
    // Deliberately NO `first_error` in this body. The underlying Graph error
    // is `Headers.append: "Bearer <token>" is an invalid header value`, and
    // redactCredentials (lib/meta/graph-api-client.ts:40-42) cannot cross the
    // embedded newline that causes the throw: measured on prod 2026-09-09,
    // 29 of the newest 30 stories_poll error rows read "Bearer [REDACTED]"
    // and still carry 129 unredacted characters after the newline. Echoing
    // that into an HTTP body would widen live token material from one
    // RLS-protected table to the Vercel invocation log. The count and the
    // last-success timestamp are the operator signal; the detail stays in
    // social_instagram_logs.
    const totalOutage = accountList.length > 0 && accountsFailed === accountList.length;
    if (totalOutage) {
      return NextResponse.json(
        {
          ok: false,
          job: JOB_NAME,
          ran_at: ranAt,
          elapsed_ms: elapsedMs,
          outage: true,
          accounts_polled: accountList.length,
          accounts_failed: accountsFailed,
          stories_upserted: storiesUpserted,
          insights_captured: insightsCaptured,
          errors,
          stories_last_success_at: lastSuccessIso,
          error: `stories capture is DOWN: all ${accountsFailed} account(s) failed; last successful stories capture: ${lastSuccessIso ?? 'never'}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: ranAt,
      elapsed_ms: elapsedMs,
      accounts_polled: accountList.length,
      accounts_failed: accountsFailed,
      stories_upserted: storiesUpserted,
      insights_captured: insightsCaptured,
      errors,
      stories_last_success_at: lastSuccessIso,
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
