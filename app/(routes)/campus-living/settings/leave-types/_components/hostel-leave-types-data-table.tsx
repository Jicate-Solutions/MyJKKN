'use client';

// Campus-living hostel leave-types data-table.
// Thin wrapper around <CrudDataTable> — same pattern as academic
// (post-PR-3a refactor). ~50 LOC instead of the ~245 LOC it would've been
// as a copy-paste from academic.

import { useMemo } from 'react';
import { useHostelLeaveTypes } from '@/hooks/campus-living/use-hostel-leave-types';
import { HostelLeaveTypeService } from '@/lib/services/campus-living/hostel-leave-type-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function HostelLeaveTypesDataTable() {
  const { hostelLeaveTypes, loading, error, fetchHostelLeaveTypes } =
    useHostelLeaveTypes();
  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={hostelLeaveTypes}
      loading={loading}
      error={error}
      onRefresh={fetchHostelLeaveTypes}
      onBulkDelete={async (ids) => {
        const result = await HostelLeaveTypeService.bulkDeleteHostelLeaveTypes(ids);
        fetchHostelLeaveTypes();
        return result;
      }}
      columns={columns}
      entityLabel='hostel leave type'
      entityLabelPlural='hostel leave types'
    />
  );
}
