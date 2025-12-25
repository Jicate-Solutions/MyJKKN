/**
 * Server-rendered Enquiries Table with Client Selection
 *
 * Hybrid component: Renders on server but supports client-side row selection.
 */

'use client';

import { DataTable } from '@/components/data-table/data-table';
import { enquiryColumns } from './columns';
import type { LearnerProfile } from '@/types/learner-profile';

interface EnquiriesTableServerProps {
  initialData: LearnerProfile[];
  metadata: {
    total_items: number;
    page: number;
    limit: number;
    total_pages: number;
  };
  statusFilter?: 'enquiry' | 'pending' | 'rejected' | 'waitlisted';
}

/**
 * Enquiries Table with Server-Side Data
 *
 * Receives pre-fetched data from server component
 */
export function EnquiriesTableServer({
  initialData,
  metadata,
  statusFilter
}: EnquiriesTableServerProps) {
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
      getColumns={() => enquiryColumns as any}
      exportConfig={{
        entityName: `${statusFilter || 'all'}-enquiries`,
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
