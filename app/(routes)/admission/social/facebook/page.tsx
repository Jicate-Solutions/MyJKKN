'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Facebook, RefreshCw } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { SubscribedAssetsPanel } from '@/components/admin/social/subscribed-assets-panel';

interface PageHealthRow {
  fb_page_id: string;
  name: string;
  status: string;
  last_polled_at: string | null;
  last_post_at: string | null;
  poll_age_hours: number | null;
  health_status: 'healthy' | 'dormant' | 'disconnected' | 'never_synced';
  fan_count: number | null;
  followers_count: number | null;
  institution_id: string;
}

interface HealthSummary {
  total: number;
  healthy: number;
  dormant: number;
  disconnected: number;
  never_synced: number;
  avg_poll_age_hours: number | null;
  oldest_poll_age_hours: number | null;
  pages: PageHealthRow[];
}

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Facebook' },
];

function statusBadge(status: PageHealthRow['health_status']) {
  const map: Record<PageHealthRow['health_status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    healthy: { label: 'Healthy', variant: 'default' },
    dormant: { label: 'Dormant', variant: 'secondary' },
    disconnected: { label: 'Disconnected', variant: 'destructive' },
    never_synced: { label: 'Never synced', variant: 'outline' },
  };
  const cfg = map[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function FacebookAdminPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  // fb_page_id (Meta id) → fb_pages.id (internal UUID) for drilldown links.
  // page-health rows carry only the Meta id; the drilldown route + insights
  // contracts (F1–F3) are keyed by the internal UUID.
  const [idMap, setIdMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadIdMap = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data } = await supabase.from('fb_pages').select('id, fb_page_id');
        if (!data) return;
        const map: Record<string, string> = {};
        for (const row of data as { id: string; fb_page_id: string }[]) {
          map[row.fb_page_id] = row.id;
        }
        setIdMap(map);
      } catch {
        // Non-fatal: rows render without drilldown links.
      }
    };
    void loadIdMap();
  }, []);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/social/facebook/page-health', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setSummary(json.data as HealthSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Facebook pages');
    } finally {
      setIsLoading(false);
    }
  };

  const discover = async () => {
    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch('/api/social/facebook/accounts/discover');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed');
    } finally {
      setDiscovering(false);
      void load();
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const tiles = summary
    ? [
        { label: 'Total', value: summary.total },
        { label: 'Healthy', value: summary.healthy },
        { label: 'Dormant', value: summary.dormant },
        { label: 'Disconnected', value: summary.disconnected },
      ]
    : [];

  return (
    <PermissionGuard
      module="social.facebook"
      action="view"
      fallback={
        <ContentLayout title="Facebook Monitoring">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Facebook Monitoring">
      <PageBreadcrumb items={breadcrumbItems} />

      <div className="mt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-600 p-2 mt-1">
              <Facebook className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Facebook Pages</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Monitor institutional Facebook Pages connected under the JKKN
                Business Manager. Substrate only — enable the
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">fb.pages.is_enabled</code>
                policy to start polling.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className="gap-2"
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => void discover()} disabled={discovering}>
              {discovering ? 'Discovering…' : 'Discover Pages'}
            </Button>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <Skeleton className="h-4 w-16" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-7 w-12" />
                  </CardContent>
                </Card>
              ))
            : tiles.map((t) => (
                <Card key={t.label}>
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs uppercase tracking-wide">
                      {t.label}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-semibold">{t.value}</div>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connected Pages</CardTitle>
            <CardDescription>
              {summary
                ? `${summary.total} page${summary.total === 1 ? '' : 's'} across institutions`
                : 'Loading…'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>Page</TableHead>
                    <TableHead className="text-right w-[110px]">Fans</TableHead>
                    <TableHead className="text-right w-[110px]">Followers</TableHead>
                    <TableHead className="w-[170px]">Last Post</TableHead>
                    <TableHead className="w-[170px]">Last Polled</TableHead>
                    <TableHead className="w-[140px]">Health</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : !summary || summary.pages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12">
                        <p className="text-muted-foreground text-sm">
                          No Facebook Pages connected yet. Click
                          <span className="font-medium"> Discover Pages </span>
                          above to scan the JKKN Business Manager.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.pages.map((pg) => (
                      <TableRow key={pg.fb_page_id}>
                        <TableCell className="font-medium">
                          {idMap[pg.fb_page_id] ? (
                            <Link
                              href={`/admission/social/facebook/${idMap[pg.fb_page_id]}`}
                              className="hover:underline text-primary"
                            >
                              {pg.name}
                            </Link>
                          ) : (
                            pg.name
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pg.fan_count?.toLocaleString() ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {pg.followers_count?.toLocaleString() ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(pg.last_post_at)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(pg.last_polled_at)}
                        </TableCell>
                        <TableCell>{statusBadge(pg.health_status)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Webhook subscription drift panel */}
        <SubscribedAssetsPanel filter="page" />
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
