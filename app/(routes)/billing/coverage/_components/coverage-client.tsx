'use client';

import { useState } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useBillCoverageSummary } from '@/hooks/billing/use-bill-coverage';
import type { BillCoverageFilters } from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';
import { CoverageSummaryCards } from './coverage-summary-cards';
import { CoverageFilterBar } from './coverage-filter-bar';
import { CoverageTable } from './coverage-table';

export function CoverageClient() {
  const { canAccess, isSuperAdmin } = usePermissions();
  // The export key is granted separately from view — a role may read the
  // coverage list without being allowed to take learner data off-platform.
  const canExport = isSuperAdmin || canAccess('billing.coverage', 'export');

  // Dimension filters only. Search, sorting, paging and export live inside the
  // shared DataTable, which owns its own URL state.
  const [filters, setFilters] = useState<BillCoverageFilters>({
    academic_year_id: null,
    admission_year: null,
    institution_ids: null,
    lifecycle_statuses: [...LEARNER_SCOPE_DEFAULT],
    billing_category_id: null,
    degree_id: null,
    department_id: null,
    program_id: null,
    semester_id: null,
    section_id: null,
    accommodation_type_ids: null,
    transport: 'any',
    gender: null,
    coverage_state: 'not_generated',
    include_non_billing_institutions: false
  });

  const summaryQuery = useBillCoverageSummary(filters);

  const handleChange = (next: Partial<BillCoverageFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  return (
    <div className='space-y-6'>
      <CoverageSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
      />
      <CoverageFilterBar
        filters={filters}
        onChange={handleChange}
        canExport={canExport}
      />
      <CoverageTable filters={filters} canExport={canExport} />
    </div>
  );
}
