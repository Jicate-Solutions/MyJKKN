'use client';

import { useMemo } from 'react';
import { useAdmissionPackages } from '@/hooks/campus-living/use-admission-packages';
import { AdmissionPackageService } from '@/lib/services/campus-living/admission-package-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function PackagesDataTable() {
  const { packages, loading, error, fetchPackages } = useAdmissionPackages();

  const columns = useMemo(() => createColumns(), []);

  return (
    <CrudDataTable
      items={packages}
      loading={loading}
      error={error}
      onRefresh={fetchPackages}
      onBulkDelete={async (ids) => {
        const result = await AdmissionPackageService.bulkDeletePackages(ids);
        fetchPackages();
        return result;
      }}
      columns={columns}
      entityLabel='package'
      entityLabelPlural='packages'
    />
  );
}
