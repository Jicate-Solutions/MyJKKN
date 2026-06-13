export const dynamic = 'force-dynamic';

// /api/cron/meta-subscription-drift-check
//
// Daily 21:30 UTC cron. Snapshots each Facebook Page + linked IG account's
// subscribed_apps state, the App-level /{app_id}/subscriptions state, and
// /debug_token for the META_PAGE_ACCESS_TOKEN. Inserts one row per asset
// per run into meta_subscription_audit, then emails the Director + fires
// Sentry if any drift is detected.
//
// Background: feedback_meta_system_user_app_must_match_webhook_app +
//             feedback_meta_2_level_webhook_subscription_required.
// Spec:       /tmp/meta-drift-cron-spec.md (2026-06-08).
// Auth:       Bearer CRON_SECRET (Vercel-provided in production).

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import { resend } from '@/lib/resend';
import { randomUUID } from 'node:crypto';

const GRAPH_VERSION = 'v25.0';
const JKKN_INSTITUTIONS_APP_ID =
  process.env.META_APP_ID ?? '437028995095541';
const MYJKKN_APP_ID = '1380007247501251';
const DIRECTOR_EMAIL = 'director@jkkn.ac.in';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

const FETCH_TIMEOUT_MS = 10_000;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type Verdict = 'healthy' | 'drift' | 'empty';
type DriftReason =
  | 'has_myjkkn_trap'
  | 'missing_jkkn_institutions'
  | 'extra_apps'
  | 'unsubscribed';

interface SubscribedApp {
  id: string;
  name: string;
}

interface DebugTokenSnapshot {
  app_id: string | null;
  is_valid: boolean | null;
  expires_at: string | null; // ISO, NULL for never-expiring
  raw: unknown;
}

interface AppLevelSubscriptionsSnapshot {
  active: boolean;
  has_page: boolean;
  has_instagram: boolean;
  raw: unknown;
}

interface AssetAuditRow {
  run_id: string;
  asset_type: 'page' | 'ig';
  asset_id: string;
  asset_name: string | null;
  subscribed_app_ids: string[];
  subscribed_app_names: string[];
  verdict: Verdict;
  drift_reason: DriftReason | null;
  app_subscription_active: boolean | null;
  token_debug_app_id: string | null;
  token_debug_is_valid: boolean | null;
  token_debug_expires_at: string | null;
  raw: unknown;
  error: string | null;
}

function classify(apps: SubscribedApp[]): {
  verdict: Verdict;
  drift_reason: DriftReason | null;
} {
  if (apps.length === 0) {
    return { verdict: 'empty', drift_reason: 'unsubscribed' };
  }
  if (apps.length === 1 && apps[0].id === JKKN_INSTITUTIONS_APP_ID) {
    return { verdict: 'healthy', drift_reason: null };
  }
  const ids = apps.map((a) => a.id);
  if (ids.includes(MYJKKN_APP_ID)) {
    return { verdict: 'drift', drift_reason: 'has_myjkkn_trap' };
  }
  if (!ids.includes(JKKN_INSTITUTIONS_APP_ID)) {
    return { verdict: 'drift', drift_reason: 'missing_jkkn_institutions' };
  }
  return { verdict: 'drift', drift_reason: 'extra_apps' };
}

async function fetchJson(url: string): Promise<{
  ok: boolean;
  status: number;
  json: any;
}> {
  const res = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json };
}

