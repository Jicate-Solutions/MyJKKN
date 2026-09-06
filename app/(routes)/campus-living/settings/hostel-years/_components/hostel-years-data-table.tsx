'use client';

import { useMemo } from 'react';
import { useHostelYears } from '@/hooks/campus-living/use-hostel-years';
import { HostelYearService } from '@/lib/services/campus-living/hostel-year-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function HostelYearsDataTable() {
  const { hostelYears, loading, error, fetchHostelYears } = useHostelYears();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={hostelYears}
      loading={loading}
      error={error}
      onRefresh={fetchHostelYears}
      onBulkDelete={async (ids) => {
        const result = await HostelYearService.bulkDeleteYears(ids);
        fetchHostelYears();
        return result;
      }}
      columns={columns}
      entityLabel='hostel year'
      entityLabelPlural='hostel years'
    />
  );
}
