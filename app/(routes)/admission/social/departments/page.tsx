'use client';

/**
 * Admin / Social Media / Department Accounts — credential + status directory.
 *
 * One place for every department-level Instagram handle across the JKKN
 * colleges (imported from the "Department-Wise Logins" sheet into
 * social_dept_accounts). Shows handle, login email, masked password
 * (reveal/copy), ContentStudio + Business Suite connection status, and
 * whether the handle is wired into the Graph-API monitoring pipeline
 * (ig_account_id → "Monitored").
 *
 * RLS on social_dept_accounts is admin-only OR social.departments.view
 * (credential vault), matching the PermissionGuard gate below — users
 * without the key get zero rows even if they reach the query.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Copy, Instagram, Check, Link2, Unlink, Repeat } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DeptAccountRow {
  id: string;
  platform: string;
  college_label: string;
  department_name_raw: string;
  username: string;
  login_email: string | null;
  content_studio_connected: boolean | null;
  business_suite_connected: boolean | null;
  ig_account_id: string | null;
  notes: string | null;
  institutions: { name: string } | null;
  departments: { department_name: string } | null;
}

/** Actual monitoring state from ig_accounts — the GROUND TRUTH the manual
 *  business_suite_connected / content_studio_connected flags are supposed to
 *  reflect but don't always. metrics_source is written by the Graph-API sync
 *  from what Meta actually exposes:
 *    'graph'              → Page-linked, FULL insights (reach/impressions/…)
 *    'instagram_login'    → per-account IG Login, also full insights
 *    'business_discovery' → public metrics only (followers/likes) — LIMITED
 *  Readable client-side by super_admin + social.instagram.view (the only
 *  non-super-admin role with social.departments.view — `seo` — also holds it). */
interface IgAccountRow {
  id: string;
  username: string;
  metrics_source: string | null;
  /** Written by the pollers on every SUCCESSFUL tick only — the failure paths
   *  never touch the ig_accounts row. So this is the one field that separates a
   *  handle Meta is still answering for from one it stopped answering for. */
  last_polled_at: string | null;
}

/** An account is truly "unlocked" (receiving full insights) only when Meta
 *  actually feeds it — graph (Business-Suite/Page path) or instagram_login. */
function isLiveInsights(ms: string | null | undefined): boolean {
  return ms === 'graph' || ms === 'instagram_login';
}

/** Instagram Business Login connection status (token column is not readable
 *  client-side — service_role only via column-level grant). */
interface IgConnectionRow {
  id: string;
  dept_account_id: string | null;
  username: string;
  status: 'active' | 'expired' | 'revoked' | 'error';
  expires_at: string;
  connected_at: string;
  last_polled_at: string | null;
}

/** Pick the connection to display when several map to one dept:
 *  active beats non-active; ties go to the most recent connection. */
function preferConnection(
  a: IgConnectionRow | undefined,
  b: IgConnectionRow
): IgConnectionRow {
  if (!a) return b;
  const aActive = a.status === 'active';
  const bActive = b.status === 'active';
  if (aActive !== bActive) return bActive ? b : a;
  return b.connected_at > a.connected_at ? b : a;
}

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Department Accounts' },
];

/** Sheet order for the college groups. */
const COLLEGE_ORDER = [
  'Dental College',
  'Allied Health Science',
  'Pharmacy',
  'Nursing',
  'Engineering',
  'Arts',
];

