'use client';
// ============================================
// PROFILE COMPLETION DRILL-DOWN TABLE
// ============================================
// Created: 2026-07-30
// Purpose: Advanced (shared) DataTable for the Profile Completion tab, with
//          server-side paging/search/sort, field filters and the cascading
//          organisational hierarchy.
// ============================================

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  DataTable,
  type DataFetchParams,
  type DataFetchResult,
} from '@/components/data-table/data-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, UserCheck } from 'lucide-react';
import {
  fetchIncompleteProfiles,
  useIncompleteProfileFilterOptions,
} from '@/hooks/use-learner-profiles';
import {
  PROFILE_COMPLETION_LIFECYCLE_STATUSES,
  PROFILE_FIELD_MISSING,
  PROFILE_MISSING_FIELD_LABELS,
  type IncompleteProfileDetail,
  type LearnerDashboardFilters,
  type ProfileFilterOption,
  type ProfileMissingFieldFilter,
} from '@/types/learner-dashboard';
import {
  ALL,
  DEFAULT_PROFILE_COMPLETION_FILTERS,
  IncompleteProfilesFilters,
  type ProfileCompletionFilterState,
} from './incomplete-profiles-filters';
import {
  incompleteProfilesColumns,
  transformIncompleteProfileForExport,
  INCOMPLETE_PROFILES_EXPORT_HEADERS,
  INCOMPLETE_PROFILES_EXPORT_MAPPING,
  INCOMPLETE_PROFILES_EXPORT_WIDTHS,
  INCOMPLETE_PROFILES_PDF_HEADERS,
} from './incomplete-profiles-columns';

/**
 * The lifecycle scope the API enforces, spelled out for humans.
 *
 * Derived from the same constant the route filters on, so the sentence under
 * the title and the subtitle stamped on an export can never claim a population
 * the endpoint does not actually return.
 */
const LIFECYCLE_SCOPE_LABEL = PROFILE_COMPLETION_LIFECYCLE_STATUSES.map(
  (status) => status.charAt(0).toUpperCase() + status.slice(1)
).join(', ');

/** `all` -> undefined so the query string omits the param entirely. */
function omitAll(value: string): string | undefined {
  return value === ALL ? undefined : value;
}

interface IncompleteProfilesTableProps {
  filters: LearnerDashboardFilters;
}

