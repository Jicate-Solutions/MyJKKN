'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowUpCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useCategoryUpgradesReport } from '@/hooks/campus-living/use-category-upgrades-report';
import { LearnerHosteliteService } from '@/lib/services/campus-living/learner-hostelite-service';
import type { LearnerHostelitesFilters, BlockFilterValue } from '@/types/campus-living';
import type {
  UpgradeStatusFilter, UpgradeKindFilter,
} from '@/types/campus-living/category-upgrade-report';
import { LearnersFilters } from './learners-filters';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function UpgradesTab() {
  const { data: rows = [], isLoading } = useCategoryUpgradesReport();
  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<UpgradeStatusFilter>('all');
  const [kind, setKind] = useState<UpgradeKindFilter>('all');
  const [search, setSearch] = useState('');

  // Shared advanced filters (same <LearnersFilters> as the Learners / Upgrade
  // Categories tabs) drive URL params. This report lists upgrade-fee BILLS, not
  // the v_learner_hostelites surface, so the cascade can't filter its columns
  // directly. Instead we resolve the matching learner-id set from the same
  // hostelite query the other tabs use and keep only bills for those learners.
  // The view is active-hostelite-only, so an applied filter narrows to current
  // residents — acceptable (today's upgrade bills are all for active learners).
  const filterParams = useMemo<Omit<LearnerHostelitesFilters, 'search' | 'sortBy' | 'sortOrder'>>(() => {
    const f: Omit<LearnerHostelitesFilters, 'search' | 'sortBy' | 'sortOrder'> = {};
    const g = (k: string) => searchParams.get(k) ?? undefined;
    if (isSuperAdmin && g('institution_id')) f.institution_id = g('institution_id');
    if (g('degree_id')) f.degree_id = g('degree_id');
    if (g('department_id')) f.department_id = g('department_id');
    if (g('program_id')) f.program_id = g('program_id');
    if (g('semester_id')) f.semester_id = g('semester_id');
    if (g('section_id')) f.section_id = g('section_id');
    if (g('academic_year_id')) f.academic_year_id = g('academic_year_id');
    if (g('gender')) f.gender = g('gender') as 'Male' | 'Female' | 'Other';
    if (g('block_id')) f.block_id = g('block_id') as BlockFilterValue;
    if (g('hostel_category_id')) f.hostel_category_id = g('hostel_category_id');
    const y = g('year_of_study');
    if (y) f.year_of_study = Number(y);
    return f;
  }, [searchParams, isSuperAdmin]);

  const hasAdvancedFilter = Object.keys(filterParams).length > 0;
  const effectiveInstitutionId: string | undefined = isSuperAdmin
    ? undefined
    : (profile?.institution_id ?? undefined);

  // Resolve matching learner ids only when a filter is active (otherwise the
  // full bills report shows). Single pull with a page size well above the
  // current hostelite count (~900); revisit (paginate) if hostelites exceed it.
  const { data: matchingIds, isLoading: idsLoading } = useQuery({
    queryKey: ['campus-living', 'upgrades-report', 'match-ids', effectiveInstitutionId, filterParams],
    queryFn: async () => {
      const { data } = await LearnerHosteliteService.listHostelites(
        effectiveInstitutionId, filterParams, 1, 2000,
      );
      return new Set(data.map((d) => d.id));
    },
    enabled: hasAdvancedFilter,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === 'completed' && r.status_label !== 'Completed') return false;
      if (status === 'pending' && r.status_label !== 'Pending') return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (q && !(`${r.learner_name} ${r.roll_number ?? ''}`.toLowerCase().includes(q))) return false;
      if (hasAdvancedFilter && matchingIds && !matchingIds.has(r.learner_id)) return false;
      return true;
    });
  }, [rows, status, kind, search, hasAdvancedFilter, matchingIds]);

  // While the id set is still resolving, show the loader instead of a transient
  // unfiltered list.
  const resolvingFilter = hasAdvancedFilter && idsLoading;

  return (
    <div className='space-y-4'>
      <LearnersFilters />

      <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
        <div className='space-y-1'>
          <label className='text-xs text-muted-foreground'>Status</label>
          <Select value={status} onValueChange={(v) => setStatus(v as UpgradeStatusFilter)}>
            <SelectTrigger className='w-[160px]'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='completed'>Completed</SelectItem>
              <SelectItem value='pending'>Pending payment</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1'>
          <label className='text-xs text-muted-foreground'>Kind</label>
          <Select value={kind} onValueChange={(v) => setKind(v as UpgradeKindFilter)}>
            <SelectTrigger className='w-[140px]'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All</SelectItem>
              <SelectItem value='room'>Room</SelectItem>
              <SelectItem value='mess'>Mess</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1 sm:ml-auto'>
          <label className='text-xs text-muted-foreground'>Search learner</label>
          <Input
            placeholder='Name or roll number'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full sm:w-[240px]'
          />
        </div>
      </div>

      {isLoading || resolvingFilter ? (
        <div className='flex items-center text-sm text-muted-foreground py-8'>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading upgrades…
        </div>
      ) : filtered.length === 0 ? (
        <div className='flex flex-col items-center gap-2 py-12 text-center'>
          <ArrowUpCircle className='h-10 w-10 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>No category upgrades match these filters.</p>
        </div>
      ) : (
        <div className='rounded-md border overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Learner</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Upgrade</TableHead>
                <TableHead className='text-right'>Fee</TableHead>
                <TableHead className='text-center'>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.bill_id}>
                  <TableCell>
                    <div className='font-medium'>{r.learner_name}</div>
                    <div className='text-xs text-muted-foreground'>{r.roll_number ?? 'N/A'}</div>
                  </TableCell>
                  <TableCell className='text-sm'>{r.institution_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant='outline' className='capitalize'>{r.kind}</Badge>
                  </TableCell>
                  <TableCell className='text-sm'>{r.description || '—'}</TableCell>
                  <TableCell className='text-right'>
                    <div className='font-medium'>{inr(r.upgrade_fee)}</div>
                    {r.status_label === 'Pending' && r.paid_amount > 0 && (
                      <div className='text-xs text-muted-foreground'>{inr(r.paid_amount)} paid</div>
                    )}
                  </TableCell>
                  <TableCell className='text-center'>
                    <Badge
                      variant='outline'
                      className={
                        r.status_label === 'Completed'
                          ? 'border-green-400 text-green-700 dark:text-green-400'
                          : 'border-amber-400 text-amber-700 dark:text-amber-400'
                      }
                    >
                      {r.status_label}
                    </Badge>
                  </TableCell>
                  <TableCell className='text-sm'>{fmtDate(r.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
