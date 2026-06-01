'use client';

import React from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { columns } from './billing-activity-columns';
import { BillingActivityService } from '@/lib/services/billing/billing-activity-service';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import type { BillingActivityFilterValues } from './billing-activity-filters';

interface BillingActivityDataTableProps {
  filters: BillingActivityFilterValues;
}

export function BillingActivityDataTable({
  filters
}: BillingActivityDataTableProps) {
  const { userProfile, isLoading: permissionsLoading } = usePermissions();
  const isReady = !permissionsLoading && !!userProfile;

  const fetchData = React.useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      from_date: string;
      to_date: string;
      sort_by: string;
      sort_order: string;
    }) => {
      try {
        const { data, metadata } =
          await BillingActivityService.getActivities({
            page: params.page,
            limit: params.limit,
            search: filters.search || params.search || undefined,
            sortBy: params.sort_by || 'created_at',
            sortDirection: (params.sort_order as 'asc' | 'desc') || 'desc',
            action_type: filters.action_type || undefined,
            resource_type: filters.resource_type || undefined,
            institution_id: filters.institution_id || undefined,
            date_from: filters.date_from
              ? `${filters.date_from}T00:00:00Z`
              : undefined,
            date_to: filters.date_to
              ? `${filters.date_to}T23:59:59Z`
              : undefined
          });

        return {
          success: true,
          data: data || [],
          pagination: {
            page: params.page,
            limit: params.limit,
            total_pages: metadata?.totalPages ?? 0,
            total_items: metadata?.total ?? 0
          }
        };
      } catch (error) {
        console.error('Error fetching billing activities:', error);
        throw error;
      }
    },
    [
      filters.search,
      filters.action_type,
      filters.resource_type,
      filters.institution_id,
      filters.date_from,
      filters.date_to
    ]
  );

  if (!isReady) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-8 w-40' />
          <Skeleton className='h-8 w-32' />
        </div>
        <div className='space-y-3'>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      </div>
    );
  }

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      exportConfig={{
        entityName: 'billing-activities',
        columnMapping: {
          created_at: 'Time',
          user: 'User',
          action_type: 'Action',
          resource_type: 'Resource',
          description: 'Description',
          institution: 'Institution'
        },
        columnWidths: [
          { wch: 20 },
          { wch: 20 },
          { wch: 15 },
          { wch: 12 },
          { wch: 50 },
          { wch: 25 }
        ],
        headers: [
          'Time',
          'User',
          'Action',
          'Resource',
          'Description',
          'Institution'
        ]
      }}
      idField='id'
      config={{
        enableUrlState: false,
        enableDateFilter: false,
        enableExport: true,
        enableRowSelection: false,
        enableSearch: false,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'billing-activities-table'
      }}
    />
  );
}
