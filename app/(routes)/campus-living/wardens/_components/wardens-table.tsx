'use client';

// Campus-living hostel-wardens data-table.
// Mirrors the residents data-table pattern: React Query hook → CrudDataTable
// adapter. Bulk delete loops single deletes since the service has no
// bulkDeleteWardens method.

import { useEffect, useMemo, useState } from 'react';
import { useHostelWardens } from '@/hooks/campus-living/use-hostel-wardens';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { HostelWardenService } from '@/lib/services/campus-living/hostel-warden-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { createColumns, type HostelWardenWithRefs } from './columns';
import type { WardenFilters } from '@/types/campus-living';

interface WardensTableProps {
  filters?: WardenFilters;
}

export function WardensTable({ filters }: WardensTableProps) {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  const institutionId = isSuperAdmin ? '' : profile?.institution_id ?? '';

  // Strip the `search` filter — that's client-side only, not a server arg.
  const { search: _search, ...serverFilters } = filters ?? {};
  void _search;
  const {
    data: wardens,
    isLoading,
    error,
    refetch,
  } = useHostelWardens(
    institutionId,
    serverFilters as unknown as Record<string, unknown>
  );

  const wardenRows = (wardens ?? []) as HostelWardenWithRefs[];
  const errorMessage = error ? (error as Error).message : null;

  // Look up staff names so the Name column has more than a UUID.
  const [staffMap, setStaffMap] = useState<
    Map<string, { full_name: string | null; email: string | null }>
  >(new Map());

  useEffect(() => {
    const staffIds = Array.from(new Set(wardenRows.map((w) => w.staff_id))).filter(Boolean);
    if (staffIds.length === 0) {
      setStaffMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await supabase
        .from('staff')
        .select('id, first_name, last_name, email')
        .in('id', staffIds);
      if (cancelled) return;
      const next = new Map<string, { full_name: string | null; email: string | null }>();
      ((data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]).forEach((s) => {
        const full = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
        next.set(s.id, { full_name: full || null, email: s.email });
      });
      setStaffMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardenRows.map((w) => w.staff_id).join(',')]);

  // Apply search filter client-side (server hook doesn't support it).
  const filteredRows = useMemo(() => {
    const search = filters?.search?.trim().toLowerCase();
    if (!search) return wardenRows;
    return wardenRows.filter((w) => {
      const staff = staffMap.get(w.staff_id);
      return (
        staff?.full_name?.toLowerCase().includes(search) ||
        staff?.email?.toLowerCase().includes(search) ||
        w.phone?.toLowerCase().includes(search)
      );
    });
  }, [wardenRows, filters?.search, staffMap]);

  const institutionMap = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((inst: { id: string; name: string }) =>
      map.set(inst.id, inst.name)
    );
    return map;
  }, [institutions]);

  const columns = useMemo(
    () => createColumns({ institutionMap, staffMap, isSuperAdmin }),
    [institutionMap, staffMap, isSuperAdmin]
  );

  return (
    <CrudDataTable
      items={filteredRows}
      loading={isLoading}
      error={errorMessage}
      onRefresh={refetch}
      onBulkDelete={async (ids) => {
        const success: string[] = [];
        const failed: { id: string; error: string }[] = [];
        for (const id of ids) {
          try {
            await HostelWardenService.deleteWarden(id);
            success.push(id);
          } catch (err) {
            failed.push({ id, error: (err as Error).message });
          }
        }
        await refetch();
        return { success, failed };
      }}
      columns={columns}
      entityLabel='warden'
      entityLabelPlural='wardens'
      emptyMessage="No wardens yet. Click 'Assign Warden' to add one."
    />
  );
}
