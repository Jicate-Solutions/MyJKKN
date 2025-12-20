'use client';

import { DataTable } from '@/components/data-table/data-table';
import type { DataFetchParams, DataFetchResult } from '@/components/data-table/data-table';
import { AlumniSearchParams } from './data-table-schema';
import { alumniColumns } from './columns';
import { LearnerProfileService } from '@/lib/services/learner-profile-service';
import type { LifecycleStatus, LearnerProfile } from '@/types/learner-profile';

interface AlumniDataTableProps {
  search: AlumniSearchParams;
  statusFilter?: 'graduated' | 'alumni';
}

export function AlumniDataTable({
  search,
  statusFilter
}: AlumniDataTableProps) {
  const fetchData = async (params: DataFetchParams) => {
    try {
      const filters = {
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        // Lifecycle status filter - use either statusFilter prop or URL param
        lifecycle_status: (statusFilter || search.lifecycle_status || undefined) as LifecycleStatus | undefined,
        // Organization hierarchy filters
        institution_id: search.institution_id,
        degree_id: search.degree_id,
        department_id: search.department_id,
        program_id: search.program_id,
        semester_id: search.semester_id,
        section_id: search.section_id,
        academic_year_id: search.academic_year_id,
        gender: search.gender,
        is_profile_complete: search.is_profile_complete ? search.is_profile_complete === 'true' : undefined,
        // Date range
        fromDate: params.from_date || undefined,
        toDate: params.to_date || undefined,
      };

      const result = await LearnerProfileService.getLearnerProfiles(filters);

      const { data, metadata } = result;

      return {
        success: true,
        data: data || [],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    } catch (error) {
      console.error('[learners/alumni] Error fetching alumni:', error);
      return {
        success: false,
        data: [],
        pagination: { page: 1, limit: 50, total_pages: 0, total_items: 0 },
      };
    }
  };

  return (
    <DataTable
      fetchDataFn={fetchData as (params: DataFetchParams) => Promise<DataFetchResult<any>>}
      getColumns={() => alumniColumns as any}
      exportConfig={{
        entityName: 'alumni',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: false,
        enableRowSelection: true,
      }}
    />
  );
}
