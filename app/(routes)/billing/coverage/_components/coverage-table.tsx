'use client';

import React from 'react';
import {
  DataTable,
  type DataFetchParams
} from '@/components/data-table/data-table';
import { columns } from './columns';
import { BillCoverageService } from '@/lib/services/billing/coverage/bill-coverage-service';
import type {
  BillCoverageFilters,
  BillCoverageRow
} from '@/types/billing-coverage';

interface CoverageTableProps {
  /** Dimension filters from the filter bar. Search, sort and paging come from
   *  the DataTable itself. */
  filters: BillCoverageFilters;
  canExport: boolean;
}

// ── Export shaping ─────────────────────────────────────────────────────────
// The shared DataTable export resolves each cell via a FLAT key lookup on the
// transformed row; an empty columnMapping produces an empty file. A
// BillCoverageRow is already flat, so this transform exists to FORMAT rather
// than to flatten: booleans become readable, nulls become blank instead of
// "null", and coverage_state becomes its UI label.
const COVERAGE_EXPORT_LABELS: Record<string, string> = {
  generated: 'Generated',
  not_generated: 'Not Generated',
  cannot_evaluate: 'Cannot Evaluate'
};

function transformCoverageForExport(
  r: BillCoverageRow
): Record<string, string | number> {
  return {
    rollNumber: r.roll_number ?? '',
    registerNumber: r.register_number ?? '',
    learnerName: r.full_name || '',
    gender: r.gender ?? '',
    institution: r.institution_name ?? '',
    programme: r.program_name ?? '',
    semesterSection: r.semester_section ?? '',
    academicYear: r.academic_year_name ?? '',
    accommodation: r.accommodation_type ?? '',
    transport: r.uses_transport ? 'Bus' : '',
    lifecycleStatus: r.lifecycle_status,
    bills: r.bill_count,
    totalBilled: r.total_billed,
    coverage: COVERAGE_EXPORT_LABELS[r.coverage_state] ?? r.coverage_state
  };
}

export function CoverageTable({ filters, canExport }: CoverageTableProps) {
  // Re-key the table whenever a dimension filter changes so it resets to page 1.
  // Without this a narrowed result set can leave the user on a page that no
  // longer exists, rendering an empty grid — which on this screen reads as
  // "no gaps", the opposite of the truth.
  const filterKey = React.useMemo(
    () =>
      JSON.stringify([
        filters.academic_year_id ?? null,
        filters.institution_ids ?? null,
        filters.lifecycle_statuses ?? null,
        filters.billing_category_id ?? null,
        filters.accommodation_type_ids ?? null,
        filters.transport ?? 'any',
        filters.gender ?? null,
        filters.coverage_state ?? 'not_generated',
        filters.include_non_billing_institutions ?? false
      ]),
    [
      filters.academic_year_id,
      filters.institution_ids,
      filters.lifecycle_statuses,
      filters.billing_category_id,
      filters.accommodation_type_ids,
      filters.transport,
      filters.gender,
      filters.coverage_state,
      filters.include_non_billing_institutions
    ]
  );

  const fetchData = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows, total } = await BillCoverageService.getLearners({
        ...filters,
        search: params.search || null,
        page: params.page,
        page_size: params.limit,
        sort_by: params.sort_by || null,
        sort_dir: (params.sort_order as 'asc' | 'desc') || 'asc'
      });

      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / Math.max(params.limit, 1))),
          total_items: total
        }
      };
    },
    [filters]
  );

  return (
    <DataTable<BillCoverageRow, unknown>
      key={filterKey}
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      idField='learner_id'
      exportConfig={{
        entityName: 'bill-coverage',
        // Keys are the FLAT keys emitted by transformCoverageForExport.
        columnMapping: {
          rollNumber: 'Roll Number',
          registerNumber: 'Register Number',
          learnerName: 'Learner',
          gender: 'Gender',
          institution: 'Institution',
          programme: 'Programme',
          semesterSection: 'Semester · Section',
          academicYear: 'Academic Year',
          accommodation: 'Accommodation',
          transport: 'Transport',
          lifecycleStatus: 'Lifecycle Status',
          bills: 'Bills',
          totalBilled: 'Total Billed',
          coverage: 'Coverage'
        },
        columnWidths: [
          { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 10 },
          { wch: 28 }, { wch: 26 }, { wch: 20 }, { wch: 14 },
          { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 8 },
          { wch: 14 }, { wch: 16 }
        ],
        headers: [
          'rollNumber',
          'registerNumber',
          'learnerName',
          'gender',
          'institution',
          'programme',
          'semesterSection',
          'academicYear',
          'accommodation',
          'transport',
          'lifecycleStatus',
          'bills',
          'totalBilled',
          'coverage'
        ],
        transformFunction: transformCoverageForExport
      }}
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        // billing.coverage.export is granted separately from .view — a role may
        // read the gap list without being allowed to take it off-platform.
        enableExport: canExport,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'billing-coverage-table'
      }}
    />
  );
}
