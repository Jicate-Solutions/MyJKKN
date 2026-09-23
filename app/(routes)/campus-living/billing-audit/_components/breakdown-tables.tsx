'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import type { BillingAuditSummary } from '@/types/campus-living-billing-audit';
import { formatInr, formatInt, formatShare } from './format';

function TableShell({
  title,
  description,
  isLoading,
  empty,
  children
}: {
  title: string;
  description?: string;
  isLoading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-base'>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        ) : empty ? (
          <p className='py-8 text-center text-sm text-muted-foreground'>Nothing in this scope.</p>
        ) : (
          <div className='overflow-x-auto'>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function RoomCategoryTable({
  data,
  isLoading
}: {
  data: BillingAuditSummary['by_room_category'] | undefined;
  isLoading: boolean;
}) {
  const rows = data ?? [];
  return (
    <TableShell
      title='By billed room category'
      description='Category rate is the configured per-bed annual rate (hostel_fees, current hostel year).'
      isLoading={isLoading}
      empty={rows.length === 0}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead className='text-right'>Learners</TableHead>
            <TableHead className='text-right'>Above band</TableHead>
            <TableHead className='text-right'>Room billed</TableHead>
            <TableHead className='text-right'>Category rate</TableHead>
            <TableHead className='text-right'>Room ₹ billed</TableHead>
            <TableHead className='text-right'>Upgrade ₹ billed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id ?? r.name}>
              <TableCell className='font-medium'>{r.name}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatInt(r.learners)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatInt(r.above_band)}</TableCell>
              <TableCell className='text-right tabular-nums'>
                {formatInt(r.room_billed)}{' '}
                <span className='text-xs text-muted-foreground'>({formatShare(r.room_billed, r.learners)})</span>
              </TableCell>
              <TableCell className='text-right tabular-nums'>{formatInr(r.category_room_rate)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatInr(r.room_billed_amount)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatInr(r.upgrade_billed_amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}

export function BlockTable({
  data,
  isLoading,
  institutionId,
  learnersQuery
}: {
  data: BillingAuditSummary['by_block'] | undefined;
  isLoading: boolean;
  /** Block links only work inside one institution (blocks are per college). */
  institutionId: string | undefined;
  learnersQuery: string;
}) {
  const rows = data ?? [];
  const q = learnersQuery ? `&${learnersQuery}` : '';
  return (
    <TableShell
      title='By block'
      description='Learners without a bed are grouped under "Not allocated".'
      isLoading={isLoading}
      empty={rows.length === 0}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Block</TableHead>
            <TableHead className='text-right'>Learners</TableHead>
            <TableHead className='text-right'>Billed</TableHead>
            <TableHead className='text-right'>Collected</TableHead>
            <TableHead className='text-right'>Outstanding</TableHead>
            <TableHead className='text-right'>Overdue</TableHead>
            <TableHead className='text-right'>Upgrade unbilled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const href =
              institutionId && r.id
                ? `/campus-living/billing-audit/learners?finding=all&block_id=${r.id}${q}`
                : null;
            return (
              <TableRow key={r.id ?? r.name}>
                <TableCell className='font-medium'>
                  {href ? (
                    <Link href={href} className='hover:underline'>
                      {r.name}
                    </Link>
                  ) : (
                    r.name
                  )}
                </TableCell>
                <TableCell className='text-right tabular-nums'>{formatInt(r.learners)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatInr(r.billed)}</TableCell>
                <TableCell className='text-right tabular-nums text-emerald-700 dark:text-emerald-400'>
                  {formatInr(r.paid)}
                </TableCell>
                <TableCell className='text-right tabular-nums text-amber-700 dark:text-amber-400'>
                  {formatInr(r.outstanding)}
                </TableCell>
                <TableCell className='text-right tabular-nums text-red-700 dark:text-red-400'>
                  {formatInr(r.overdue)}
                </TableCell>
                <TableCell className='text-right tabular-nums'>{formatInt(r.upgrade_unbilled)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableShell>
  );
}

export function InstitutionTable({
  data,
  isLoading,
  learnersQuery
}: {
  data: BillingAuditSummary['by_institution'] | undefined;
  isLoading: boolean;
  learnersQuery: string;
}) {
  const rows = data ?? [];
  const q = learnersQuery ? `&${learnersQuery}` : '';
  return (
    <TableShell
      title='By institution'
      description='Coverage and money per college. Click a name to open its learners.'
      isLoading={isLoading}
      empty={rows.length === 0}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Institution</TableHead>
            <TableHead className='text-right'>Learners</TableHead>
            <TableHead className='text-right'>With bed</TableHead>
            <TableHead className='text-right'>Room billed</TableHead>
            <TableHead className='text-right'>Mess billed</TableHead>
            <TableHead className='text-right'>Billed</TableHead>
            <TableHead className='text-right'>Collected</TableHead>
            <TableHead className='text-right'>Outstanding</TableHead>
            <TableHead className='text-right'>Overdue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className='font-medium'>
                <Link
                  href={`/campus-living/billing-audit/learners?finding=all&institution_id=${r.id}${q}`}
                  className='hover:underline'
                >
                  {r.name ?? 'Unknown'}
                </Link>
              </TableCell>
              <TableCell className='text-right tabular-nums'>{formatInt(r.learners)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatInt(r.allocated)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatShare(r.room_billed, r.learners)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatShare(r.mess_billed, r.learners)}</TableCell>
              <TableCell className='text-right tabular-nums'>{formatInr(r.billed)}</TableCell>
              <TableCell className='text-right tabular-nums text-emerald-700 dark:text-emerald-400'>
                {formatInr(r.paid)}
              </TableCell>
              <TableCell className='text-right tabular-nums text-amber-700 dark:text-amber-400'>
                {formatInr(r.outstanding)}
              </TableCell>
              <TableCell className='text-right tabular-nums text-red-700 dark:text-red-400'>
                {formatInr(r.overdue)}{' '}
                <span className='text-xs text-muted-foreground'>({formatInt(r.overdue_learners)})</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}
