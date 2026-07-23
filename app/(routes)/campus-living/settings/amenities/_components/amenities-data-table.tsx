'use client';

import { useMemo } from 'react';
import { useAmenities } from '@/hooks/campus-living/use-amenities';
import { AmenityService } from '@/lib/services/campus-living/amenity-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function AmenitiesDataTable() {
  const { amenities, loading, error, fetchAmenities } = useAmenities();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={amenities}
      loading={loading}
      error={error}
      onRefresh={fetchAmenities}
      onBulkDelete={async (ids) => {
        const result = await AmenityService.bulkDeleteAmenities(ids);
        fetchAmenities();
        return result;
      }}
      columns={columns}
      entityLabel='amenity'
      entityLabelPlural='amenities'
    />
  );
}
