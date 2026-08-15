'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDuplicateYearAuditSummary,
  useMissingYearAuditSummary
} from '@/hooks/billing/use-bill-coverage-audit';
import {
  DuplicateYearSummaryCards,
  MissingYearSummaryCards
} from './audit-summary-cards';
import { AuditMissingYearsTable } from './audit-missing-years-table';
import { AuditDuplicateYearsTable } from './audit-duplicate-years-table';
import type { BillCoverageFilters } from '@/types/billing-coverage';

type AuditCheck = 'missing' | 'duplicate';

interface AuditClientProps {
  /** The page-level filter bar's state, shared with the Coverage tab. */
  filters: BillCoverageFilters;
  canExport: boolean;
}

/**
 * The two tuition-billing integrity checks.
 *
 * They are separate sub-tabs rather than one table because they are counted in
 * different units: "missing years" is one row per LEARNER (the years they still
 * owe listed in a cell), "duplicate years" is one row per LEARNER AND YEAR (a
 * learner can break the rule in more than one year). Forcing them into one grid
 * would make at least one of them lie about how much work there is.
 */
export function AuditClient({ filters, canExport }: AuditClientProps) {
  const [check, setCheck] = useState<AuditCheck>('missing');

  // Both audits sweep every in-scope learner and every live tuition bill, so
  // only the visible one runs. `enabled` here rather than relying on the tab
  // unmounting: React Query would otherwise fire both on first paint.
  const missingSummary = useMissingYearAuditSummary(
    filters,
    check === 'missing'
  );
  const duplicateSummary = useDuplicateYearAuditSummary(
    filters,
    check === 'duplicate'
  );

  return (
    <Tabs
      value={check}
      onValueChange={(v) => setCheck(v as AuditCheck)}
      className='space-y-4'
    >
      <TabsList>
        <TabsTrigger value='missing'>Missing Year Bills</TabsTrigger>
        <TabsTrigger value='duplicate'>Duplicate Year Bills</TabsTrigger>
      </TabsList>

      <TabsContent value='missing' className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          A learner should hold one tuition bill for every academic year from
          their admission year up to their institution&apos;s current year. These
          learners are missing at least one. A year is only expected where the
          institution actually has that academic year on file.
        </p>
        {/* Named rather than left implicit: for the learners who carry them
            these three ARE the year's tuition, and without saying so the
            Dental and Allied Health rows read as though the check had simply
            missed a bill that plainly exists. */}
        <p className='text-xs text-muted-foreground'>
          Counts as tuition for this check: every Tuition Fee category, plus
          <span className='font-medium'> Government 7-5 quota</span>,
          <span className='font-medium'> CRRI - INTERNSHIP FEE</span> and
          <span className='font-medium'> AHS - INTERNSHIP FEE</span> — years
          covered only by one of those are not reported as missing.
        </p>
        <MissingYearSummaryCards
          summary={missingSummary.data}
          isLoading={missingSummary.isLoading}
        />
        <AuditMissingYearsTable filters={filters} canExport={canExport} />
      </TabsContent>

      <TabsContent value='duplicate' className='space-y-4'>
        <p className='text-sm text-muted-foreground'>
          At most one tuition bill may exist per learner per academic year. Rows
          here carry two or more. The usual cause is a multi-year fee plan
          generated in one run, which stamps every instalment with the academic
          year current at generation time instead of the year it covers.
        </p>
        {/* The asymmetry is deliberate and would otherwise look like a bug:
            duplicates read the widened set, Billed Past Programme End does not.
            Programme duration counts TAUGHT years, so an internship fee falls
            after the course ends by design. */}
        <p className='text-xs text-muted-foreground'>
          Duplicates use the same widened set as the Missing Year check.
          <span className='font-medium'> Billed Past Programme End</span> does
          not — it counts Tuition Fee categories only, because an internship fee
          is charged for the year after the taught course ends and is not an
          anomaly.
        </p>
        <DuplicateYearSummaryCards
          summary={duplicateSummary.data}
          isLoading={duplicateSummary.isLoading}
        />
        <AuditDuplicateYearsTable filters={filters} canExport={canExport} />
      </TabsContent>
    </Tabs>
  );
}
