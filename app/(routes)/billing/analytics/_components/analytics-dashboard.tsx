'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useBillingOverview,
  useTodayCollections,
} from '@/hooks/billing/use-billing-analytics';
import type { BillingAnalyticsFilters } from '@/types/billing-analytics';
import {
  AnalyticsFilters,
  type AnalyticsFilterChange,
} from './analytics-filters';
import { KpiCards } from './kpi-cards';
import { TodayCollectionsPanel } from './today-collections-panel';
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

  const overview = useBillingOverview(filters);
  const today = useTodayCollections({
    institution_ids: filters.institution_ids,
  });

  const refetchAll = useCallback(() => {
    overview.refetch();
    today.refetch();
  }, [overview, today]);

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
      />

      <KpiCards data={overview.data} loading={overview.isLoading} />

      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        <div className='lg:col-span-2'>
          {/* Phase 4: collection trend chart */}
        </div>
        <div>
          <TodayCollectionsPanel
            data={today.data}
            loading={today.isLoading}
          />
        </div>
      </div>

      {/* Phase 4-6: aging · category · institution comparison · user leaderboard */}
    </div>
  );
}
