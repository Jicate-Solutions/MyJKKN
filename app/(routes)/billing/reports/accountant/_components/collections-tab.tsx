// app/(routes)/billing/reports/accountant/_components/collections-tab.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useReportCollections } from '@/hooks/billing/use-accountant-reports';
import type {
  AccountantReportFilters, CollectionsGroupBy, CollectionsRow,
} from '@/types/billing-accountant-reports';
import { formatCurrency, num } from './_utils';
import { ReportSection, ReportBarChart, ReportLineChart, ReportTable, type Column } from './report-primitives';

const GROUPS: { value: CollectionsGroupBy; label: string }[] = [
  { value: 'college', label: 'By College' },
  { value: 'course', label: 'By Course' },
  { value: 'date', label: 'By Date' },
];

export function CollectionsTab({ filters }: { filters: AccountantReportFilters }) {
  const [groupBy, setGroupBy] = useState<CollectionsGroupBy>('college');
  const q = useReportCollections(filters, groupBy);
  const rows = q.data ?? [];

  const toggle = (
    <div className='flex gap-1'>
      {GROUPS.map((g) => (
        <Button key={g.value} size='sm' variant={groupBy === g.value ? 'default' : 'outline'}
          onClick={() => setGroupBy(g.value)}>{g.label}</Button>
      ))}
    </div>
  );

  // The 'date' branch of the RPC only populates collected + cleared_* (student
  // count, outstanding and rate are per-group concepts that don't apply to a
  // single day), so show a date-specific column set instead of rendering the
  // hardcoded-zero columns the college/course views use.
  const columns: Column<CollectionsRow>[] =
    groupBy === 'date'
      ? [
          { header: 'Date', cell: (r) => r.group_label },
          { header: 'Collected', align: 'right', cell: (r) => formatCurrency(num(r.collected)) },
          { header: 'Bills Cleared', align: 'right', cell: (r) => num(r.cleared_bill_count).toLocaleString('en-IN') },
          { header: 'Cleared Amount', align: 'right', cell: (r) => formatCurrency(num(r.cleared_amount)) },
        ]
      : [
          { header: groupBy === 'course' ? 'Course' : 'College', cell: (r) => r.group_label },
          { header: 'Students', align: 'right', cell: (r) => num(r.student_count).toLocaleString('en-IN') },
          { header: 'Collected', align: 'right', cell: (r) => formatCurrency(num(r.collected)) },
          { header: 'Outstanding', align: 'right', cell: (r) => formatCurrency(num(r.outstanding)) },
          {
            header: 'Rate %', align: 'right',
            headerTitle:
              'Collected in the selected date range ÷ (collected in range + current outstanding). Outstanding is a live snapshot, so for a bounded date range this is not an all-time collection rate.',
            cell: (r) => `${num(r.collection_rate).toFixed(1)}%`,
          },
        ];

  return (
    <div className='space-y-6'>
      <ReportSection title='Collections' action={toggle}>
        {groupBy === 'date'
          ? <ReportLineChart data={rows.map((r) => ({ ...r }))} categoryKey='group_label' valueKey='collected' loading={q.isLoading} />
          : <ReportBarChart data={rows.map((r) => ({ ...r }))} categoryKey='group_label' valueKey='collected' loading={q.isLoading} horizontal />}
      </ReportSection>
      <ReportSection title='Detail'>
        <ReportTable columns={columns} rows={rows} loading={q.isLoading} empty='No collections for these filters.' />
      </ReportSection>
    </div>
  );
}
