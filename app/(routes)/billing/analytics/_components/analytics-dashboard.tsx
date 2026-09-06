'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBillingOverview,
  useTodayCollections,
  useCollectionTrend,
  useInstitutionAnalytics,
  useAgingBuckets,
  useCategoryBreakdown,
  useCollectionSplit,
  useUserActivity,
  useDailyActivity,
} from '@/hooks/billing/use-billing-analytics';
import type {
  BillingAnalyticsFilters,
  TrendGranularity,
} from '@/types/billing-analytics';
import {
  AnalyticsFilters,
  type AnalyticsFilterChange,
} from './analytics-filters';
import { KpiCards } from './kpi-cards';
import { TodayCollectionsPanel } from './today-collections-panel';
import { CollectionTrendChart } from './collection-trend-chart';
import { AgingChart } from './aging-chart';
import { CategoryBreakdownChart } from './category-breakdown-chart';
import { CollectionSplitPanel } from './collection-split-panel';
import { InstitutionComparison } from './institution-comparison';
import { AccountsTeamActivity } from './accounts-team-activity';
import { exportAnalyticsWorkbook } from './export-analytics';
import { presetRange, type DatePreset } from './_utils';

const VALID_PRESETS: DatePreset[] = ['today', 'month', 'year', 'all', 'custom'];

export function AnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter state lives in the URL so it survives refresh / sharing.
  const institutionId = searchParams.get('inst') || undefined;
  const presetParam = searchParams.get('preset') as DatePreset | null;
  const preset: DatePreset =
    presetParam && VALID_PRESETS.includes(presetParam) ? presetParam : 'month';
  const from = searchParams.get('from') || undefined;
  const to = searchParams.get('to') || undefined;

  const { institutions, loading: loadingInstitutions } =
    useInstitutionsWithAccess({ isActive: true });
  const multiInstitution = institutions.length > 1;

  const { isSuperAdmin, canAccess } = usePermissions();
  const canExport = isSuperAdmin || canAccess('billing.analytics', 'export');
  const [exporting, setExporting] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(`/billing/analytics${qs ? `?${qs}` : ''}`, {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  // One batched write per gesture — never N sequential router.replace() calls
  // (those would each read the same stale searchParams snapshot and clobber).
  const handleChange = useCallback(
    (c: AnalyticsFilterChange) => {
      const updates: Record<string, string | null | undefined> = {};
      if ('institution' in c) updates.inst = c.institution ?? null;
      if ('preset' in c) updates.preset = c.preset ?? null;
      if ('from' in c) updates.from = c.from ?? null;
      if ('to' in c) updates.to = c.to ?? null;
      updateParams(updates);
    },
    [updateParams]
  );

  const filters: BillingAnalyticsFilters = useMemo(
    () => ({
      institution_ids: institutionId ? [institutionId] : undefined,
      ...presetRange(preset, from, to),
    }),
    [institutionId, preset, from, to]
  );

  // Daily buckets for short ranges; monthly for year/all-time so the axis stays legible.
  const granularity: TrendGranularity =
    preset === 'year' || preset === 'all' ? 'month' : 'day';

  const overview = useBillingOverview(filters);
  const today = useTodayCollections({
    institution_ids: filters.institution_ids,
  });
  const trend = useCollectionTrend({ ...filters, granularity });
  const byInstitution = useInstitutionAnalytics(filters);
  const aging = useAgingBuckets(filters);
  const byCategory = useCategoryBreakdown(filters);
  const collectionSplit = useCollectionSplit(filters);
  const userActivity = useUserActivity(filters);
  const dailyActivity = useDailyActivity(filters);

  const refetchAll = useCallback(() => {
    overview.refetch();
    today.refetch();
    trend.refetch();
    byInstitution.refetch();
    aging.refetch();
    byCategory.refetch();
    collectionSplit.refetch();
    userActivity.refetch();
    dailyActivity.refetch();
  }, [
    overview,
    today,
    trend,
    byInstitution,
    aging,
    byCategory,
    collectionSplit,
    userActivity,
    dailyActivity,
  ]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportAnalyticsWorkbook({
        overview: overview.data,
        collectionSplit: collectionSplit.data,
        byInstitution: byInstitution.data,
        byCategory: byCategory.data,
        aging: aging.data,
        userActivity: userActivity.data,
        dailyActivity: dailyActivity.data,
        range: { from: filters.date_from, to: filters.date_to },
      });
    } catch {
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [
    overview.data,
    collectionSplit.data,
    byInstitution.data,
    byCategory.data,
    aging.data,
    userActivity.data,
    dailyActivity.data,
    filters.date_from,
    filters.date_to,
  ]);

  return (
    <div className='space-y-6'>
      <AnalyticsFilters
        institutionId={institutionId}
        preset={preset}
        from={from}
        to={to}
        institutions={institutions}
        loadingInstitutions={loadingInstitutions}
        multiInstitution={multiInstitution}
        onChange={handleChange}
        onRefresh={refetchAll}
        isFetching={overview.isFetching || today.isFetching}
        canExport={canExport}
        onExport={handleExport}
        exporting={exporting}
      />

      <KpiCards
        data={overview.data}
        loading={overview.isLoading}
        split={collectionSplit.data}
      />

      <CollectionSplitPanel
        data={collectionSplit.data}
        loading={collectionSplit.isLoading}
      />

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          <CollectionTrendChart data={trend.data} loading={trend.isLoading} />
        </div>
        <div>
          <TodayCollectionsPanel data={today.data} loading={today.isLoading} />
        </div>
      </div>

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <AgingChart data={aging.data} loading={aging.isLoading} />
        <CategoryBreakdownChart
          data={byCategory.data}
          loading={byCategory.isLoading}
        />
      </div>

      <InstitutionComparison
        data={byInstitution.data}
        loading={byInstitution.isLoading}
        selectedInstitution={institutionId}
        onSelect={(id) => handleChange({ institution: id })}
      />

      <AccountsTeamActivity
        userActivity={userActivity.data}
        userLoading={userActivity.isLoading}
        dailyActivity={dailyActivity.data}
        dailyLoading={dailyActivity.isLoading}
      />
    </div>
  );
}
