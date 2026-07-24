// app/(routes)/billing/reports/accountant/_components/accountant-reports-dashboard.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useReportKpis, useReportCollections, useReportOutstanding, useReportSchemes,
  useReportAcademicYears,
} from '@/hooks/billing/use-accountant-reports';
import type { AccountantReportFilters, ReportScheme } from '@/types/billing-accountant-reports';
import { presetRange, type DatePreset } from './_utils';
import { ReportFilterBar, type ReportFilterChange } from './report-filter-bar';
import { exportReport } from './report-export';
import { OverviewTab } from './overview-tab';
import { CollectionsTab } from './collections-tab';
import { OutstandingTab } from './outstanding-tab';
import { ClearedTab } from './cleared-tab';
import { SchemesTab } from './schemes-tab';

const VALID_PRESETS: DatePreset[] = ['today', 'month', 'year', 'all', 'custom'];
const VALID_SCHEMES: ReportScheme[] = ['all', 'first_graduate', 'pmss', 'scholarship_7_5'];
const VALID_TABS = ['overview', 'collections', 'outstanding', 'cleared', 'schemes'];

export function AccountantReportsDashboard() {
  const router = useRouter();
  const sp = useSearchParams();

  const institutionId = sp.get('inst') || undefined;
  const academicYearId = sp.get('year') || undefined;
  const presetParam = sp.get('preset') as DatePreset | null;
  const preset: DatePreset = presetParam && VALID_PRESETS.includes(presetParam) ? presetParam : 'month';
  const from = sp.get('from') || undefined;
  const to = sp.get('to') || undefined;
  const schemeParam = sp.get('scheme') as ReportScheme | null;
  const scheme: ReportScheme = schemeParam && VALID_SCHEMES.includes(schemeParam) ? schemeParam : 'all';
  const tabParam = sp.get('tab');
  const tab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'overview';

  const { institutions, loading: loadingInstitutions } = useInstitutionsWithAccess({ isActive: true });
  const multiInstitution = institutions.length > 1;
  const years = useReportAcademicYears(institutionId);

  const { isSuperAdmin, canAccess } = usePermissions();
  const canExport = isSuperAdmin || canAccess('billing.reports', 'export');
  const [exporting, setExporting] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      router.replace(`/billing/reports/accountant${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [router, sp]
  );

  const handleChange = useCallback(
    (c: ReportFilterChange) => {
      const u: Record<string, string | null | undefined> = {};
      if ('institution' in c) u.inst = c.institution ?? null;
      if ('academicYear' in c) u.year = c.academicYear ?? null;
      if ('preset' in c) u.preset = c.preset ?? null;
      if ('from' in c) u.from = c.from ?? null;
      if ('to' in c) u.to = c.to ?? null;
      if ('scheme' in c) u.scheme = c.scheme ?? null;
      updateParams(u);
    },
    [updateParams]
  );

  const filters: AccountantReportFilters = useMemo(
    () => ({
      institution_ids: institutionId ? [institutionId] : undefined,
      academic_year_id: academicYearId,
      scheme,
      ...presetRange(preset, from, to),
    }),
    [institutionId, academicYearId, scheme, preset, from, to]
  );

  // Prefetch the datasets export needs so the button has data regardless of tab.
  const kpis = useReportKpis(filters);
  const byCollege = useReportCollections(filters, 'college');
  const outstanding = useReportOutstanding(filters);
  const schemes = useReportSchemes(filters);

  const refetchAll = useCallback(() => {
    kpis.refetch(); byCollege.refetch(); outstanding.refetch(); schemes.refetch();
  }, [kpis, byCollege, outstanding, schemes]);

  const doExport = useCallback(
    async (format: 'excel' | 'pdf' | 'csv') => {
      setExporting(true);
      try {
        await exportReport(format, {
          kpis: kpis.data,
          collectionsByCollege: byCollege.data,
          outstanding: outstanding.data,
          schemes: schemes.data,
          range: { from: filters.date_from, to: filters.date_to },
        });
      } catch {
        toast.error('Export failed. Please try again.');
      } finally {
        setExporting(false);
      }
    },
    [kpis.data, byCollege.data, outstanding.data, schemes.data, filters.date_from, filters.date_to]
  );

  return (
    <div className='space-y-6'>
      <ReportFilterBar
        institutionId={institutionId}
        academicYearId={academicYearId}
        preset={preset}
        from={from}
        to={to}
        scheme={scheme}
        institutions={institutions}
        academicYears={years.data ?? []}
        multiInstitution={multiInstitution}
        loading={loadingInstitutions}
        onChange={handleChange}
        onRefresh={refetchAll}
        isFetching={kpis.isFetching}
        canExport={canExport}
        exporting={exporting}
        onExport={() => doExport('excel')}
      />

      {canExport && (
        <div className='flex justify-end'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className='text-muted-foreground hover:text-foreground text-xs underline'>
                Export as…
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              <DropdownMenuItem onClick={() => doExport('excel')}>Excel (.xlsx)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport('pdf')}>PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport('csv')}>CSV</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => updateParams({ tab: v })}>
        <TabsList className='flex-wrap'>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='collections'>Collections</TabsTrigger>
          <TabsTrigger value='outstanding'>Outstanding</TabsTrigger>
          <TabsTrigger value='cleared'>Cleared</TabsTrigger>
          <TabsTrigger value='schemes'>Schemes</TabsTrigger>
        </TabsList>
        <TabsContent value='overview' className='mt-6'><OverviewTab filters={filters} /></TabsContent>
        <TabsContent value='collections' className='mt-6'><CollectionsTab filters={filters} /></TabsContent>
        <TabsContent value='outstanding' className='mt-6'><OutstandingTab filters={filters} /></TabsContent>
        <TabsContent value='cleared' className='mt-6'><ClearedTab filters={filters} /></TabsContent>
        <TabsContent value='schemes' className='mt-6'><SchemesTab filters={filters} /></TabsContent>
      </Tabs>
    </div>
  );
}
