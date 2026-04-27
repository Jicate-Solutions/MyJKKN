// =====================================================================
// Sentry Lane 2 — silent-failure ingestion into bug_reports
// =====================================================================
// Lane 1 (server-side every 6h) classifies USER-REPORTED bug_reports.
// Lane 2 (this file, every 6h offset by :29) ingests SENTRY-DETECTED
// issues that no human reported — the most expensive bug class because
// nobody complains until data is corrupted.
//
// Strategy: poll Sentry's issue list for the last 6h, dedupe against
// bug_reports.metadata.sentry_issue_id, insert new ones with
// category='sentry-silent'. Lane 1 then triages them automatically
// (writes metadata.triage) — no change to existing routine code.
//
// Auth: CRON_SECRET via Authorization Bearer header OR ?secret= query.
// Same pattern as cron/dashboard-work-items (see PR #285 follow-up).
//
// Required env:
//   - CRON_SECRET           — cron invoker auth (already in Vercel)
//   - SENTRY_AUTH_TOKEN     — Sentry API token, scopes: org:read project:read
//   - SENTRY_ORG_SLUG       — defaults to 'jkkn-em'
//   - SENTRY_PROJECT_SLUG   — defaults to 'javascript-nextjs'
//
// Created: 2026-04-27 — feat/sentry-leverage-lane2.

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

const SENTRY_API_BASE = 'https://sentry.io/api/0';
const ORG_SLUG = process.env.SENTRY_ORG_SLUG || 'jkkn-em';
const PROJECT_SLUG = process.env.SENTRY_PROJECT_SLUG || 'javascript-nextjs';

interface SentryIssue {
  id: string;
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  status: string;
  count: string;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  metadata?: { value?: string; type?: string; filename?: string };
  tags?: Array<{ key: string; value: string }>;
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const sentryToken = process.env.SENTRY_AUTH_TOKEN;
  if (!sentryToken) {
    return NextResponse.json(
      { ok: false, error: 'SENTRY_AUTH_TOKEN not configured (add to Vercel env vars)' },
      { status: 500 }
    );
  }

  const supabase = createServiceRoleClient();

  // 1. Fetch unresolved Sentry issues from last 6h.
  //    statsPeriod=6h is Sentry's window; sort=created shows newest first.
  const sentryUrl = `${SENTRY_API_BASE}/projects/${ORG_SLUG}/${PROJECT_SLUG}/issues/?statsPeriod=6h&query=is:unresolved&sort=created&limit=100`;
  let issues: SentryIssue[] = [];
  try {
    const response = await fetch(sentryUrl, {
      headers: { Authorization: `Bearer ${sentryToken}` },
      cache: 'no-store'
    });
    if (!response.ok) {
      const body = await response.text();
      console.error('[cron/sentry-lane-2] Sentry API error:', response.status, body.slice(0, 500));
      return NextResponse.json(
        { ok: false, error: `Sentry API ${response.status}`, body: body.slice(0, 500) },
        { status: 502 }
      );
    }
    issues = await response.json();
  } catch (err) {
    console.error('[cron/sentry-lane-2] Sentry fetch failed:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }

  if (issues.length === 0) {
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      sentry_issues_found: 0,
      bug_reports_inserted: 0,
      bug_reports_skipped_dedup: 0
    });
  }

  // 2. Dedupe against existing bug_reports.metadata.sentry_issue_id.
  //    Postgres jsonb operator ->> extracts as text. We pass an array of
  //    issue IDs and filter server-side to keep this cheap.
  const issueIds = issues.map((i) => i.id);
  const { data: existing, error: dedupErr } = await supabase
    .from('bug_reports')
    .select('id, metadata')
    .eq('category', 'sentry-silent')
    .filter('metadata->>sentry_issue_id', 'in', `(${issueIds.map((id) => `"${id}"`).join(',')})`);

  if (dedupErr) {
    console.error('[cron/sentry-lane-2] Dedup query failed:', dedupErr);
    return NextResponse.json(
      { ok: false, error: dedupErr.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  const existingIds = new Set(
    (existing || [])
      .map((r) => (r.metadata as Record<string, unknown> | null)?.sentry_issue_id)
      .filter(Boolean) as string[]
  );

  const fresh = issues.filter((i) => !existingIds.has(i.id));

  if (fresh.length === 0) {
    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - started,
      sentry_issues_found: issues.length,
      bug_reports_inserted: 0,
      bug_reports_skipped_dedup: issues.length
    });
  }

  // 3. Map Sentry issues to bug_reports rows.
  //    page_url is NOT NULL — fall back to permalink if culprit missing.
  //    priority derived from Sentry level (error→high, warning→medium, info→low).
  //    module_name parsed from culprit (e.g. 'app/(routes)/admission/page.tsx in Page').
  const rows = fresh.map((i) => {
    const tagMap = Object.fromEntries((i.tags || []).map((t) => [t.key, t.value]));
    const priority =
      i.level === 'fatal' || i.level === 'error'
        ? 'high'
        : i.level === 'warning'
          ? 'medium'
          : 'low';
    return {
      reporter_user_id: null,
      page_url: i.permalink || `https://${ORG_SLUG}.sentry.io/issues/${i.id}/`,
      description: `[${i.shortId}] ${i.title}${i.culprit ? `\n\nCulprit: ${i.culprit}` : ''}\n\nFirst seen: ${i.firstSeen}\nLast seen: ${i.lastSeen}\nEvent count: ${i.count}\nUsers affected: ${i.userCount}`,
      status: 'new',
      category: 'sentry-silent',
      priority,
      module_name: extractModule(i.culprit),
      institution_id: tagMap.institution_id && tagMap.institution_id !== 'none' ? tagMap.institution_id : null,
      metadata: {
        source: 'sentry-silent',
        sentry_issue_id: i.id,
        sentry_short_id: i.shortId,
        sentry_permalink: i.permalink,
        sentry_level: i.level,
        sentry_culprit: i.culprit,
        sentry_first_seen: i.firstSeen,
        sentry_last_seen: i.lastSeen,
        sentry_event_count: parseInt(i.count, 10) || 0,
        sentry_user_count: i.userCount,
        sentry_metadata_value: i.metadata?.value,
        sentry_metadata_type: i.metadata?.type,
        sentry_user_role: tagMap.role,
        sentry_user_kind: tagMap.user_kind,
        sentry_is_super_admin: tagMap.is_super_admin
      }
    };
  });

  const { error: insertErr } = await supabase.from('bug_reports').insert(rows);
  if (insertErr) {
    console.error('[cron/sentry-lane-2] Insert failed:', insertErr);
    return NextResponse.json(
      { ok: false, error: insertErr.message, elapsed_ms: Date.now() - started },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - started,
    sentry_issues_found: issues.length,
    bug_reports_inserted: fresh.length,
    bug_reports_skipped_dedup: issues.length - fresh.length,
    inserted_short_ids: fresh.map((i) => i.shortId)
  });
}

function extractModule(culprit: string | null): string | null {
  if (!culprit) return null;
  // Sentry culprits look like:
  //   'app/(routes)/admission/page.tsx in Page'
  //   '/api/bug-reports/route.ts in GET'
  //   'lib/services/billing/invoice-service.ts'
  // Take first path segment after 'app/' or 'lib/' as a coarse module.
  const m = culprit.match(/^(?:app\/(?:\([^)]+\)\/)?|lib\/(?:services\/)?)([\w-]+)/);
  return m ? m[1] : null;
}
