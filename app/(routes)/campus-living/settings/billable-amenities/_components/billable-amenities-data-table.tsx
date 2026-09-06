'use client';

import { useMemo } from 'react';
import { useBillableAmenities } from '@/hooks/campus-living/use-billable-amenities';
import { BillableAmenityService } from '@/lib/services/campus-living/billable-amenity-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function BillableAmenitiesDataTable() {
  const { billableAmenities, loading, error, fetchBillableAmenities } =
    useBillableAmenities();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={billableAmenities}
      loading={loading}
      error={error}
      onRefresh={fetchBillableAmenities}
      onBulkDelete={async (ids) => {
        const result = await BillableAmenityService.bulkDeleteBillableAmenities(
          ids
        );
        fetchBillableAmenities();
        return result;
      }}
      columns={columns}
      entityLabel='billable amenity'
      entityLabelPlural='billable amenities'
    />
  );
}
