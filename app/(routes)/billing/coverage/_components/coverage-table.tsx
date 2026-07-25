'use client';

import Link from 'next/link';
import { AlertCircle, ShieldOff } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getErrorMessage } from '@/lib/utils';
import type { BillCoverageRow } from '@/types/billing-coverage';

interface CoverageTableProps {
  rows: BillCoverageRow[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: unknown;
  onPageChange: (page: number) => void;
}

const nf = new Intl.NumberFormat('en-IN');
const currency = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(n);

function coverageBadge(state: BillCoverageRow['coverage_state']) {
  if (state === 'generated') {
    return (
      <Badge className='border-green-200 bg-green-100 text-green-800'>
        Generated
      </Badge>
    );
  }
  if (state === 'cannot_evaluate') {
    return <Badge variant='outline'>Cannot evaluate</Badge>;
  }
  return (
    <Badge className='border-orange-200 bg-orange-100 text-orange-800'>
      Not generated
    </Badge>
  );
}

export function CoverageTable({
  rows,
  total,
  page,
  pageSize,
  isLoading,
  error,
  onPageChange
}: CoverageTableProps) {
  // An error must never render as an empty table. On this screen an empty
  // table reads as "no gaps" — the exact opposite of the truth.
  if (error) {
    const message = getErrorMessage(error);
    const denied =
      typeof message === 'string' &&
      (message.includes('42501') || message.includes('permission denied'));

    return (
      <Alert variant='destructive'>
        {denied ? (
          <ShieldOff className='h-4 w-4' />
        ) : (
          <AlertCircle className='h-4 w-4' />
        )}
        <AlertTitle>
          {denied ? 'Not permitted' : 'Could not load bill coverage'}
        </AlertTitle>
        <AlertDescription>
          {denied
            ? 'You do not have permission to view bill coverage. Ask an administrator for the billing.coverage.view permission.'
            : message}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className='space-y-4'>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Roll Number</TableHead>
              <TableHead>Learner</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className='text-right'>Bills</TableHead>
              <TableHead className='text-right'>Total Billed</TableHead>
              <TableHead>Coverage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className='h-24 text-center text-muted-foreground'
                >
                  No learners match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.learner_id}>
                  <TableCell className='font-medium'>
                    {r.roll_number ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/billing/schedule/students/${r.learner_id}`}
                      className='text-primary hover:underline'
                    >
                      {r.full_name || 'Unnamed'}
                    </Link>
                  </TableCell>
                  <TableCell>{r.institution_name ?? '—'}</TableCell>
                  <TableCell>{r.program_name ?? '—'}</TableCell>
                  <TableCell>{r.academic_year_name ?? '—'}</TableCell>
                  <TableCell className='capitalize'>
                    {r.lifecycle_status}
                  </TableCell>
                  <TableCell className='text-right'>{r.bill_count}</TableCell>
                  <TableCell className='text-right'>
                    {r.total_billed > 0 ? currency(r.total_billed) : '—'}
                  </TableCell>
                  <TableCell>{coverageBadge(r.coverage_state)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          Showing {nf.format(from)}–{nf.format(to)} of {nf.format(total)} learner
          {total === 1 ? '' : 's'}
        </p>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className='text-sm text-muted-foreground'>
            Page {nf.format(page)} of {nf.format(totalPages)}
          </span>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
