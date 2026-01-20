'use client';

import { useState, useCallback, useMemo } from 'react';
import { DataTable } from '@/components/data-table/data-table';
import { changeRequestColumns } from './columns';
import type { ProfileChangeRequest } from '@/types/learner-profile-change';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';

interface ChangeRequestsClientProps {
  initialData: ProfileChangeRequest[];
}

/**
 * Change Requests Client Component
 *
 * Displays pending/approved/rejected profile change requests in a table
 * with status filter tabs and search functionality
 */
export function ChangeRequestsClient({ initialData }: ChangeRequestsClientProps) {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Filter data based on selected status
  const filteredData = useMemo(() => {
    return initialData.filter((request) => request.request_status === statusFilter);
  }, [initialData, statusFilter]);

  /**
   * Fetch data function for DataTable
   * Uses local filtered data
   */
  const fetchData = useCallback(async () => {
    return {
      success: true,
      data: filteredData,
      pagination: {
        total_items: filteredData.length,
        page: 1,
        limit: filteredData.length,
        total_pages: 1,
      },
    };
  }, [filteredData]);

  /**
   * Empty state message based on status filter
   */
  const getEmptyMessage = () => {
    switch (statusFilter) {
      case 'pending':
        return 'No pending change requests at the moment.';
      case 'approved':
        return 'No approved change requests found.';
      case 'rejected':
        return 'No rejected change requests found.';
      default:
        return 'No change requests found.';
    }
  };

  return (
    <Tabs defaultValue="pending" value={statusFilter} onValueChange={(val) => setStatusFilter(val as any)}>
      <TabsList>
        <TabsTrigger value="pending">Pending</TabsTrigger>
        <TabsTrigger value="approved">Approved</TabsTrigger>
        <TabsTrigger value="rejected">Rejected</TabsTrigger>
      </TabsList>

      <TabsContent value={statusFilter} className="space-y-4">
        {filteredData.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">{getEmptyMessage()}</p>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            fetchDataFn={fetchData}
            getColumns={() => changeRequestColumns as any}
            exportConfig={{
              entityName: `change-requests-${statusFilter}`,
              columnMapping: {},
              columnWidths: [],
              headers: [],
            }}
            idField="id"
            config={{
              enableUrlState: false,
              enableDateFilter: false,
              enableExport: false,
              enableRowSelection: true,
              searchPlaceholder: 'Search by student name or roll number...',
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
