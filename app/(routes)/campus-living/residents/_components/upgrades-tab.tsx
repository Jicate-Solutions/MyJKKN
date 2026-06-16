'use client';

import { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowUpCircle } from 'lucide-react';
import { useCategoryUpgradesReport } from '@/hooks/campus-living/use-category-upgrades-report';
import type {
  UpgradeStatusFilter, UpgradeKindFilter,
} from '@/types/campus-living/category-upgrade-report';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export function UpgradesTab() {
  const { data: rows = [], isLoading } = useCategoryUpgradesReport();
  const [status, setStatus] = useState<UpgradeStatusFilter>('all');
  const [kind, setKind] = useState<UpgradeKindFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status === 'completed' && r.status_label !== 'Completed') return false;
      if (status === 'pending' && r.status_label !== 'Pending') return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (q && !(`${r.learner_name} ${r.roll_number ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, status, kind, search]);

  return (
    <div className='space-y-4'>
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

      {isLoading ? (
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
