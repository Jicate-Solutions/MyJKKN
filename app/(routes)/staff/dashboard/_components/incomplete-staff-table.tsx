'use client';
// ============================================
// INCOMPLETE EMPLOYEE PROFILES — DRILL-DOWN TABLE
// ============================================
// Created: 2026-08-10
// Replaces the 50-row capped table that lived inside profile-analytics.tsx.
// Server-side paging / search / sort via the shared DataTable, driven by the
// filter bar next door.
// ============================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DataTable,
  type DataFetchParams,
  type DataFetchResult,
} from '@/components/data-table/data-table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { fetchIncompleteStaffProfiles, useIncompleteStaffFilterOptions } from '@/hooks/staff/use-staff';
import {
  ALL,
  DEFAULT_INCOMPLETE_STAFF_FILTERS,
  FIELD_ASSIGNED,
  FIELD_MISSING,
  type IncompleteStaffFilterState,
} from '@/lib/utils/staff/incomplete-profile-filters';
import { STAFF_FIELD_LABELS } from '@/lib/utils/staff/incomplete-profile-fields';
import type { IncompleteStaffDetail, StaffDashboardFilters } from '@/types/staff';
import { IncompleteStaffFilters } from './incomplete-staff-filters';
import {
  incompleteStaffColumns,
  transformIncompleteStaffForExport,
  INCOMPLETE_STAFF_EXPORT_HEADERS,
  INCOMPLETE_STAFF_EXPORT_MAPPING,
  INCOMPLETE_STAFF_EXPORT_WIDTHS,
  INCOMPLETE_STAFF_PDF_HEADERS,
} from './incomplete-staff-columns';

/** `all` -> undefined, so the query string omits the param entirely. */
function omitAll(value: string): string | undefined {
  return value === ALL ? undefined : value;
}

/**
 * Debounce a value. Text inputs feed the fetch callback's identity, and the
 * DataTable re-runs its fetch effect whenever that identity changes — so an
 * undebounced input fires one request per keystroke.
 */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface IncompleteStaffTableProps {
  filters?: StaffDashboardFilters;
}

