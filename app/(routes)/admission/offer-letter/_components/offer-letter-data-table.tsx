'use client';

import { useCallback } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { OfferLetterService } from '@/lib/services/admission/offer-letter-service';

export function OfferLetterDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      const result = await OfferLetterService.getOfferLetters({
        institutionId,
        search: params.search || undefined,
        page: params.page,
        limit: params.limit,
      });

      return {
        success: true,
        data: result.data,
        pagination: {
          page: result.metadata.page,
          limit: result.metadata.limit,
          total_pages: result.metadata.totalPages || 1,
          total_items: result.metadata.total,
        },
      };
    },
    [institutionId]
  );

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns}
      exportConfig={{
        entityName: 'offer-letters',
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
