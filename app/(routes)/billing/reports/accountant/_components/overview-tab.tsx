// app/(routes)/billing/reports/accountant/_components/overview-tab.tsx
'use client';

import { TrendingUp, AlertTriangle, CheckCircle2, BadgePercent } from 'lucide-react';
import { useReportKpis, useReportCollections } from '@/hooks/billing/use-accountant-reports';
import type { AccountantReportFilters } from '@/types/billing-accountant-reports';
import { formatINRCompact, formatCurrency, num } from './_utils';
import { ReportKpiGrid, ReportSection, ReportBarChart, ReportLineChart } from './report-primitives';

export function OverviewTab({ filters }: { filters: AccountantReportFilters }) {
  const kpis = useReportKpis(filters);
  const byCollege = useReportCollections(filters, 'college');
  const byDate = useReportCollections(filters, 'date');
  const k = kpis.data;

  return (
    <div className='space-y-6'>
      <ReportKpiGrid
        loading={kpis.isLoading && !k}
        items={[
          { label: 'Collected', value: formatINRCompact(k?.collected), title: formatCurrency(num(k?.collected)), icon: TrendingUp, tone: 'success' },
          { label: 'Outstanding (now)', value: formatINRCompact(k?.outstanding), title: formatCurrency(num(k?.outstanding)), icon: AlertTriangle, tone: 'danger' },
          { label: 'Bills Cleared', value: num(k?.cleared_bill_count).toLocaleString('en-IN'), sub: formatINRCompact(k?.cleared_amount), icon: CheckCircle2, tone: 'default' },
          { label: 'Concessions', value: formatINRCompact(k?.concession_amount), title: formatCurrency(num(k?.concession_amount)), icon: BadgePercent, tone: 'warning' },
        ]}
      />
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <ReportSection title='Collection Trend'>
          <ReportLineChart data={byDate.data ?? []} categoryKey='group_label' valueKey='collected' loading={byDate.isLoading} />
        </ReportSection>
        <ReportSection title='Collection by College'>
          <ReportBarChart data={byCollege.data ?? []} categoryKey='group_label' valueKey='collected' loading={byCollege.isLoading} horizontal />
        </ReportSection>
      </div>
    </div>
  );
}
