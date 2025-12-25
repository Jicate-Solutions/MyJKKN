/**
 * Server-rendered Alumni Table
 *
 * Hybrid component: Renders on server but supports client-side interactions.
 */

'use client';

import { DataTable } from '@/components/data-table/data-table';
import { alumniColumns } from './columns';
import type { LearnerProfile } from '@/types/learner-profile';

interface AlumniTableServerProps {
  initialData: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  statusFilter?: 'graduated' | 'alumni';
}

/**
 * Alumni Table with Server-Side Data
 *
 * Receives pre-fetched data from server component
 */
export function AlumniTableServer({
  initialData,
  metadata,
  statusFilter
}: AlumniTableServerProps) {
  /**
   * Fetch data function for DataTable
   * Uses URL state to trigger server-side re-renders
   */
  const fetchData = async () => {
    // This component receives pre-fetched data from server
    // The DataTable will trigger page navigation for pagination/sorting
    return {
      success: true,
      data: initialData,
      pagination: metadata
    };
  };

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => alumniColumns as any}
      exportConfig={{
        entityName: `${statusFilter || 'all'}-alumni`,
        columnMapping: {},
        columnWidths: [],
        headers: [],
      }}
      idField="id"
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: false,
        enableRowSelection: false,
      }}
    />
  );
}
