// app/(routes)/billing/reports/accountant/_components/cleared-tab.tsx
'use client';

import { CheckCircle2, IndianRupee } from 'lucide-react';
import { useReportKpis, useReportCollections } from '@/hooks/billing/use-accountant-reports';
import type {
  AccountantReportFilters, CollectionsRow,
} from '@/types/billing-accountant-reports';
import { formatINRCompact, formatCurrency, num } from './_utils';
import { ReportKpiGrid, ReportSection, ReportBarChart, ReportTable, type Column } from './report-primitives';

export function ClearedTab({ filters }: { filters: AccountantReportFilters }) {
  const kpis = useReportKpis(filters);
  const byCollege = useReportCollections(filters, 'college');
  const rows = byCollege.data ?? [];
  const k = kpis.data;

  const columns: Column<CollectionsRow>[] = [
    { header: 'College', cell: (r) => r.group_label },
    { header: 'Bills Cleared', align: 'right', cell: (r) => num(r.cleared_bill_count).toLocaleString('en-IN') },
    { header: 'Cleared Amount', align: 'right', cell: (r) => formatCurrency(num(r.cleared_amount)) },
  ];

  return (
    <div className='space-y-6'>
      <ReportKpiGrid
        loading={kpis.isLoading && !k}
        items={[
          { label: 'Bills Cleared', value: num(k?.cleared_bill_count).toLocaleString('en-IN'), icon: CheckCircle2, tone: 'success' },
          { label: 'Cleared Amount', value: formatINRCompact(k?.cleared_amount), title: formatCurrency(num(k?.cleared_amount)), icon: IndianRupee, tone: 'default' },
        ]}
      />
      <ReportSection title='Cleared Bills by College'>
        <ReportBarChart data={rows} categoryKey='group_label' valueKey='cleared_amount' loading={byCollege.isLoading} horizontal />
      </ReportSection>
      <ReportSection title='Detail'>
        <ReportTable columns={columns} rows={rows} loading={byCollege.isLoading} empty='No cleared bills for these filters.' />
      </ReportSection>
    </div>
  );
}
