'use client';

import { useCallback } from 'react';
import { DataTable, type DataFetchParams, type DataFetchResult } from '@/components/data-table/data-table';
import { columns } from './columns';
import type { ApplicationStatusRow } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { StatusTrackingService } from '@/lib/services/admission/status-tracking-service';
import type { ApplicationStatusEntry } from '@/lib/services/admission/status-tracking-service';

function mapToStatusRow(entry: ApplicationStatusEntry): ApplicationStatusRow {
  return {
    id: entry.id,
    institution_id: entry.institution_id,
    lead_id: entry.lead_id,
    program_id: null,
    academic_year: null,
    application_number: entry.application_number ?? null,
    status: entry.status ?? null,
    submitted_at: entry.submitted_at ?? null,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    reviewer_id: null,
    review_notes: entry.review_notes ?? null,
    rejection_reason: null,
    admission_leads: entry.lead_name
      ? {
          full_name: entry.lead_name || null,
          phone: entry.lead_phone || null,
          email: entry.lead_email || null,
        }
      : null,
  };
}

export function StatusDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<ApplicationStatusRow>> => {
      const result = await StatusTrackingService.getApplications({
        institutionId,
        search: params.search || undefined,
        page: params.page,
        limit: params.limit,
      });

      const rows = result.applications.map(mapToStatusRow);
      const totalPages = Math.ceil(result.total / params.limit) || 1;

      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: totalPages,
          total_items: result.total,
        },
      };
    },
    [institutionId]
  );

  return (
    <DataTable
      fetchDataFn={fetchData as any}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'application-status',
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{
        enableUrlState: false,
        enableDateFilter: false,
        enableExport: false,
      }}
    />
  );
}