async function fetchSubscribedApps(
  assetId: string,
  pageToken: string
): Promise<{ apps: SubscribedApp[]; raw: unknown; error: string | null }> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${assetId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`;
    const { ok, json } = await fetchJson(url);
    if (!ok || json?.error) {
      return {
        apps: [],
        raw: json,
        error: json?.error?.message ?? 'subscribed_apps fetch failed',
      };
    }
    const apps = ((json?.data ?? []) as Array<{ id?: string; name?: string }>)
      .filter((a): a is { id: string; name?: string } => Boolean(a.id))
      .map((a) => ({ id: a.id, name: a.name ?? '(unnamed)' }));
    return { apps, raw: json, error: null };
  } catch (e) {
    return {
      apps: [],
      raw: null,
      error: e instanceof Error ? e.message : 'unknown error',
    };
  }
}

async function fetchDebugToken(
  inputToken: string,
  appAccessToken: string
): Promise<DebugTokenSnapshot> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appAccessToken)}`;
    const { ok, json } = await fetchJson(url);
    if (!ok || !json?.data) {
      return { app_id: null, is_valid: null, expires_at: null, raw: json };
    }
    const data = json.data as {
      app_id?: string;
      is_valid?: boolean;
      expires_at?: number;
    };
    const expSec = data.expires_at;
    const expires_at =
      expSec && expSec > 0 ? new Date(expSec * 1000).toISOString() : null;
    return {
      app_id: data.app_id ?? null,
      is_valid: data.is_valid ?? null,
      expires_at,
      raw: json,
    };
  } catch (e) {
    return {
      app_id: null,
      is_valid: null,
      expires_at: null,
      raw: { error: e instanceof Error ? e.message : 'unknown error' },
    };
  }
}

