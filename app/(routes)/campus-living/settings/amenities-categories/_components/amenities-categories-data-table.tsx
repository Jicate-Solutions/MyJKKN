'use client';

import { useMemo } from 'react';
import { useAmenitiesCategories } from '@/hooks/campus-living/use-amenities-categories';
import { AmenitiesCategoryService } from '@/lib/services/campus-living/amenities-category-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function AmenitiesCategoriesDataTable() {
  const { amenitiesCategories, loading, error, fetchAmenitiesCategories } =
    useAmenitiesCategories();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={amenitiesCategories}
      loading={loading}
      error={error}
      onRefresh={fetchAmenitiesCategories}
      onBulkDelete={async (ids) => {
        const result = await AmenitiesCategoryService.bulkDeleteCategories(ids);
        fetchAmenitiesCategories();
        return result;
      }}
      columns={columns}
      entityLabel='amenities category'
      entityLabelPlural='amenities categories'
    />
  );
}
