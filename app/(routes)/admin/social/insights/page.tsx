'use client';

import { useCallback, useEffect, useState } from 'react';
import { Instagram, RefreshCw } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TotalsTiles, type InsightsTotals } from './_components/totals-tiles';
import { SummaryTable, type InsightsAccountRow } from './_components/summary-table';

/**
 * Cross-account Instagram insights dashboard (/admin/social/insights).
 *
 * Consumes contract C7: GET /api/social/instagram/insights/summary?days=N
 *   data: { accounts: InsightsAccountRow[], totals: InsightsTotals }
 *
 * Super-admin only — mirrors /admin/social/facebook's guard + layout
 * pattern. Metrics accumulate from the enriched poller's first run, so an
 * all-zero table over the connected accounts is the expected early state.
 */

interface SummaryData {
  accounts: InsightsAccountRow[];
  totals: InsightsTotals;
}

const DAYS_OPTIONS = [7, 30, 90] as const;

const breadcrumbItems = [
  { label: 'Home', href: '/' },
  { label: 'Administration' },
  { label: 'Social Media', href: '/admin/social' },
  { label: 'Insights' },
];

export default function SocialInsightsPage() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (windowDays: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/social/instagram/insights/summary?days=${windowDays}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json.data as SummaryData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Instagram insights');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Instagram Insights">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title="Instagram Insights">
        <PageBreadcrumb items={breadcrumbItems} />

        <div className="mt-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600 p-2 mt-1">
                <Instagram className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Instagram Insights
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Cross-account growth and engagement across all institutional
                  Instagram accounts. Click a row to open the account detail.
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
                onClick={() => void load(days)}
                className="gap-2"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Group-wide totals */}
          <TotalsTiles totals={data?.totals ?? null} isLoading={isLoading} />

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Per-account table */}
          <SummaryTable accounts={data?.accounts ?? []} isLoading={isLoading} />
        </div>
      </ContentLayout>
    </SuperAdminOnly>
  );
}
