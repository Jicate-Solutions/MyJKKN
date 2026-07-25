'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBillCoverageSummary,
  useBillCoverageLearners
} from '@/hooks/billing/use-bill-coverage';
import { BillCoverageService } from '@/lib/services/billing/coverage/bill-coverage-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  BillCoverageFilters,
  BillCoverageRow
} from '@/types/billing-coverage';
import { LEARNER_SCOPE_DEFAULT } from '@/types/billing-coverage';
import { CoverageSummaryCards } from './coverage-summary-cards';
import { CoverageFilterBar } from './coverage-filter-bar';
import { CoverageTable } from './coverage-table';
import { exportCoverageToExcel } from './coverage-export';

const PAGE_SIZE = 50;

// The RPC clamps p_page_size at 200, so a full export must page through.
const EXPORT_PAGE_SIZE = 200;
const EXPORT_MAX_PAGES = 50; // 10,000 rows — a runaway guard, not a product cap.

export function CoverageClient() {
  const { canAccess, isSuperAdmin } = usePermissions();
  // The export key is granted separately from view — a role may read the
  // coverage list without being allowed to take learner data off-platform.
  const canExport = isSuperAdmin || canAccess('billing.coverage', 'export');

  const [filters, setFilters] = useState<BillCoverageFilters>({
    academic_year_id: null,
    institution_ids: null,
    lifecycle_statuses: [...LEARNER_SCOPE_DEFAULT],
    billing_category_id: null,
    coverage_state: 'not_generated',
    include_non_billing_institutions: false,
    search: null,
    page: 1,
    page_size: PAGE_SIZE
  });
  const [isExporting, setIsExporting] = useState(false);

  const summaryQuery = useBillCoverageSummary(filters);
  const learnersQuery = useBillCoverageLearners(filters);

  // Any filter change resets to page 1 — otherwise a narrowed result set can
  // land the user on a page that no longer exists and render as empty, which
  // on this screen reads as "no gaps".
  const handleChange = (next: Partial<BillCoverageFilters>) =>
    setFilters((prev) => ({ ...prev, ...next, page: next.page ?? 1 }));

  const handleExport = async () => {
    if (!canExport || isExporting) return;
    setIsExporting(true);
    try {
      const collected: BillCoverageRow[] = [];
      let page = 1;
      let total = 0;

      // Page through the full result set rather than exporting only what is
      // on screen. A silently truncated gap list reads as complete.
      while (page <= EXPORT_MAX_PAGES) {
        const batch = await BillCoverageService.getLearners({
          ...filters,
          page,
          page_size: EXPORT_PAGE_SIZE
        });
        total = batch.total;
        collected.push(...batch.rows);
        if (batch.rows.length < EXPORT_PAGE_SIZE || collected.length >= total) {
          break;
        }
        page += 1;
      }

      if (collected.length === 0) {
        toast('Nothing to export for these filters.');
        return;
      }

      await exportCoverageToExcel(collected, filters);

      if (collected.length < total) {
        toast(
          `Exported ${collected.length} of ${total} rows — the export is capped at ${
            EXPORT_MAX_PAGES * EXPORT_PAGE_SIZE
          }. Narrow the filters to capture the rest.`,
          { duration: 7000 }
        );
      } else {
        toast.success(`Exported ${collected.length} rows.`);
      }
    } catch (error) {
      console.error('[billing/coverage] Export failed:', error);
      toast.error(`Export failed — ${getErrorMessage(error)}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className='space-y-6'>
      <CoverageSummaryCards
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
      />
      <CoverageFilterBar
        filters={filters}
        onChange={handleChange}
        onExport={handleExport}
        canExport={canExport}
        isExporting={isExporting}
      />
      <CoverageTable
        rows={learnersQuery.data?.rows ?? []}
        total={learnersQuery.data?.total ?? 0}
        page={filters.page ?? 1}
        pageSize={PAGE_SIZE}
        isLoading={learnersQuery.isLoading}
        error={learnersQuery.error}
        onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
      />
    </div>
  );
}
