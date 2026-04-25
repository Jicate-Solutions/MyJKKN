'use client';

// Campus-living hostel-residents data-table.
// Adapts the React Query hook shape to CrudDataTable's imperative props.

import { useMemo } from 'react';
import { useHostelResidents } from '@/hooks/campus-living/use-hostel-residents';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { HostelResidentService } from '@/lib/services/campus-living/hostel-resident-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';
import type { ResidentFilters } from '@/types/hostel-residents';

interface HostelResidentsDataTableProps {
  filters?: ResidentFilters;
}

export function HostelResidentsDataTable({ filters }: HostelResidentsDataTableProps) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  const institutionId = isSuperAdmin ? '' : profile?.institution_id ?? '';

  const {
    data: result,
    isLoading,
    error,
    refetch,
  } = useHostelResidents(institutionId, filters);

  const residents = result?.data ?? [];
  const errorMessage = error ? (error as Error).message : null;

  const institutionMap = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((inst: { id: string; name: string }) =>
      map.set(inst.id, inst.name)
    );
    return map;
  }, [institutions]);

  const columns = useMemo(
    () => createColumns({ institutionMap, isSuperAdmin }),
    [institutionMap, isSuperAdmin]
  );

  return (
    <CrudDataTable
      items={residents}
      loading={isLoading}
      error={errorMessage}
      onRefresh={refetch}
      onBulkDelete={async (ids) => {
        const res = await HostelResidentService.bulkDeleteResidents(ids);
        await refetch();
        return res;
      }}
      columns={columns}
      entityLabel='resident'
      entityLabelPlural='residents'
      emptyMessage='No residents yet. Add your first non-learner resident via the button above.'
    />
  );
}