export function IncompleteProfilesTable({ filters }: IncompleteProfilesTableProps) {
  const [fieldFilters, setFieldFilters] = useState<ProfileCompletionFilterState>(
    DEFAULT_PROFILE_COMPLETION_FILTERS
  );

  // Institution scope: the table's own Institution picker narrows the
  // dashboard-level scope it inherits. "All institutions" here means "whatever
  // the dashboard filter already allows" — NOT every institution in the system,
  // which a non-super-admin could not see anyway.
  const institutionIds = useMemo(() => {
    if (fieldFilters.institutionId !== ALL) return [fieldFilters.institutionId];
    return filters.institutionIds?.length ? filters.institutionIds : undefined;
  }, [fieldFilters.institutionId, filters.institutionIds]);

  // Stable primitive key — `institutionIds` is an array, so depending on it
  // directly would rebuild fetchData (and refetch) on every parent render.
  const institutionKey = useMemo(
    () => (institutionIds?.length ? [...institutionIds].sort().join(',') : ''),
    [institutionIds]
  );

  const { data: yearOptions, isLoading: yearOptionsLoading } =
    useIncompleteProfileFilterOptions(institutionIds);

  // Printed under the PDF title so an exported sheet documents its own scope —
  // otherwise a filtered export is indistinguishable from a full one once it
  // has left the app.
  const exportSubtitle = useMemo(() => {
    const resolve = (value: string, list: ProfileFilterOption[] | undefined) =>
      value === PROFILE_FIELD_MISSING
        ? 'Not set'
        : list?.find((option) => option.value === value)?.label ?? value;

    const parts: string[] = [
      `Lifecycle: ${LIFECYCLE_SCOPE_LABEL}`,
      fieldFilters.completion === 'incomplete'
        ? 'Incomplete profiles'
        : fieldFilters.completion === 'complete'
        ? 'Complete profiles'
        : 'All profiles',
    ];

    if (fieldFilters.missingField !== ALL) {
      parts.push(`Missing ${PROFILE_MISSING_FIELD_LABELS[fieldFilters.missingField]}`);
    }
    // The cascade's option lists live inside the filter component, so the
    // subtitle reports the sentinel plainly and otherwise just notes that the
    // level is narrowed — the row data itself carries the actual names.
    const orgLevel = (label: string, value: string) => {
      if (value === ALL) return;
      parts.push(
        value === PROFILE_FIELD_MISSING ? `${label}: Not set` : `${label}: filtered`
      );
    };
    orgLevel('Institution', fieldFilters.institutionId);
    orgLevel('Department', fieldFilters.departmentId);
    orgLevel('Program', fieldFilters.programId);
    orgLevel('Semester', fieldFilters.semesterId);
    orgLevel('Section', fieldFilters.sectionId);

    if (fieldFilters.academicYearId !== ALL) {
      parts.push(
        `Academic Year: ${resolve(fieldFilters.academicYearId, yearOptions?.academicYears)}`
      );
    }
    if (fieldFilters.admissionYearId !== ALL) {
      parts.push(
        `Admission Year: ${resolve(fieldFilters.admissionYearId, yearOptions?.admissionYears)}`
      );
    }

    return parts.join(' · ');
  }, [fieldFilters, yearOptions]);

  // The shared DataTable owns page / pageSize / search / sort and re-runs its
  // fetch effect whenever this callback's identity changes — so listing the
  // field filters in the dep array is what wires them to the table.
  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<IncompleteProfileDetail>> => {
      const response = await fetchIncompleteProfiles({
        institutionIds: institutionKey ? institutionKey.split(',') : undefined,
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        completion: fieldFilters.completion,
        missingField: omitAll(fieldFilters.missingField) as
          | ProfileMissingFieldFilter
          | undefined,
        departmentId: omitAll(fieldFilters.departmentId),
        programId: omitAll(fieldFilters.programId),
        semesterId: omitAll(fieldFilters.semesterId),
        sectionId: omitAll(fieldFilters.sectionId),
        academicYearId: omitAll(fieldFilters.academicYearId),
        admissionYearId: omitAll(fieldFilters.admissionYearId),
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
      institutionKey,
      fieldFilters.completion,
      fieldFilters.missingField,
      fieldFilters.departmentId,
      fieldFilters.programId,
      fieldFilters.semesterId,
      fieldFilters.sectionId,
      fieldFilters.academicYearId,
      fieldFilters.admissionYearId,
    ]
  );

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <UserCheck className='h-5 w-5 text-orange-600' />
              Profile Completion Detail
            </CardTitle>
            <CardDescription className='mt-1'>
              Drill down into individual learners and the required fields they are missing.
              Limited to learners in the onboarding corridor ({LIFECYCLE_SCOPE_LABEL}) —
              enquiries, rejected applicants and learners who have already left are chased
              from their own modules, not here, so this count is smaller than the summary
              cards above. Completion is also derived live from the required fields — college
              email, academic year, semester, section and gender — so it can differ from both
              the stored profile-complete flag and the four-field funnel those cards count.
            </CardDescription>
          </div>
          <Button variant='outline' size='sm' asChild className='shrink-0'>
            <Link href='/learners/profiles?is_profile_complete=false'>
              View All
              <ExternalLink className='ml-1 h-3 w-3' />
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        <IncompleteProfilesFilters
          value={fieldFilters}
          onChange={setFieldFilters}
          yearOptions={yearOptions}
          yearOptionsLoading={yearOptionsLoading}
        />

        <DataTable
          fetchDataFn={fetchData as any}
          getColumns={() => incompleteProfilesColumns as any}
          idField='id'
          exportConfig={{
            entityName: 'profile-completion',
            columnMapping: INCOMPLETE_PROFILES_EXPORT_MAPPING,
            columnWidths: INCOMPLETE_PROFILES_EXPORT_WIDTHS,
            // Includes semester_name / section_name, which are not table
            // columns — the exporter passes through headers it does not
            // recognise as columns, so they reach the file but not the UI.
            headers: INCOMPLETE_PROFILES_EXPORT_HEADERS,
            transformFunction: transformIncompleteProfileForExport as any,
            // Presence of this object is what puts PDF in the Export menu.
            pdf: {
              headers: INCOMPLETE_PROFILES_PDF_HEADERS,
              title: 'Learner Profile Completion',
              subtitle: exportSubtitle,
              orientation: 'landscape',
            },
          }}
          config={{
            // This table lives inside a tab whose selection is itself a URL
            // param — letting the table write page/search/sort to the URL too
            // would fight the analytics page for the query string.
            enableUrlState: false,
            enableRowSelection: false,
            // The API has no created-at range filter, so an enabled date picker
            // would be a control that silently does nothing.
            enableDateFilter: false,
            enableColumnFilters: false,
            enableSearch: true,
            enableExport: true,
            enableColumnVisibility: true,
            enableColumnResizing: true,
            enableDataSummary: true,
            searchPlaceholder: 'Search name, email, roll no…',
            columnResizingTableId: 'profile-completion-detail-table',
            size: 'sm',
          }}
        />
      </CardContent>
    </Card>
  );
}
