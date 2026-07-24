// app/(routes)/billing/reports/accountant/_components/schemes-tab.tsx
'use client';

import { useReportSchemes } from '@/hooks/billing/use-accountant-reports';
import type { AccountantReportFilters, SchemeRow } from '@/types/billing-accountant-reports';
import { formatCurrency, num } from './_utils';
import { ReportSection, ReportDonutChart, ReportTable, type Column } from './report-primitives';

export function SchemesTab({ filters }: { filters: AccountantReportFilters }) {
  const q = useReportSchemes(filters);
  const rows = q.data ?? [];
  const donut = rows.map((r) => ({ label: r.scheme_label, value: num(r.concession_amount) }));

  const columns: Column<SchemeRow>[] = [
    { header: 'Scheme', cell: (r) => r.scheme_label },
    { header: 'Students', align: 'right', cell: (r) => num(r.student_count).toLocaleString('en-IN') },
    { header: 'Billed', align: 'right', cell: (r) => formatCurrency(num(r.billed)) },
    { header: 'Collected', align: 'right', cell: (r) => formatCurrency(num(r.collected)) },
    { header: 'Outstanding', align: 'right', cell: (r) => formatCurrency(num(r.outstanding)) },
    { header: 'Concession (approved)', align: 'right', cell: (r) => formatCurrency(num(r.concession_amount)) },
  ];

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-2'>
        <ReportSection title='Concession Granted by Scheme'>
          <ReportDonutChart data={donut} loading={q.isLoading} />
        </ReportSection>
        <ReportSection title='Scheme Summary'>
          <ReportTable columns={columns} rows={rows} loading={q.isLoading} empty='No scheme students for these filters.' />
        </ReportSection>
      </div>
    </div>
  );
}
