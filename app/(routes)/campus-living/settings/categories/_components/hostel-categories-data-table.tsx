'use client';

import { useMemo } from 'react';
import { useHostelCategories } from '@/hooks/campus-living/use-hostel-categories';
import { HostelCategoryService } from '@/lib/services/campus-living/hostel-category-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function HostelCategoriesDataTable() {
  const { hostelCategories, loading, error, fetchHostelCategories } =
    useHostelCategories();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={hostelCategories}
      loading={loading}
      error={error}
      onRefresh={fetchHostelCategories}
      onBulkDelete={async (ids) => {
        const result = await HostelCategoryService.bulkDeleteCategories(ids);
        fetchHostelCategories();
        return result;
      }}
      columns={columns}
      entityLabel='hostel category'
      entityLabelPlural='hostel categories'
    />
  );
}
