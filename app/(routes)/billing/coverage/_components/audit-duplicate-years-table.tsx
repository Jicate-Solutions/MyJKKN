'use client';

import React from 'react';
import {
  DataTable,
  type DataFetchParams
} from '@/components/data-table/data-table';
import { duplicateYearColumns } from './audit-duplicate-years-columns';
import { BillCoverageAuditService } from '@/lib/services/billing/coverage/bill-coverage-audit-service';
import type {
  BillCoverageFilters,
  DuplicateYearAuditRow
} from '@/types/billing-coverage';

interface Props {
  filters: BillCoverageFilters;
  canExport: boolean;
}

function transformForExport(
  r: DuplicateYearAuditRow
): Record<string, string | number> {
  return {
    rollNumber: r.roll_number ?? '',
    registerNumber: r.register_number ?? '',
    learnerName: r.full_name || '',
    institution: r.institution_name ?? '',
    programme: r.program_name ?? '',
    semesterSection: r.semester_section ?? '',
    lifecycleStatus: r.lifecycle_status,
    admissionYear: r.admission_year ?? '',
    academicYear: r.academic_year_name,
    billCount: r.bill_count,
    extraBills: r.bill_count - 1,
    categories: r.category_names ?? '',
    likelyCause:
      r.created_same_day && r.due_year_span > 1
        ? 'Multi-year plan'
        : 'Needs review',
    createdSameDay: r.created_same_day ? 'Yes' : 'No',
    dueYearSpan: r.due_year_span,
    programmeEnds: r.programme_end_year ?? '',
    pastProgrammeEnd: r.is_past_programme_end ? 'Yes' : 'No',
    // Raw numbers, never formatCurrency strings — the point of the sheet is that
    // accounts can sum these and see what unwinding the duplicates costs.
    totalBilled: r.total_billed,
    totalPaid: r.total_paid,
    outstanding: r.outstanding
  };
}

export function AuditDuplicateYearsTable({ filters, canExport }: Props) {
  const filterKey = React.useMemo(
    () =>
      JSON.stringify([
        filters.institution_ids ?? null,
        filters.lifecycle_statuses ?? null,
        filters.admission_year ?? null,
        filters.earliest_academic_year ?? null,
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
      const { rows, total } = await BillCoverageAuditService.getDuplicateYears({
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

  const fetchAll = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows } = await BillCoverageAuditService.getDuplicateYears({
        ...filters,
        search: params.search || null,
        page: 1,
        page_size: 5000,
        sort_by: params.sort_by || null,
        sort_dir: (params.sort_order as 'asc' | 'desc') || 'asc'
      });
      return rows;
    },
    [filters]
  );

  return (
    <DataTable<DuplicateYearAuditRow, unknown>
      key={filterKey}
      fetchDataFn={fetchData}
      fetchAllItemsFn={fetchAll}
      getColumns={() => duplicateYearColumns as any}
      // NOT learner_id: a learner can break the rule in several years and would
      // collapse to one selectable row, silently hiding the other violations.
      idField='audit_row_id'
      exportConfig={{
        entityName: 'tuition-duplicate-years',
        columnMapping: {
          rollNumber: 'Roll Number',
          registerNumber: 'Register Number',
          learnerName: 'Learner',
          institution: 'Institution',
          programme: 'Programme',
          semesterSection: 'Semester · Section',
          lifecycleStatus: 'Lifecycle Status',
          admissionYear: 'Admission Year',
          academicYear: 'Academic Year',
          billCount: 'Bills',
          extraBills: 'Extra Bills',
          categories: 'Categories',
          likelyCause: 'Likely Cause',
          createdSameDay: 'Created Same Day',
          dueYearSpan: 'Due Date Year Span',
          programmeEnds: 'Programme Ends',
          pastProgrammeEnd: 'Past Programme End',
          totalBilled: 'Billed (Year)',
          totalPaid: 'Paid',
          outstanding: 'Outstanding'
        },
        columnWidths: [
          { wch: 14 }, { wch: 16 }, { wch: 24 }, { wch: 28 },
          { wch: 26 }, { wch: 20 }, { wch: 16 }, { wch: 15 },
          { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 52 },
          { wch: 18 }, { wch: 17 }, { wch: 18 }, { wch: 16 },
          { wch: 19 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
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
          'academicYear',
          'billCount',
          'extraBills',
          'categories',
          'likelyCause',
          'createdSameDay',
          'dueYearSpan',
          'programmeEnds',
          'pastProgrammeEnd',
          'totalBilled',
          'totalPaid',
          'outstanding'
        ],
        transformFunction: transformForExport
      }}
      config={{
        // Off for the same reason as the missing-years table: a page number
        // carried over from another tab on this route would land this short
        // list on an empty page that reads as a clean result.
        enableUrlState: false,
        enableDateFilter: false,
        enableExport: canExport,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'billing-audit-duplicate-years-table'
      }}
    />
  );
}
