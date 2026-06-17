'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useTransportCollectables } from '@/hooks/billing/use-transport-collectables';
import { TransportBillsTable } from './transport-bills-table';
import { TransportStatsCards } from './transport-stats-cards';

const ALL = '__all__';

function inr(n: number): string {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TransportCollectionManager() {
  const { can } = usePermissions();
  const canCollect = can('billing.transport.collect');
  const canReceipt = can('billing.receipts.create');
  const { institutions } = useInstitutionsWithAccess();

  const [fInstitution, setFInstitution] = useState(ALL);
  const [fYear, setFYear] = useState(ALL);
  const [search, setSearch] = useState('');

  const institutionId = fInstitution === ALL ? null : fInstitution;
  const academicYearId = fYear === ALL ? null : fYear;

  // Academic years are institution-scoped — only offer the filter once an institution is picked.
  const { data: ayData } = useAcademicYears(institutionId ?? undefined);
  const academicYears: Array<{ id: string; academic_year_name: string }> = institutionId
    ? (ayData?.data ?? [])
    : [];

  const { data: rows, isLoading, error } = useTransportCollectables({ institutionId, academicYearId });

  const instName = useMemo(() => {
    const map = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id == null ? '—' : map.get(id) ?? id);
  }, [institutions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows ?? [];
    if (!q) return list;
    return list.filter((r) => {
      const hay = [r.first_name, r.last_name, r.roll_number, r.route_number, r.route_name, r.stop_name]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const totalOutstanding = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.outstanding_amount || 0), 0),
    [filtered],
  );

  function onInstitutionChange(v: string) {
    setFInstitution(v);
    setFYear(ALL); // AY list depends on the institution
  }

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>
        {filtered.length} learner{filtered.length === 1 ? '' : 's'} · {inr(totalOutstanding)} outstanding.
        Bus (transport) fees for learners who use college transport — paid online to the dedicated
        transport account.
      </p>

      {/* Advanced, filter-aware stats — recomputes as institution / year / search change. */}
      <TransportStatsCards rows={filtered} />

      <Card>
        <CardContent className='flex flex-wrap items-end gap-3 p-4'>
          <div className='min-w-[220px] flex-1 space-y-1.5'>
            <label className='text-muted-foreground text-xs'>Search</label>
            <div className='relative'>
              <Search className='text-muted-foreground absolute left-2 top-2.5 h-4 w-4' />
              <Input
                className='pl-8'
                placeholder='Name, roll number, route, stop…'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
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

      <Card>
        <CardContent className='p-0'>
          {isLoading ? (
            <div className='space-y-2 p-4'>
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className='h-10 w-full' />)}
            </div>
          ) : error ? (
            <div className='py-8 text-center text-sm text-destructive'>
              Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          ) : filtered.length === 0 ? (
            <div className='text-muted-foreground py-10 text-center text-sm'>
              No transport bills to collect. Bills appear here once transport fees are generated for
              learners who use college transport.
            </div>
          ) : (
            <TransportBillsTable rows={filtered} instName={instName} canCollect={canCollect} canReceipt={canReceipt} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
