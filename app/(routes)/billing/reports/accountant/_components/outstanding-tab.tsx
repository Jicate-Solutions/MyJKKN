// app/(routes)/billing/reports/accountant/_components/outstanding-tab.tsx
'use client';

import { useMemo } from 'react';
import { useReportOutstanding } from '@/hooks/billing/use-accountant-reports';
import type {
  AccountantReportFilters, OutstandingByYearRow,
} from '@/types/billing-accountant-reports';
import { formatCurrency, num } from './_utils';
import { ReportSection, ReportBarChart, ReportTable, type Column } from './report-primitives';

export function OutstandingTab({ filters }: { filters: AccountantReportFilters }) {
  const q = useReportOutstanding(filters);
  const rows = q.data ?? [];

  // Roll rows (year × college) up to year totals for the chart.
  const byYear = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      m.set(r.academic_year_name, (m.get(r.academic_year_name) ?? 0) + num(r.outstanding));
    }
    return Array.from(m, ([group_label, outstanding]) => ({ group_label, outstanding }));
  }, [rows]);

  const columns: Column<OutstandingByYearRow>[] = [
    { header: 'Academic Year', cell: (r) => r.academic_year_name },
    { header: 'College', cell: (r) => r.institution_name },
    { header: 'Students w/ Dues', align: 'right', cell: (r) => num(r.students_with_dues).toLocaleString('en-IN') },
    { header: 'Bills', align: 'right', cell: (r) => num(r.bill_count).toLocaleString('en-IN') },
    { header: 'Outstanding', align: 'right', cell: (r) => formatCurrency(num(r.outstanding)) },
  ];

  return (
    <div className='space-y-6'>
      <ReportSection title='Pending Payments by Academic Year'>
        <ReportBarChart data={byYear} categoryKey='group_label' valueKey='outstanding' loading={q.isLoading} />
      </ReportSection>
      <ReportSection title='Detail (Year × College)'>
        <ReportTable columns={columns} rows={rows} loading={q.isLoading} empty='No pending dues for these filters.' />
      </ReportSection>
    </div>
  );
}
