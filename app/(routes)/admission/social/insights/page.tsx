'use client';

import { useCallback, useEffect, useState } from 'react';
import { Facebook, Instagram, RefreshCw } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TotalsTiles, type InsightsTotals } from './_components/totals-tiles';
import { SummaryTable, type InsightsAccountRow } from './_components/summary-table';
import { FbTotalsTiles, type FbInsightsTotals } from './_components/fb-totals-tiles';
import { FbSummaryTable, type FbInsightsPageRow } from './_components/fb-summary-table';

/**
 * Cross-account social insights dashboard (/admission/social/insights).
 *
 * Instagram tab consumes contract C7: GET /api/social/instagram/insights/summary?days=N
 *   data: { accounts: InsightsAccountRow[], totals: InsightsTotals }
 * Facebook tab consumes contract F4: GET /api/social/facebook/insights/summary?days=N
 *   data: { pages: FbInsightsPageRow[], totals: FbInsightsTotals }
 *
 * Super-admin only — mirrors /admission/social/facebook's guard + layout
 * pattern. Metrics accumulate from the pollers' first runs, so an all-zero
 * table over the connected accounts/pages is the expected early state.
 *
 * The network switch is a plain segmented button-group (same idiom as the
 * days selector), deliberately NOT Radix Tabs — synthetic CDP clicks flake
 * on Radix Tabs (known harness limitation, production memory).
 */

interface IgSummaryData {
  accounts: InsightsAccountRow[];
  totals: InsightsTotals;
}

interface FbSummaryData {
  pages: FbInsightsPageRow[];
  totals: FbInsightsTotals;
}

type Network = 'instagram' | 'facebook';

const DAYS_OPTIONS = [7, 30, 90] as const;

const NETWORK_OPTIONS: Array<{
  key: Network;
  label: string;
  icon: typeof Instagram;
}> = [
  { key: 'instagram', label: 'Instagram', icon: Instagram },
  { key: 'facebook', label: 'Facebook', icon: Facebook },
];

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Admission', href: '/admission' },
  { label: 'Social Media', href: '/admission/social' },
  { label: 'Insights' },
];

export default function SocialInsightsPage() {
  const [network, setNetwork] = useState<Network>('instagram');
  const [days, setDays] = useState<number>(30);
  const [igData, setIgData] = useState<IgSummaryData | null>(null);
  const [fbData, setFbData] = useState<FbSummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (net: Network, windowDays: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint =
        net === 'facebook'
          ? `/api/social/facebook/insights/summary?days=${windowDays}`
          : `/api/social/instagram/insights/summary?days=${windowDays}`;
      const res = await fetch(endpoint, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      if (net === 'facebook') {
        setFbData(json.data as FbSummaryData);
      } else {
        setIgData(json.data as IgSummaryData);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to load ${net === 'facebook' ? 'Facebook' : 'Instagram'} insights`
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(network, days);
  }, [network, days, load]);

  const title = network === 'facebook' ? 'Facebook Insights' : 'Instagram Insights';

  return (
    <PermissionGuard
      module="social.insights"
      action="view"
      fallback={
        <ContentLayout title="Social Insights">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            You do not have permission to view this page. Ask an administrator
            to grant the Social Media permissions to your role.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title={title}>
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-6 space-y-6">
          {/* Network switch (segmented button-group, not Radix Tabs) */}
          <div className="inline-flex rounded-md border" role="group" aria-label="Network">
            {NETWORK_OPTIONS.map((opt) => (
              <Button
                key={opt.key}
                type="button"
                variant={network === opt.key ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none first:rounded-l-md last:rounded-r-md gap-2"
                onClick={() => setNetwork(opt.key)}
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {network === 'facebook' ? (
                <div className="rounded-lg bg-blue-600 p-2 mt-1">
                  <Facebook className="h-5 w-5 text-white" />
                </div>
              ) : (
                <div className="rounded-lg bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600 p-2 mt-1">
                  <Instagram className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {network === 'facebook'
                    ? 'Cross-page growth and engagement across all institutional Facebook Pages. Click a row to open the page detail.'
                    : 'Cross-account growth and engagement across all institutional Instagram accounts. Click a row to open the account detail.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="inline-flex rounded-md border" role="group" aria-label="Window in days">
                {DAYS_OPTIONS.map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant={days === opt ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none first:rounded-l-md last:rounded-r-md"
                    onClick={() => setDays(opt)}
                  >
                    {opt}d
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load(network, days)}
                className="gap-2"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Group-wide totals */}
          {network === 'facebook' ? (
            <FbTotalsTiles totals={fbData?.totals ?? null} isLoading={isLoading} />
          ) : (
            <TotalsTiles totals={igData?.totals ?? null} isLoading={isLoading} />
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Per-account / per-page table */}
          {network === 'facebook' ? (
            <FbSummaryTable pages={fbData?.pages ?? []} isLoading={isLoading} />
          ) : (
            <SummaryTable accounts={igData?.accounts ?? []} isLoading={isLoading} />
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
