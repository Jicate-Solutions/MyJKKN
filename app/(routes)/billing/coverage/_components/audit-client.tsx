'use client';

import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  useDuplicateYearAuditSummary,
  useFeeStructureAuditSummary,
  useMissingYearAuditSummary
} from '@/hooks/billing/use-bill-coverage-audit';
import {
  DuplicateYearSummaryCards,
  FeeStructureSummaryCards,
  MissingYearSummaryCards
} from './audit-summary-cards';
import {
  AuditFeeStructureTable,
  type FeeStructureAdvancedFilters
} from './audit-fee-structure-table';
import { AuditMissingYearsTable } from './audit-missing-years-table';
import { AuditDuplicateYearsTable } from './audit-duplicate-years-table';
import type { BillCoverageFilters } from '@/types/billing-coverage';

type AuditCheck = 'missing' | 'duplicate' | 'fee_structure';

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

  // Fee Structure Match audits ONE admission cohort at a time, defaulting to
  // the current year — fee structures are defined per admission year. The page
  // filter wins when it already names a cohort.
  const [fsYear, setFsYear] = useState<number | 'all'>(
    filters.admission_year ?? new Date().getFullYear()
  );
  const fsFilters = useMemo<BillCoverageFilters>(
    () => ({
      ...filters,
      admission_year: filters.admission_year ?? (fsYear === 'all' ? null : fsYear)
    }),
    [filters, fsYear]
  );
  // Advanced filters (fee item / schedule / structure name) drive BOTH the
  // table and the cards, so the counts always describe the rows shown.
  const [fsAdvanced, setFsAdvanced] = useState<FeeStructureAdvancedFilters>({});
  const fsSummaryFilters = useMemo(() => ({ ...fsFilters, ...fsAdvanced }), [fsFilters, fsAdvanced]);
  const feeStructureSummary = useFeeStructureAuditSummary(
    fsSummaryFilters,
    check === 'fee_structure'
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
        <TabsTrigger value='fee_structure'>Fee Structure Match</TabsTrigger>
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

      <TabsContent value='fee_structure' className='space-y-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <p className='max-w-3xl text-sm text-muted-foreground'>
            Each learner&apos;s bills compared with the fee structure they match
            today (institution, programme, quota, community, admission year,
            gender, accommodation — the same match used when bills are
            generated). One row per learner and fee item: a structure fee with
            no bill, a different amount, a bill made from another structure, a
            bill not linked to the structure, or a split fee without its
            instalments.
          </p>
          <div className='flex items-center gap-2'>
            <span className='text-xs text-muted-foreground'>Admission year</span>
            <Select
              value={String(filters.admission_year ?? fsYear)}
              onValueChange={(v) => setFsYear(v === 'all' ? 'all' : Number(v))}
              disabled={filters.admission_year != null}
            >
              <SelectTrigger className='h-8 w-[120px] text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All years</SelectItem>
                {(feeStructureSummary.data?.available_admission_years?.length
                  ? feeStructureSummary.data.available_admission_years
                  : [new Date().getFullYear()]
                ).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <FeeStructureSummaryCards
          summary={feeStructureSummary.data}
          isLoading={feeStructureSummary.isLoading}
        />
        <AuditFeeStructureTable
          filters={fsFilters}
          advanced={fsAdvanced}
          onAdvancedChange={setFsAdvanced}
          summary={feeStructureSummary.data}
          canExport={canExport}
        />
      </TabsContent>
    </Tabs>
  );
}
