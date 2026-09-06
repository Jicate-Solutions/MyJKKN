'use client';

import { useMemo } from 'react';
import { useMessCategories } from '@/hooks/campus-living/use-mess-categories';
import { MessCategoryService } from '@/lib/services/campus-living/mess-category-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function MessCategoriesDataTable() {
  const { messCategories, loading, error, fetchMessCategories } =
    useMessCategories();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={messCategories}
      loading={loading}
      error={error}
      onRefresh={fetchMessCategories}
      onBulkDelete={async (ids) => {
        const result = await MessCategoryService.bulkDeleteCategories(ids);
        fetchMessCategories();
        return result;
      }}
      columns={columns}
      entityLabel='mess category'
      entityLabelPlural='mess categories'
    />
  );
}
