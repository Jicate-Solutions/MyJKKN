'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/hooks/use-permissions';
import { useBillCoverageSummary } from '@/hooks/billing/use-bill-coverage';
import type { BillCoverageFilters } from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';
import { CoverageSummaryCards } from './coverage-summary-cards';
import { CoverageFilterBar } from './coverage-filter-bar';
import { CoverageTable } from './coverage-table';
import { AuditClient } from './audit-client';

type PageTab = 'coverage' | 'audit';

export function CoverageClient() {
  const { canAccess, isSuperAdmin } = usePermissions();
  // The export key is granted separately from view — a role may read the
  // coverage list without being allowed to take learner data off-platform.
  const canExport = isSuperAdmin || canAccess('billing.coverage', 'export');

  const [tab, setTab] = useState<PageTab>('coverage');

  // ONE filter object for both tabs, so switching keeps the institution, cohort
  // and programme you already picked. A few fields only apply to one tab
  // (academic_year_id / billing_category_id / coverage_state to Coverage;
  // earliest_academic_year / audit_state to Audit) — the filter bar swaps those
  // controls by variant and each tab's service reads only what it understands.
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
    include_non_billing_institutions: false,
    earliest_academic_year: null,
    audit_state: 'gap',
    include_non_tuition_institutions: false
  });

  // Hoisted above the Tabs so both tabs share one filter object, so it needs the
  // tab as an explicit gate — the tables below unmount with their tab, but this
  // would otherwise keep sweeping while the Audit tab is open.
  const summaryQuery = useBillCoverageSummary(filters, tab === 'coverage');

  const handleChange = (next: Partial<BillCoverageFilters>) =>
    setFilters((prev) => ({ ...prev, ...next }));

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as PageTab)}
      className='space-y-6'
    >
      <TabsList>
        <TabsTrigger value='coverage'>Coverage</TabsTrigger>
        <TabsTrigger value='audit'>Audit</TabsTrigger>
      </TabsList>

      <TabsContent value='coverage' className='space-y-6'>
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
      </TabsContent>

      <TabsContent value='audit' className='space-y-6'>
        <CoverageFilterBar
          variant='audit'
          filters={filters}
          onChange={handleChange}
          canExport={canExport}
        />
        <AuditClient filters={filters} canExport={canExport} />
      </TabsContent>
    </Tabs>
  );
}
