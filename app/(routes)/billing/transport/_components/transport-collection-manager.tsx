'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from '@/components/ui/data-table';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useTransportCollectables, type TransportCollectable } from '@/hooks/billing/use-transport-collectables';
import { TransportStatsCards } from './transport-stats-cards';
import { getTransportColumns } from './transport-columns';

const ALL = '__all__';

// Multi-field search for the DataTable's built-in search box.
function transportGlobalFilter(row: any, _columnId: string, value: string): boolean {
  const r = (row?.original ?? row) as TransportCollectable;
  const q = String(value || '').trim().toLowerCase();
  if (!q) return true;
  return [r.first_name, r.last_name, r.roll_number, r.route_number, r.route_name, r.stop_name]
    .filter(Boolean).join(' ').toLowerCase().includes(q);
}

export function TransportCollectionManager() {
  const { can } = usePermissions();
  const canCollect = can('billing.transport.collect');
  const canReceipt = can('billing.receipts.create');
  const { institutions } = useInstitutionsWithAccess();

  const [fInstitution, setFInstitution] = useState(ALL);
  const [fYear, setFYear] = useState(ALL);

  const institutionId = fInstitution === ALL ? null : fInstitution;
  const academicYearId = fYear === ALL ? null : fYear;

  // Academic years are institution-scoped — only offer the filter once an institution is picked.
  const { data: ayData } = useAcademicYears(institutionId ?? undefined);
  const academicYears: Array<{ id: string; academic_year_name: string }> = institutionId
    ? (ayData?.data ?? [])
    : [];

  const { data, isLoading, error, refetch } = useTransportCollectables({ institutionId, academicYearId });
  const rows = useMemo(() => data ?? [], [data]);

  const instName = useMemo(() => {
    const map = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id == null ? '—' : map.get(id) ?? id);
  }, [institutions]);

  const columns = useMemo(
    () => getTransportColumns({ instName, canCollect, canReceipt }),
    [instName, canCollect, canReceipt],
  );

  function onInstitutionChange(v: string) {
    setFInstitution(v);
    setFYear(ALL); // AY list depends on the institution
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        Bus (transport) fees for learners who use college transport — paid online to the dedicated
        transport account, or collect manually. Stats reflect the selected institution / year.
      </p>

      {/* Advanced, filter-aware stats — recomputes as institution / year change. */}
      <TransportStatsCards rows={rows} />

      <Card>
        <CardContent className='flex flex-wrap items-end gap-3 p-4'>
          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Institution</label>
            <Select value={fInstitution} onValueChange={onInstitutionChange}>
              <SelectTrigger className='w-[220px]'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All institutions</SelectItem>
                {institutions.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Academic year</label>
            <Select value={fYear} onValueChange={setFYear} disabled={!institutionId}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue placeholder={institutionId ? 'All years' : 'Pick an institution'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All years</SelectItem>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.academic_year_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className='space-y-2 p-4'>
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className='h-10 w-full' />)}
        </CardContent></Card>
      ) : error ? (
        <Card><CardContent className='py-8 text-center text-sm text-destructive'>
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className='text-muted-foreground py-10 text-center text-sm'>
          No transport bills to collect. Bills appear here once transport fees are generated for
          learners who use college transport.
        </CardContent></Card>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => r.student_id}
          globalFilterFn={transportGlobalFilter}
          searchPlaceholder='Search name, roll number, route, stop…'
          onRefresh={() => refetch()}
        />
      )}
    </div>
  );
}