export function IncompleteStaffTable({ filters }: IncompleteStaffTableProps) {
  const [fieldFilters, setFieldFilters] = useState<IncompleteStaffFilterState>(
    DEFAULT_INCOMPLETE_STAFF_FILTERS
  );

  // The table's own pickers narrow the scope inherited from the dashboard bar.
  // "All institutions" here means "whatever the dashboard already allows" — not
  // every institution in the system, which RLS would not return anyway.
  const institutionId = omitAll(fieldFilters.institutionId) ?? filters?.institutionId;
  const departmentId = omitAll(fieldFilters.departmentId) ?? filters?.departmentId;
  const categoryId = omitAll(fieldFilters.categoryId) ?? filters?.categoryId;

  const { data: options, isLoading: optionsLoading } = useIncompleteStaffFilterOptions(
    // Options are keyed on the institution only, so paging never refetches them.
    fieldFilters.institutionId !== ALL && fieldFilters.institutionId !== FIELD_MISSING
      ? fieldFilters.institutionId
      : filters?.institutionId
  );

  const debouncedStaffId = useDebouncedValue(fieldFilters.staffIdQuery, 300);
  const debouncedBiometricCode = useDebouncedValue(fieldFilters.biometricCode, 300);

  // Printed under the PDF title so an exported sheet documents its own scope —
  // otherwise a filtered export is indistinguishable from a full one once it
  // has left the app.
  const exportSubtitle = useMemo(() => {
    const parts: string[] = [
      fieldFilters.fieldScope === 'required'
        ? 'Missing required fields'
        : fieldFilters.fieldScope === 'optional'
        ? 'Missing optional fields'
        : 'Missing any tracked field',
    ];
    if (fieldFilters.missingField !== ALL) {
      parts.push(
        `Missing ${STAFF_FIELD_LABELS[fieldFilters.missingField] ?? fieldFilters.missingField}`
      );
    }
    const note = (label: string, value: string) => {
      if (value === ALL || value === '') return;
      parts.push(value === FIELD_MISSING ? `${label}: Not set` : `${label}: filtered`);
    };
    note('Institution', fieldFilters.institutionId);
    note('Department', fieldFilters.departmentId);
    note('Category', fieldFilters.categoryId);
    note('Designation', fieldFilters.designation);
    note('Status', fieldFilters.isActive);
    note('Record Status', fieldFilters.recordStatus);
    note('Gender', fieldFilters.gender);
    note('Marital Status', fieldFilters.maritalStatus);
    note('Blood Group', fieldFilters.bloodGroup);
    note('Biometric Machine', fieldFilters.biometricMachineId);
    // Free-text-or-sentinel fields: note() can't handle these, since a typed
    // value isn't ALL and a raw sentinel must never reach user-visible text.
    const textNote = (label: string, value: string) => {
      if (!value) return;
      if (value === FIELD_MISSING) parts.push(`${label}: Not set`);
      else if (value === FIELD_ASSIGNED) parts.push(`${label}: Enrolled`);
      else parts.push(`${label} contains "${value}"`);
    };
    // Raw values, not debounced — the subtitle describes what the user has
    // selected, and by export time the debounce has long since settled.
    textNote('Staff ID', fieldFilters.staffIdQuery);
    textNote('Biometric Code', fieldFilters.biometricCode);
    if (fieldFilters.joinedFrom || fieldFilters.joinedTo) {
      parts.push(`Joined ${fieldFilters.joinedFrom || '…'} to ${fieldFilters.joinedTo || '…'}`);
    }
    return parts.join(' · ');
  }, [fieldFilters]);

  // Listing every filter in the dep array is what wires them to the table: the
  // DataTable owns page / pageSize / search / sort and re-runs its fetch
  // whenever this callback's identity changes.
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<IncompleteStaffDetail>> => {
      const response = await fetchIncompleteStaffProfiles({
        institutionId,
        departmentId,
        categoryId,
        fieldScope: fieldFilters.fieldScope,
        missingField: omitAll(fieldFilters.missingField),
        designation: omitAll(fieldFilters.designation),
        isActive: omitAll(fieldFilters.isActive),
        recordStatus: omitAll(fieldFilters.recordStatus),
        gender: omitAll(fieldFilters.gender),
        maritalStatus: omitAll(fieldFilters.maritalStatus),
        bloodGroup: omitAll(fieldFilters.bloodGroup),
        joinedFrom: fieldFilters.joinedFrom || undefined,
        joinedTo: fieldFilters.joinedTo || undefined,
        staffIdQuery: debouncedStaffId || undefined,
        biometricCode: debouncedBiometricCode || undefined,
        biometricMachineId: omitAll(fieldFilters.biometricMachineId),
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
      });

      return {
        success: true,
        data: response.profiles,
        pagination: {
          page: response.page,
          limit: response.limit,
          total_pages: response.totalPages,
          total_items: response.total,
        },
      };
    },
    [
      institutionId,
      departmentId,
      categoryId,
      fieldFilters.fieldScope,
      fieldFilters.missingField,
      fieldFilters.designation,
      fieldFilters.isActive,
      fieldFilters.recordStatus,
      fieldFilters.gender,
      fieldFilters.maritalStatus,
      fieldFilters.bloodGroup,
      fieldFilters.joinedFrom,
      fieldFilters.joinedTo,
      fieldFilters.biometricMachineId,
      debouncedStaffId,
      debouncedBiometricCode,
    ]
  );

  return (
    <Card className='mt-6'>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='min-w-0'>
            <CardTitle className='flex items-center gap-2'>
              <AlertCircle className='h-5 w-5 text-orange-600' />
              Employees with Incomplete Profiles
            </CardTitle>
            <CardDescription className='mt-1'>
              Individual employees and the tracked fields they are missing.
              Department and biometric enrolment are filterable here but are not
              counted toward completion, so the percentages above do not move
              when you filter on them.
            </CardDescription>
          </div>
          <Button variant='outline' size='sm' asChild className='shrink-0'>
            <Link href='/staff/list'>
              View All
              <ExternalLink className='ml-1 h-3 w-3' />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        <IncompleteStaffFilters
          value={fieldFilters}
          onChange={setFieldFilters}
          options={options}
          optionsLoading={optionsLoading}
        />

        {fieldFilters.fieldScope === 'required' && (
          <p className='rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground'>
            Required fields are currently complete for every employee, so this
            scope usually returns no rows. Switch to
            <span className='font-medium'> All tracked fields </span>
            or <span className='font-medium'>Optional only</span> to see the real gaps.
          </p>
        )}

        <DataTable
          fetchDataFn={fetchData as any}
          getColumns={() => incompleteStaffColumns as any}
          idField='id'
          exportConfig={{
            entityName: 'incomplete-employee-profiles',
            columnMapping: INCOMPLETE_STAFF_EXPORT_MAPPING,
            columnWidths: INCOMPLETE_STAFF_EXPORT_WIDTHS,
            headers: INCOMPLETE_STAFF_EXPORT_HEADERS,
            transformFunction: transformIncompleteStaffForExport as any,
            // Presence of this object is what puts PDF in the Export menu.
            pdf: {
              headers: INCOMPLETE_STAFF_PDF_HEADERS,
              title: 'Employees with Incomplete Profiles',
              subtitle: exportSubtitle,
              orientation: 'landscape',
            },
          }}
          config={{
            // The dashboard tab selection already owns the query string;
            // letting the table write page/search/sort there too would fight it.
            enableUrlState: false,
            enableRowSelection: false,
            // Joining date is in the filter bar; the built-in picker targets
            // created_at, so an enabled one would be a second, different date.
            enableDateFilter: false,
            enableColumnFilters: false,
            enableSearch: true,
            enableExport: true,
            enableColumnVisibility: true,
            enableColumnResizing: true,
            enableDataSummary: true,
            searchPlaceholder: 'Search name, email, staff ID, biometric code…',
            columnResizingTableId: 'incomplete-staff-detail-table',
            size: 'sm',
          }}
        />
      </CardContent>
    </Card>
  );
}
