'use client';

/**
 * SubscribedAssetsPanel
 *
 * Renders the live Meta-side webhook subscription state for either
 * Facebook Pages (filter="page") or Instagram accounts (filter="ig").
 *
 * Backed by GET /api/admin/social/subscribed-apps, which calls Meta's
 * Graph API at request time. The panel surfaces DRIFT — e.g. a Page
 * subscribed to MyJKKN (1380007247501251) instead of JKKN Institutions
 * (437028995095541), which silently breaks webhook delivery. See
 * feedback_meta_system_user_app_must_match_webhook_app.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Alert, AlertDescription } from '@/components/ui/alert';

export const SUBSCRIBED_APPS_QUERY_KEY = ['admin', 'social', 'subscribed-apps'];

interface SubscribedApp {
  id: string;
  name: string;
}

interface IgChild {
  id: string;
  username: string;
  subscribed_apps: SubscribedApp[];
}

interface PageRow {
  id: string;
  name: string;
  subscribed_apps: SubscribedApp[];
  ig: IgChild | null;
}

interface AuditSummary {
  last_check_at: string | null;
  latest_run_id: string | null;
  drifts_in_last_7d: number;
  latest_run_verdict_counts: {
    healthy: number;
    drift: number;
    empty: number;
  } | null;
}

interface SubscribedAppsResponse {
  pages: PageRow[];
  fetched_at: string;
  known_app_ids: {
    jkkn_institutions: string;
    myjkkn: string;
  };
  audit_summary?: AuditSummary | null;
  error?: string;
}

interface SubscribedAssetsPanelProps {
  filter: 'page' | 'ig';
}

async function fetchSubscribedApps(): Promise<SubscribedAppsResponse> {
  const res = await fetch('/api/admin/social/subscribed-apps', {
    cache: 'no-store',
  });
  const json = (await res.json()) as SubscribedAppsResponse;
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}

type Verdict = 'healthy' | 'drift' | 'empty';

function classify(
  apps: SubscribedApp[],
  knownIds: { jkkn_institutions: string; myjkkn: string }
): Verdict {
  if (apps.length === 0) return 'empty';
  const hasMyJkkn = apps.some((a) => a.id === knownIds.myjkkn);
  const hasJkknOnly =
    apps.length === 1 && apps[0].id === knownIds.jkkn_institutions;
  if (hasJkknOnly) return 'healthy';
  if (hasMyJkkn) return 'drift';
  return 'drift';
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === 'healthy') {
    return (
      <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
        Healthy
      </Badge>
    );
  }
  if (verdict === 'drift') {
    return <Badge variant="destructive">Drift</Badge>;
  }
  return <Badge variant="outline">Not subscribed</Badge>;
}

function AppBadges({
  apps,
  knownIds,
}: {
  apps: SubscribedApp[];
  knownIds: { jkkn_institutions: string; myjkkn: string };
}) {
  if (apps.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {apps.map((app) => {
        let cls = 'bg-muted text-foreground';
        if (app.id === knownIds.jkkn_institutions) {
          cls = 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
        } else if (app.id === knownIds.myjkkn) {
          cls = 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200';
        }
        return (
          <span
            key={app.id}
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
            title={`App ID: ${app.id}`}
          >
            {app.name}
          </span>
        );
      })}
    </div>
  );
}

export function SubscribedAssetsPanel({ filter }: SubscribedAssetsPanelProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<SubscribedAppsResponse, Error>({
    queryKey: SUBSCRIBED_APPS_QUERY_KEY,
    queryFn: fetchSubscribedApps,
    staleTime: 60_000,
    retry: 1,
  });

  const isPage = filter === 'page';
  const titleNoun = isPage ? 'Pages' : 'Instagram accounts';

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: SUBSCRIBED_APPS_QUERY_KEY });
  };

  // Flatten according to filter
  const rows = (data?.pages ?? [])
    .map((p) => {
      if (isPage) {
        return {
          assetId: p.id,
          label: p.name,
          apps: p.subscribed_apps,
        };
      }
      if (!p.ig) return null;
      return {
        assetId: p.ig.id,
        label: p.ig.username ? `@${p.ig.username}` : p.ig.id,
        apps: p.ig.subscribed_apps,
      };
    })
    .filter((r): r is { assetId: string; label: string; apps: SubscribedApp[] } => r !== null);

  const knownIds = data?.known_app_ids ?? {
    jkkn_institutions: '437028995095541',
    myjkkn: '1380007247501251',
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Subscribed Assets</CardTitle>
          <CardDescription>
            Live Meta-side webhook subscription state for{' '}
            {titleNoun.toLowerCase()}. Healthy = JKKN Institutions only.
            Drift = MyJKKN trap-app or other apps present.
            {data?.fetched_at && (
              <span className="block text-[10px] mt-1 text-muted-foreground/80">
                Fetched {new Date(data.fetched_at).toLocaleString()}
              </span>
            )}
            {data?.audit_summary?.last_check_at && (
              <span className="block text-[10px] mt-1 text-muted-foreground/80">
                Last drift check:{' '}
                {new Date(data.audit_summary.last_check_at).toLocaleString()}
                {data.audit_summary.latest_run_verdict_counts && (
                  <>
                    {' '}
                    —{' '}
                    {data.audit_summary.latest_run_verdict_counts.healthy}{' '}
                    healthy,{' '}
                    <span
                      className={
                        data.audit_summary.latest_run_verdict_counts.drift > 0
                          ? 'text-red-600 font-semibold'
                          : ''
                      }
                    >
                      {data.audit_summary.latest_run_verdict_counts.drift}{' '}
                      drift
                    </span>
                  </>
                )}
                {data.audit_summary.drifts_in_last_7d > 0 && (
                  <> · {data.audit_summary.drifts_in_last_7d} drift events in 7d</>
                )}
              </span>
            )}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="gap-2"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data?.error || error) && (
          <Alert variant="destructive">
            <AlertDescription>
              {error ? error.message : data?.error}
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>{isPage ? 'Page' : 'IG account'}</TableHead>
                <TableHead className="w-[180px]">Asset ID</TableHead>
                <TableHead>Subscribed apps</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10">
                    <p className="text-sm text-muted-foreground">
                      No subscriptions yet — {titleNoun.toLowerCase()} must call
                      <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
                        subscribed_apps
                      </code>
                      POST. See ops runbook.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const verdict = classify(r.apps, knownIds);
                  return (
                    <TableRow key={r.assetId}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {r.assetId}
                      </TableCell>
                      <TableCell>
                        <AppBadges apps={r.apps} knownIds={knownIds} />
                      </TableCell>
                      <TableCell>
                        <VerdictBadge verdict={verdict} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