async function fetchAppLevelSubscriptions(
  appAccessToken: string
): Promise<AppLevelSubscriptionsSnapshot> {
  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${JKKN_INSTITUTIONS_APP_ID}/subscriptions?access_token=${encodeURIComponent(appAccessToken)}`;
    const { ok, json } = await fetchJson(url);
    if (!ok || !json?.data) {
      return { active: false, has_page: false, has_instagram: false, raw: json };
    }
    const data = json.data as Array<{
      object?: string;
      active?: boolean;
    }>;
    const has_page = data.some((d) => d.object === 'page' && d.active === true);
    const has_instagram = data.some(
      (d) => d.object === 'instagram' && d.active === true
    );
    return {
      active: has_page && has_instagram,
      has_page,
      has_instagram,
      raw: json,
    };
  } catch (e) {
    return {
      active: false,
      has_page: false,
      has_instagram: false,
      raw: { error: e instanceof Error ? e.message : 'unknown error' },
    };
  }
}

interface DriftedAssetSummary {
  asset_type: 'page' | 'ig';
  asset_id: string;
  asset_name: string | null;
  verdict: Verdict;
  drift_reason: DriftReason | null;
  subscribed_app_names: string[];
  last_healthy_at: string | null;
}

function buildDriftEmailHtml(args: {
  drifted: DriftedAssetSummary[];
  totalAssets: number;
  checkedAt: string;
  runId: string;
  tokenDrift: boolean;
  tokenDebugAppId: string | null;
  appLevelDrift: boolean;
}): string {
  const {
    drifted,
    totalAssets,
    checkedAt,
    runId,
    tokenDrift,
    tokenDebugAppId,
    appLevelDrift,
  } = args;

  const checkedAtIst = new Date(checkedAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
  });

  const tokenDriftBlock = tokenDrift
    ? `<p style="background:#fef2f2;padding:12px;border-left:4px solid #b91c1c">
         <strong>CRITICAL - Token misconfigured.</strong>
         The META_PAGE_ACCESS_TOKEN env var belongs to App ID
         <code>${tokenDebugAppId ?? '(unknown)'}</code>, not JKKN Institutions
         (<code>${JKKN_INSTITUTIONS_APP_ID}</code>). This is the same root
         cause as the 2026-06 webhook outage. Rotate the token via Business
         Manager &rarr; System Users &rarr; myjkkn_ads_api &rarr;
         "Generate New Token" for the JKKN Institutions App.
       </p>`
    : '';

  const appLevelBlock = appLevelDrift
    ? `<p style="background:#fef2f2;padding:12px;border-left:4px solid #b91c1c">
         <strong>App-level subscription incomplete.</strong>
         <code>/${JKKN_INSTITUTIONS_APP_ID}/subscriptions</code> is missing one
         or both of <code>object='page'</code> and <code>object='instagram'</code>.
         Re-run the App Dashboard webhook setup in Meta App Dashboard.
       </p>`
    : '';

  const rows = drifted
    .map(
      (d) => `<tr>
      <td style="padding:8px;border:1px solid #e5e7eb">${d.asset_name ?? d.asset_id}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${d.asset_type}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${d.subscribed_app_names.join(', ') || '—'}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${d.drift_reason ?? '—'}</td>
      <td style="padding:8px;border:1px solid #e5e7eb">${
        d.last_healthy_at
          ? new Date(d.last_healthy_at).toLocaleString('en-IN', {
              timeZone: 'Asia/Kolkata',
            })
          : '—'
      }</td>
    </tr>`
    )
    .join('');

  return `<h2 style="color:#b91c1c">Meta subscription drift detected</h2>
<p>The daily drift-check cron found that <strong>${drifted.length} of ${totalAssets}</strong> assets are no longer correctly subscribed to the JKKN Institutions App (${JKKN_INSTITUTIONS_APP_ID}).</p>

<p><strong>Run:</strong> ${checkedAtIst} &nbsp; &middot; &nbsp; <strong>run_id:</strong> <code>${runId}</code></p>

${tokenDriftBlock}
${appLevelBlock}

<h3>Drifted assets</h3>
<table style="border-collapse:collapse;width:100%">
  <thead>
    <tr style="background:#f3f4f6">
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Asset</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Type</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Currently subscribed to</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Issue</th>
      <th style="text-align:left;padding:8px;border:1px solid #e5e7eb">Last healthy</th>
    </tr>
  </thead>
  <tbody>
    ${rows || '<tr><td colspan="5" style="padding:8px;border:1px solid #e5e7eb">—</td></tr>'}
  </tbody>
</table>

<p style="margin-top:16px">
  <a href="${APP_URL}/admission/social/facebook" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open Facebook panel</a>
  &nbsp;
  <a href="${APP_URL}/admission/social/instagram" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open Instagram panel</a>
</p>

<p style="color:#6b7280;font-size:12px;margin-top:24px">
  This is an automated alert from /api/cron/meta-subscription-drift-check.
  Reference: feedback_meta_system_user_app_must_match_webhook_app.
</p>`;
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();
  const runId = randomUUID();
  const checkedAt = new Date().toISOString();

  try {
    const token = process.env.META_PAGE_ACCESS_TOKEN;
    const appSecret = process.env.META_APP_SECRET;

    if (!token || !appSecret) {
      Sentry.captureMessage('Meta drift-check cron missing env', {
        level: 'error',
        tags: { feature: 'meta_subscriptions', event: 'drift_cron_misconfig' },
        extra: {
          has_token: Boolean(token),
          has_app_secret: Boolean(appSecret),
        },
      });
      return NextResponse.json(
        {
          ok: false,
          error: 'META_PAGE_ACCESS_TOKEN or META_APP_SECRET unset',
        },
        { status: 500 }
      );
    }

    const supabase = getServiceClient();
    const appAccessToken = `${JKKN_INSTITUTIONS_APP_ID}|${appSecret}`;

    // 1. debug_token + app-level subscription state (in parallel)
    const [debugToken, appLevel] = await Promise.all([
      fetchDebugToken(token, appAccessToken),
      fetchAppLevelSubscriptions(appAccessToken),
    ]);

    const tokenDrift =
      debugToken.app_id !== null &&
      debugToken.app_id !== JKKN_INSTITUTIONS_APP_ID;
    const appLevelDrift = !appLevel.active;

    // 2. /me/accounts (Pages list with linked IG)
    const accountsUrl =
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts` +
      `?fields=id,name,access_token,instagram_business_account{id,username}` +
      `&limit=100&access_token=${encodeURIComponent(token)}`;
    const accountsRes = await fetchJson(accountsUrl);

    const rows: AssetAuditRow[] = [];
    const errors: Array<{ asset_id: string; error: string }> = [];
    let pagesChecked = 0;
    let igChecked = 0;

    if (!accountsRes.ok || accountsRes.json?.error) {
      const msg =
        accountsRes.json?.error?.message ??
        `Meta /me/accounts returned HTTP ${accountsRes.status}`;
      errors.push({ asset_id: '/me/accounts', error: msg });
      Sentry.captureMessage('Meta drift-check: /me/accounts failed', {
        level: 'error',
        tags: { feature: 'meta_subscriptions', event: 'drift_cron_failure' },
        extra: { error: msg, run_id: runId },
      });
    } else {
      const rawPages =
        (accountsRes.json?.data as Array<{
          id: string;
          name: string;
          access_token: string;
          instagram_business_account?: { id: string; username?: string };
        }>) ?? [];

      // 3. Parallel per-Page: page subscribed_apps + ig subscribed_apps
      const pageResults = await Promise.all(
        rawPages.map(async (p) => {
          const pageFetch = await fetchSubscribedApps(p.id, p.access_token);
          let igRow: AssetAuditRow | null = null;
          if (p.instagram_business_account?.id) {
            const igFetch = await fetchSubscribedApps(
              p.instagram_business_account.id,
              p.access_token
            );
            const igClassified = classify(igFetch.apps);
            igRow = {
              run_id: runId,
              asset_type: 'ig',
              asset_id: p.instagram_business_account.id,
              asset_name: p.instagram_business_account.username ?? null,
              subscribed_app_ids: igFetch.apps.map((a) => a.id).sort(),
              subscribed_app_names: igFetch.apps
                .slice()
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((a) => a.name),
              verdict: igClassified.verdict,
              drift_reason: igClassified.drift_reason,
              app_subscription_active: appLevel.active,
              token_debug_app_id: debugToken.app_id,
              token_debug_is_valid: debugToken.is_valid,
              token_debug_expires_at: debugToken.expires_at,
              raw: igFetch.raw,
              error: igFetch.error,
            };
            if (igFetch.error) {
              errors.push({
                asset_id: p.instagram_business_account.id,
                error: igFetch.error,
              });
            }
          }
          const pageClassified = classify(pageFetch.apps);
          const pageRow: AssetAuditRow = {
            run_id: runId,
            asset_type: 'page',
            asset_id: p.id,
            asset_name: p.name,
            subscribed_app_ids: pageFetch.apps.map((a) => a.id).sort(),
            subscribed_app_names: pageFetch.apps
              .slice()
              .sort((a, b) => a.id.localeCompare(b.id))
              .map((a) => a.name),
            verdict: pageClassified.verdict,
            drift_reason: pageClassified.drift_reason,
            app_subscription_active: appLevel.active,
            token_debug_app_id: debugToken.app_id,
            token_debug_is_valid: debugToken.is_valid,
            token_debug_expires_at: debugToken.expires_at,
            raw: pageFetch.raw,
            error: pageFetch.error,
          };
          if (pageFetch.error) {
            errors.push({ asset_id: p.id, error: pageFetch.error });
          }
          return { pageRow, igRow };
        })
      );

      for (const { pageRow, igRow } of pageResults) {
        rows.push(pageRow);
        pagesChecked++;
        if (igRow) {
          rows.push(igRow);
          igChecked++;
        }
      }
    }

    // 4. Bulk insert (or skip if nothing to insert)
    if (rows.length > 0) {
      const { error: insErr } = await supabase
        .from('meta_subscription_audit')
        .insert(rows);
      if (insErr) {
        Sentry.captureException(insErr, {
          tags: {
            feature: 'meta_subscriptions',
            event: 'drift_cron_insert_failure',
          },
          extra: { run_id: runId, rows: rows.length },
        });
        // Don't return — we still want to alert if there is drift.
      }
    }

    // 5. Drift summary
    const driftedRows = rows.filter((r) => r.verdict === 'drift');
    const criticalDrift =
      tokenDrift || appLevelDrift || driftedRows.length > 0;

    // 6. Compute last_healthy_at per drifted asset (batched single query)
    const lastHealthyByAssetId = new Map<string, string>();
    if (driftedRows.length > 0) {
      const driftedAssetIds = driftedRows.map((r) => r.asset_id);
      const { data: healthyHist } = await supabase
        .from('meta_subscription_audit')
        .select('asset_id, checked_at')
        .in('asset_id', driftedAssetIds)
        .eq('verdict', 'healthy')
        .order('checked_at', { ascending: false });
      for (const h of healthyHist ?? []) {
        if (!lastHealthyByAssetId.has(h.asset_id)) {
          lastHealthyByAssetId.set(h.asset_id, h.checked_at);
        }
      }
    }

    const driftedSummary: DriftedAssetSummary[] = driftedRows.map((r) => ({
      asset_type: r.asset_type,
      asset_id: r.asset_id,
      asset_name: r.asset_name,
      verdict: r.verdict,
      drift_reason: r.drift_reason,
      subscribed_app_names: r.subscribed_app_names,
      last_healthy_at: lastHealthyByAssetId.get(r.asset_id) ?? null,
    }));

    // 7. Notify
    if (criticalDrift) {
      Sentry.captureMessage('Meta subscription drift detected', {
        level: 'warning',
        tags: {
          feature: 'meta_subscriptions',
          event: 'drift_detected',
        },
        extra: {
          run_id: runId,
          drifted_count: driftedRows.length,
          assets_total: rows.length,
          token_drift: tokenDrift,
          token_debug_app_id: debugToken.app_id,
          app_level_drift: appLevelDrift,
        },
      });

      if (process.env.RESEND_API_KEY) {
        try {
          await resend.emails.send(
            {
              from: FROM_EMAIL,
              to: DIRECTOR_EMAIL,
              subject: `[MyJKKN SRE] Meta subscription drift detected — ${driftedRows.length} assets affected`,
              html: buildDriftEmailHtml({
                drifted: driftedSummary,
                totalAssets: rows.length,
                checkedAt,
                runId,
                tokenDrift,
                tokenDebugAppId: debugToken.app_id,
                appLevelDrift,
              }),
            },
            {
              headers: {
                'Idempotency-Key': `meta-drift-${runId}`,
              },
            }
          );
        } catch (emailErr) {
          Sentry.captureException(emailErr, {
            tags: {
              feature: 'meta_subscriptions',
              event: 'drift_cron_email_failure',
            },
            extra: { run_id: runId },
          });
        }
      }
    } else {
      Sentry.captureMessage('Meta subscription drift check clean', {
        level: 'info',
        tags: {
          feature: 'meta_subscriptions',
          event: 'drift_check_complete',
        },
        extra: {
          run_id: runId,
          assets_checked: rows.length,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      run_id: runId,
      checked_at: checkedAt,
      assets_checked: rows.length,
      pages_checked: pagesChecked,
      ig_checked: igChecked,
      drift_detected: criticalDrift,
      drifted_assets: driftedSummary.map((d) => ({
        asset_type: d.asset_type,
        asset_id: d.asset_id,
        asset_name: d.asset_name,
        verdict: d.verdict,
        drift_reason: d.drift_reason,
      })),
      token_drift: tokenDrift,
      app_level_drift: appLevelDrift,
      duration_ms: Date.now() - start,
      errors,
    });
  } catch (e) {
    Sentry.captureException(e, {
      tags: {
        feature: 'meta_subscriptions',
        event: 'drift_cron_unhandled_failure',
      },
      extra: { run_id: runId },
    });
    return NextResponse.json(
      {
        ok: false,
        run_id: runId,
        error: e instanceof Error ? e.message : 'unknown',
      },
      { status: 500 }
    );
  }
}
