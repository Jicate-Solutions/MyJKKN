'use client';

// Academic leave-types data-table.
// Before PR-3a this was 245 LOC of bespoke table + bulk-delete UI. Now a thin
// wrapper around <CrudDataTable> — all generic table logic lives in
// components/shared/crud-master/. Academic-specific pieces that stay here:
//   - institution lookup map (super-admin column)
//   - column factory (createColumns — depends on isSuperAdmin + institutionMap)
//   - hook binding (useLeaveTypes → CrudDataTable props)

import { useMemo } from 'react';
import { useLeaveTypes } from '@/hooks/academic/use-leave-types';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { LeaveTypeService } from '@/lib/services/academic/leave-type-service';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns } from './columns';

export function LeaveTypesDataTable() {
  const { leaveTypes, loading, error, fetchLeaveTypes } = useLeaveTypes();
  const { institutions } = useInstitutionsWithAccess();
  const { isSuperAdmin } = usePermissions();

  const institutionMap = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((inst) => map.set(inst.id, inst.name));
    return map;
  }, [institutions]);

  const columns = useMemo(
    () => createColumns({ institutionMap, isSuperAdmin }),
    [institutionMap, isSuperAdmin]
  );

  return (
    <CrudDataTable
      items={leaveTypes}
      loading={loading}
      error={error}
      onRefresh={fetchLeaveTypes}
      onBulkDelete={async (ids) => {
        const result = await LeaveTypeService.bulkDeleteLeaveTypes(ids);
        // Refresh after bulk delete so the table reflects the deletions.
        fetchLeaveTypes();
        return result;
      }}
      columns={columns}
      entityLabel='leave type'
      entityLabelPlural='leave types'
    />
  );
}
