'use client';

import React from 'react';
import {
  DataTable,
  type DataFetchParams
} from '@/components/data-table/data-table';
import { missingYearColumns } from './audit-missing-years-columns';
import { BillCoverageAuditService } from '@/lib/services/billing/coverage/bill-coverage-audit-service';
import type {
  BillCoverageFilters,
  MissingYearAuditRow
} from '@/types/billing-coverage';

interface Props {
  filters: BillCoverageFilters;
  canExport: boolean;
}

const STATE_LABELS: Record<string, string> = {
  gap: 'Gap',
  complete: 'Complete',
  cannot_evaluate: 'Cannot Evaluate'
};

// The export resolves each cell via a FLAT key lookup on the transformed row, so
// this transform FORMATS rather than flattens: nulls become blank instead of
// "null", booleans become readable, and money stays a raw number so accounts can
// sum the column.
function transformForExport(
  r: MissingYearAuditRow
): Record<string, string | number> {
  return {
    rollNumber: r.roll_number ?? '',
    registerNumber: r.register_number ?? '',
    learnerName: r.full_name || '',
    institution: r.institution_name ?? '',
    programme: r.program_name ?? '',
    semesterSection: r.semester_section ?? '',
    lifecycleStatus: r.lifecycle_status,
    // Raw number so the sheet groups and sorts by cohort.
    admissionYear: r.admission_year ?? '',
    result: STATE_LABELS[r.audit_state] ?? r.audit_state,
    expectedYears: r.expected_years,
    billedYears: r.billed_years,
    missingYears: r.missing_years,
    // The column the sheet is taken for: exactly which bills to raise.
    missingYearNames: r.missing_year_names ?? '',
    firstMissingYear: r.first_missing_year ?? '',
    // Raw number so the sheet can be filtered on it; blank when unset rather
    // than 0, which would read as a zero-year course.
    programmeDuration: r.program_duration_yrs ?? '',
    programmeEnds: r.programme_end_year ?? '',
    durationConfigured: r.duration_configured ? 'Yes' : 'No',
    latestYearBilled: r.has_current_year ? 'Yes' : 'No',
    tuitionBills: r.tuition_bill_count,
    unassignedBills: r.unassigned_tuition_bills,
    totalBilled: r.total_billed,
    totalPaid: r.total_paid
  };
}

export function AuditMissingYearsTable({ filters, canExport }: Props) {
  // Re-key on every dimension change so the table resets to page 1. Without it a
  // narrowed filter can strand the user on a page that no longer exists, and an
  // empty grid on an audit screen reads as "no problems" — the opposite of the
  // truth.
  const filterKey = React.useMemo(
    () =>
      JSON.stringify([
        filters.institution_ids ?? null,
        filters.lifecycle_statuses ?? null,
        filters.admission_year ?? null,
        filters.earliest_academic_year ?? null,
        filters.audit_state ?? 'gap',
        filters.include_non_tuition_institutions ?? false,
        filters.accommodation_type_ids ?? null,
        filters.transport ?? 'any',
        filters.gender ?? null,
        filters.degree_id ?? null,
        filters.department_id ?? null,
        filters.program_id ?? null,
        filters.semester_id ?? null,
        filters.section_id ?? null
      ]),
    [
      filters.institution_ids,
      filters.lifecycle_statuses,
      filters.admission_year,
      filters.earliest_academic_year,
      filters.audit_state,
      filters.include_non_tuition_institutions,
      filters.accommodation_type_ids,
      filters.transport,
      filters.gender,
      filters.degree_id,
      filters.department_id,
      filters.program_id,
      filters.semester_id,
      filters.section_id
    ]
  );

  const fetchData = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows, total } = await BillCoverageAuditService.getMissingYears({
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

  // Powers "Export all pages" and cross-page select-all in ONE call. Without it
  // the DataTable pages through fetchData sequentially — 24 round-trips for the
  // 1,193 rows this audit currently returns.
  const fetchAll = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows } = await BillCoverageAuditService.getMissingYears({
        ...filters,
        search: params.search || null,
        page: 1,
        page_size: 5000, // the RPC's own hard cap
        sort_by: params.sort_by || null,
        sort_dir: (params.sort_order as 'asc' | 'desc') || 'asc'
      });
      return rows;
    },
    [filters]
  );

  return (
    <DataTable<MissingYearAuditRow, unknown>
      key={filterKey}
      fetchDataFn={fetchData}
      fetchAllItemsFn={fetchAll}
      getColumns={() => missingYearColumns as any}
      idField='learner_id'
      exportConfig={{
        entityName: 'tuition-missing-years',
        columnMapping: {
          rollNumber: 'Roll Number',
          registerNumber: 'Register Number',
          learnerName: 'Learner',
          institution: 'Institution',
          programme: 'Programme',
          semesterSection: 'Semester · Section',
          lifecycleStatus: 'Lifecycle Status',
          admissionYear: 'Admission Year',
          result: 'Result',
          expectedYears: 'Expected Years',
          billedYears: 'Billed Years',
          missingYears: 'Missing Years',
          missingYearNames: 'Missing Academic Years',
          firstMissingYear: 'First Missing Year',
          programmeDuration: 'Programme Duration (Yrs)',
          programmeEnds: 'Programme Ends',
          durationConfigured: 'Duration Configured',
          latestYearBilled: 'Latest Expected Year Billed',
          tuitionBills: 'Tuition Bills',
          unassignedBills: 'Bills Without Academic Year',
          totalBilled: 'Tuition Billed',
          totalPaid: 'Tuition Paid'
        },
        // One entry per header, in the same order — widths are applied by INDEX,
        // so adding a header without its width shifts every column after it.
        columnWidths: [
          { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 28 },
          { wch: 26 }, { wch: 20 }, { wch: 16 }, { wch: 15 },
          { wch: 16 }, { wch: 15 }, { wch: 13 }, { wch: 14 },
          { wch: 46 }, { wch: 16 }, { wch: 22 }, { wch: 16 },
          { wch: 19 }, { wch: 26 }, { wch: 13 }, { wch: 24 },
          { wch: 15 }, { wch: 15 }
        ],
        headers: [
          'rollNumber',
          'registerNumber',
          'learnerName',
          'institution',
          'programme',
          'semesterSection',
          'lifecycleStatus',
          'admissionYear',
          'result',
          'expectedYears',
          'billedYears',
          'missingYears',
          'missingYearNames',
          'firstMissingYear',
          'programmeDuration',
          'programmeEnds',
          'durationConfigured',
          'latestYearBilled',
          'tuitionBills',
          'unassignedBills',
          'totalBilled',
          'totalPaid'
        ],
        transformFunction: transformForExport
      }}
      config={{
        // Deliberately OFF, unlike the Coverage table. All three tables live on
        // one route and would share the URL's page/search params: arriving here
        // from Coverage page 12 would open the audit on page 12, and for the
        // much shorter duplicates list that is an empty grid — which on an audit
        // screen reads as "no problems", the opposite of the truth.
        enableUrlState: false,
        enableDateFilter: false,
        enableExport: canExport,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'billing-audit-missing-years-table'
      }}
    />
  );
}