function connChip(value: boolean | null) {
  if (value === true) return <Badge variant="default">Connected</Badge>;
  if (value === false) return <Badge variant="outline">Not connected</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

/**
 * Days since a handle was last successfully polled, or null when we cannot say
 * (no timestamp, or the ig_accounts row is not in our visible set). Null must
 * render as the plain badge — absence of evidence is not evidence of staleness.
 */
function daysSincePoll(lastPolledAt: string | null | undefined): number | null {
  if (!lastPolledAt) return null;
  const t = Date.parse(lastPolledAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/** Every poller on this data runs hourly, so a healthy handle is refreshed ~24x
 *  a day. Three days absorbs a deploy freeze or a multi-hour Meta outage and
 *  still catches a real outage long before it becomes a quarter. */
const STALE_AFTER_DAYS = 3;

/**
 * "Monitored" used to be rendered from ig_account_id alone — purely "is this
 * handle linked into the pipeline", with no freshness input at all. That made a
 * dead handle visually identical to a working one: on 2026-09-09 @jkkn_otat
 * (last polled 2026-06-10, 90 days, 2,101 consecutive Meta rejections, 2 metric
 * snapshots ever) carried exactly the same "Monitored · Public only" pair as
 * @jkkn_pharmacology (polled that morning, 2,175 snapshots). The account row
 * kept its last-good state because the poller's failure path never writes to
 * ig_accounts, so the page had nothing to go on but the link.
 */
function monitoringChip(days: number | null) {
  if (days === null || days < STALE_AFTER_DAYS) {
    return <Badge variant="default">Monitored</Badge>;
  }
  return (
    <Badge
      variant="outline"
      className="w-fit border-amber-500/60 text-amber-700 dark:text-amber-500"
      title={`Linked, but Meta has not answered for this handle in ${days} days — its followers and post numbers are frozen at that date.`}
    >
      Monitored · stale {days}d
    </Badge>
  );
}

/**
 * The GROUND-TRUTH insight state for a handle, from ig_accounts.metrics_source.
 * The "⚠ marked connected, not live" mismatch is shown ONLY when we actually
 * have ground truth (igAvailable) AND the handle is confirmed not-live (public
 * metrics or no monitored row) — never while the source is loading/unavailable,
 * and never for a linked account still awaiting its first sync. Absence of
 * ground truth must not be rendered as confirmed drift.
 */
function liveInsightsChip(
  state: 'live' | 'public' | 'awaiting' | 'hidden' | 'none' | undefined,
  markedConnected: boolean | null,
  igLoaded: boolean,
  igAvailable: boolean
) {
  if (!igLoaded) return <span className="text-muted-foreground">…</span>;
  if (!igAvailable || state === 'hidden')
    // Cause-neutral: an empty ig_accounts result is ambiguous (RLS denial returns
    // zero rows with no error, indistinguishable from a permitted user with zero
    // monitored accounts), so we assert neither "no permission" nor "none exist".
    return (
      <span
        className="text-muted-foreground"
        title="Live-insights data isn't available for this view"
      >
        unavailable
      </span>
    );
  if (state === 'live')
    return (
      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600 dark:bg-emerald-500">
        Live · full insights
      </Badge>
    );
  if (state === 'awaiting')
    return (
      <Badge variant="outline" title="Linked — awaiting its first Graph-API sync">
        Awaiting first sync
      </Badge>
    );
  // 'public' or 'none' — confirmed not live. Flag drift only when it was MARKED.
  return (
    <div className="flex flex-col gap-0.5">
      <Badge variant="secondary" className="w-fit">
        {state === 'public' ? 'Public only' : 'Not monitored'}
      </Badge>
      {markedConnected === true && (
        <span className="text-xs text-amber-600 dark:text-amber-500">
          ⚠ marked connected, not live
        </span>
      )}
    </div>
  );
}

/**
 * Per-row Instagram Business Login control. "Connect now" sends THIS browser
 * to the Instagram authorize dialog; "Copy connect link" copies a 24h
 * shareable authorize URL to send to the staffer who is logged into the
 * department account on their own device.
 */
function IgLoginCell({
  dept,
  connection,
  onChanged,
  onActionError,
}: {
  dept: DeptAccountRow;
  connection: IgConnectionRow | undefined;
  onChanged: () => void;
  onActionError: (msg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const copyLink = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/social/instagram/connect?dept_id=${dept.id}&mode=link`
      );
      const json = await res.json();
      if (!res.ok) {
        onActionError(json.error ?? `Connect link failed (HTTP ${res.status})`);
        return;
      }
      await navigator.clipboard.writeText(json.authorize_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      onActionError(e instanceof Error ? e.message : 'Copy failed');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      const res = await fetch('/api/social/instagram/connect', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connection.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        onActionError(json.error ?? `Disconnect failed (HTTP ${res.status})`);
        return;
      }
      onChanged();
    } catch (e) {
      onActionError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setBusy(false);
    }
  };

  if (connection?.status === 'active') {
    const daysLeft = Math.max(
      0,
      Math.round(
        (new Date(connection.expires_at).getTime() - Date.now()) / 86400000
      )
    );
    return (
      <div className="flex items-center gap-1">
        <Badge variant="default" title={`Token expires in ~${daysLeft} days`}>
          Connected
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={disconnect}
          disabled={busy}
          aria-label={`Disconnect Instagram Login for @${dept.username}`}
          title="Disconnect"
        >
          <Unlink className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const needsReconnect =
    connection?.status === 'expired' || connection?.status === 'error';

  return (
    <div className="flex items-center gap-1">
      {needsReconnect && (
        <Badge variant="destructive">
          {connection?.status === 'expired' ? 'Expired' : 'Error'}
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={busy}
        onClick={() => {
          window.location.href = `/api/social/instagram/connect?dept_id=${dept.id}`;
        }}
      >
        <Link2 className="mr-1 h-3.5 w-3.5" />
        {needsReconnect ? 'Reconnect' : 'Connect'}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={copyLink}
        disabled={busy}
        aria-label={`Copy connect link for @${dept.username}`}
        title="Copy connect link (valid 24h — send it to the account owner)"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-600" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}

export default function SocialDepartmentAccountsPage() {
  const [rows, setRows] = useState<DeptAccountRow[]>([]);
  const [connections, setConnections] = useState<IgConnectionRow[]>([]);
  const [igAccounts, setIgAccounts] = useState<IgAccountRow[]>([]);
  // ig_accounts.id values that have at least one row in ig_posts. The loop reads
  // the last N posts with NO date filter, so "has ever posted" is exactly the
  // condition for a loop that can show something. Deliberately NOT read from
  // ig_accounts.last_post_at: that column is null on 54 of 71 accounts and
  // disagrees with ig_posts on 16 of 50 live departments (checked 2026-09-07).
  const [accountsWithPosts, setAccountsWithPosts] = useState<Set<string> | null>(null);
  const [igLoaded, setIgLoaded] = useState(false);
  const [igError, setIgError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    // social_dept_accounts + ig_account_connections are not in the generated
    // Database types (types/supabase.ts) — with the typed client, inference
    // on these two selects blows TS's instantiation depth (TS2589). Untyped
    // client here; results are cast to the explicit row interfaces above.
    const supabase = createClientSupabaseClient() as unknown as SupabaseClient;
    // Reset the ground-truth error on every (re)load — load() re-runs on each
    // connect/disconnect, so a past transient failure must not permanently pin
    // the Live-insights UI to "unavailable" after a later successful refetch.
    setIgError(null);
    supabase
      .from('social_dept_accounts')
      .select(
        'id, platform, college_label, department_name_raw, username, login_email, content_studio_connected, business_suite_connected, ig_account_id, notes, institutions(name), departments(department_name)'
      )
      .order('college_label')
      .order('department_name_raw')
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRows((data as unknown as DeptAccountRow[]) ?? []);
        setLoading(false);
      });
    // Connection status (RLS admin-only; access_token column is not granted
    // to authenticated, so it is deliberately absent from this select).
    supabase
      .from('ig_account_connections')
      .select(
        'id, dept_account_id, username, status, expires_at, connected_at, last_polled_at'
      )
      .then(({ data }) => {
        setConnections((data as unknown as IgConnectionRow[]) ?? []);
      });
    // Ground-truth monitoring state. metrics_source ('graph' = full insights,
    // 'business_discovery' = public only) is what the manual connection flags
    // are supposed to reflect. RLS on ig_accounts requires social.instagram.view
    // (a DIFFERENT grant from this page's social.departments.view) OR super_admin.
    // A role with departments.view but not instagram.view would get an empty/denied
    // result — which must render as "unavailable", NOT as "nothing is live" (that
    // would fabricate drift). Track the load + error so the UI can tell them apart.
    // await + try/catch rather than .then().catch(): PostgREST's builder is a
    // PromiseLike, not a Promise, so it has no .catch — main's newer
    // postgrest-js types make that an error (TS2339) rather than the silent
    // any it used to be. Behaviour is unchanged: a rejected request (network
    // failure) must still set igLoaded, or the tiles and the Loop column pin
    // on "…" forever.
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from('ig_accounts')
          .select('id, username, metrics_source, last_polled_at');
        if (err) setIgError(err.message);
        else setIgAccounts((data as unknown as IgAccountRow[]) ?? []);
      } catch (e: unknown) {
        setIgError(e instanceof Error ? e.message : String(e));
      } finally {
        setIgLoaded(true);
      }
    })();

    // Which handles have any post at all. ig_posts carries the same policy pair
    // as ig_accounts (institution scope OR social.instagram.view), so a caller
    // who can see the accounts above can see these. On any failure this stays
    // null, which renders the Loop cell as "unknown" (a link, as before) rather
    // than fabricating "no posts" for every department.
    // Paged deliberately: ig_posts is already 1,009 rows and grows, while
    // PostgREST caps a single response (commonly at 1,000). An unpaged read
    // would silently truncate and mark a posting department "No posts yet".
    // Any error abandons the read and leaves the state null = unknown.
    void (async () => {
      const PAGE = 1000;
      const found = new Set<string>();
      for (let from = 0; ; from += PAGE) {
        const { data, error: err } = await supabase
          .from('ig_posts')
          .select('account_id')
          .range(from, from + PAGE - 1);
        if (err || !data) return; // stays null → link shown, never a false "no posts"
        for (const row of data as { account_id: string }[]) found.add(row.account_id);
        if (data.length < PAGE) break;
      }
      setAccountsWithPosts(found);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connectionByDept = useMemo(() => {
    const map = new Map<string, IgConnectionRow>();
    for (const c of connections) {
      if (c.dept_account_id) {
        map.set(c.dept_account_id, preferConnection(map.get(c.dept_account_id), c));
      }
    }
    // fallback: match by handle for connections stored without a dept binding
    const byUsername = new Map<string, IgConnectionRow>();
    for (const c of connections) {
      const key = c.username.toLowerCase();
      byUsername.set(key, preferConnection(byUsername.get(key), c));
    }
    for (const r of rows) {
      if (!map.has(r.id)) {
        const c = byUsername.get(r.username.toLowerCase());
        if (c) map.set(r.id, c);
      }
    }
    return map;
  }, [connections, rows]);

  // Ground truth is only usable once the ig_accounts fetch resolved WITH rows.
  // Empty (RLS denied for a role lacking social.instagram.view) or not-yet-loaded
  // must render as "unavailable", never as "0 live / everything is drift".
  /** dept row id -> resolved ig_accounts.id, matched exactly as insightByDept
   *  does (ig_account_id first, then username). Used only to ask "has this
   *  handle ever posted", which decides whether its loop can show anything. */
  const acctIdByDept = useMemo(() => {
    const byUsername = new Map<string, string>();
    const ids = new Set<string>();
    for (const a of igAccounts) {
      ids.add(a.id);
      byUsername.set(a.username.toLowerCase(), a.id);
    }
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.ig_account_id && ids.has(r.ig_account_id)) map.set(r.id, r.ig_account_id);
      else {
        const viaName = byUsername.get(r.username.toLowerCase());
        if (viaName) map.set(r.id, viaName);
      }
    }
    return map;
  }, [rows, igAccounts]);

  /** ig_accounts.id -> last successful poll. Read through acctIdByDept, which
   *  only resolves accounts we can actually see, so a row hidden by partial RLS
   *  stays "unknown freshness" and keeps the plain badge. */
  const lastPolledByAcct = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const a of igAccounts) map.set(a.id, a.last_polled_at);
    return map;
  }, [igAccounts]);

  const igAvailable = igLoaded && !igError && igAccounts.length > 0;

  // dept row id -> real insight state (only meaningful when igAvailable):
  //   'live'     graph / instagram_login — full insights flowing
  //   'public'   business_discovery — public metrics only
  //   'awaiting' backing ig_accounts row exists but metrics_source is still null
  //              (linked, awaiting its first Graph-API sync — NOT drift)
  //   'hidden'   dept row IS linked (ig_account_id set) but that ig_accounts row
  //              is not in our visible set (partial RLS) — unknown, NOT drift
  //   'none'     dept row has no ig_account_id at all — genuinely unmonitored
  // Match on the linked ig_account_id first (authoritative), then handle.
  type InsightState = 'live' | 'public' | 'awaiting' | 'hidden' | 'none';
  const insightByDept = useMemo(() => {
    const byId = new Map<string, string | null>();
    const byUsername = new Map<string, string | null>();
    for (const a of igAccounts) {
      byId.set(a.id, a.metrics_source);
      byUsername.set(a.username.toLowerCase(), a.metrics_source);
    }
    const map = new Map<string, InsightState>();
    for (const r of rows) {
      let ms: string | null | undefined;
      let matched = false;
      if (r.ig_account_id && byId.has(r.ig_account_id)) {
        ms = byId.get(r.ig_account_id);
        matched = true;
      } else if (byUsername.has(r.username.toLowerCase())) {
        ms = byUsername.get(r.username.toLowerCase());
        matched = true;
      }
      let state: InsightState;
      if (matched) {
        state =
          ms === null ? 'awaiting' : isLiveInsights(ms) ? 'live' : 'public';
      } else if (r.ig_account_id) {
        // Linked to an ig_accounts row we cannot see (partial RLS): unknown,
        // must NOT be counted or badged as drift.
        state = 'hidden';
      } else {
        state = 'none';
      }
      map.set(r.id, state);
    }
    return map;
  }, [igAccounts, rows]);

  const grouped = useMemo(() => {
    const map = new Map<string, DeptAccountRow[]>();
    for (const r of rows) {
      const list = map.get(r.college_label) ?? [];
      list.push(r);
      map.set(r.college_label, list);
    }
    const known = COLLEGE_ORDER.filter((c) => map.has(c));
    const extra = [...map.keys()].filter((c) => !COLLEGE_ORDER.includes(c)).sort();
    return [...known, ...extra].map((c) => ({ college: c, accounts: map.get(c)! }));
  }, [rows]);

  const totals = useMemo(
    () => ({
      total: rows.length,
      businessSuite: rows.filter((r) => r.business_suite_connected === true).length,
      contentStudio: rows.filter((r) => r.content_studio_connected === true).length,
      monitored: rows.filter((r) => r.ig_account_id !== null).length,
      igLogin: connections.filter((c) => c.status === 'active').length,
      // Ground truth: handles Meta actually feeds full insights for. null when
      // the ig_accounts source is unavailable → tile renders "—", not a fake 0.
      liveInsights: igAvailable
        ? rows.filter((r) => insightByDept.get(r.id) === 'live').length
        : null,
      // The disparity: marked "Business Suite connected" but NOT actually live
      // and NOT merely awaiting a first sync. null when ground truth is absent.
      markedNotLive: igAvailable
        ? rows.filter((r) => {
            const s = insightByDept.get(r.id);
            return (
              r.business_suite_connected === true && (s === 'public' || s === 'none')
            );
          }).length
        : null,
    }),
    [rows, connections, insightByDept, igAvailable]
  );

  return (
    <PermissionGuard
      module="social.departments"
      action="view"
      fallback={
        <ContentLayout title="Department Social Accounts">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Department Social Accounts">
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Department handles</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Business Suite connected</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.businessSuite}</CardTitle>
              <p className="text-xs text-muted-foreground">manually flagged</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Live insights</CardDescription>
              <CardTitle className="text-3xl text-emerald-600 dark:text-emerald-500">
                {loading || !igLoaded ? '…' : (totals.liveInsights ?? '—')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Meta-verified · full insights</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Marked, not live</CardDescription>
              <CardTitle
                className={`text-3xl ${
                  !loading && igLoaded && (totals.markedNotLive ?? 0) > 0
                    ? 'text-amber-600 dark:text-amber-500'
                    : ''
                }`}
              >
                {loading || !igLoaded ? '…' : (totals.markedNotLive ?? '—')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">flagged but no live insights</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>ContentStudio connected</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.contentStudio}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>API-monitored</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.monitored}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>IG Login connected</CardDescription>
              <CardTitle className="text-3xl">{loading ? '…' : totals.igLogin}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {actionError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>Failed to load department accounts: {error}</AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <Alert className="mt-4">
            <AlertDescription>
              No department accounts in the registry yet.
            </AlertDescription>
          </Alert>
        )}

        {grouped.map(({ college, accounts }) => (
          <Card key={college} className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Instagram className="h-5 w-5" />
                {college}
              </CardTitle>
              <CardDescription>
                {accounts[0]?.institutions?.name ?? college} · {accounts.length} handle
                {accounts.length === 1 ? '' : 's'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead>Login email</TableHead>
                    <TableHead>Business Suite</TableHead>
                    <TableHead>Live insights</TableHead>
                    <TableHead>Monitoring</TableHead>
                    <TableHead>IG Login</TableHead>
                    <TableHead>Loop</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {r.departments?.department_name ?? r.department_name_raw}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`https://www.instagram.com/${r.username}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          @{r.username}
                        </a>
                      </TableCell>
                      <TableCell className="text-sm">{r.login_email ?? '—'}</TableCell>
                      <TableCell>{connChip(r.business_suite_connected)}</TableCell>
                      <TableCell>
                        {liveInsightsChip(
                          insightByDept.get(r.id),
                          r.business_suite_connected,
                          igLoaded,
                          igAvailable
                        )}
                      </TableCell>
                      <TableCell>
                        {r.ig_account_id ? (
                          monitoringChip(
                            daysSincePoll(
                              lastPolledByAcct.get(acctIdByDept.get(r.id) ?? '')
                            )
                          )
                        ) : (
                          <Badge variant="secondary">Not in pipeline</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <IgLoginCell
                          dept={r}
                          connection={connectionByDept.get(r.id)}
                          onChanged={load}
                          onActionError={setActionError}
                        />
                      </TableCell>
                      {/* Entry point to this department's own weekly READ →
                          DECIDE → LEARN cycle. The loop reads real signal
                          (saves/shares/comments), which only exists for handles
                          Meta feeds fully — so the link is offered only where
                          live insights are on. */}
                      <TableCell>
                        {(() => {
                          if (insightByDept.get(r.id) !== 'live') {
                            return (
                              <span
                                className="text-sm text-muted-foreground"
                                title="The loop scores saves, shares and comments — Meta only exposes those once full insights are on."
                              >
                                —
                              </span>
                            );
                          }
                          // Post presence is unknown until the ig_posts read lands
                          // (or if it failed). Offer the link rather than claim silence.
                          const acctId = acctIdByDept.get(r.id);
                          const known = accountsWithPosts !== null && acctId !== undefined;
                          if (known && !accountsWithPosts.has(acctId)) {
                            return (
                              <span
                                className="text-sm text-muted-foreground"
                                title="This handle has never posted, so its loop has nothing to read yet. That silence is the finding — the loop is ready the moment it posts."
                              >
                                No posts yet
                              </span>
                            );
                          }
                          return (
                            <Link
                              href={`/admission/social/loop?account=${encodeURIComponent(r.username)}`}
                              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                              aria-label={`Open the weekly loop for @${r.username}`}
                            >
                              <Repeat className="h-3.5 w-3.5" aria-hidden="true" />
                              Open loop
                            </Link>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </ContentLayout>
    </PermissionGuard>
  );
}
