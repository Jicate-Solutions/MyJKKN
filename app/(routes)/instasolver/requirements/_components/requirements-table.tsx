'use client';

// The requirements list: a table from md upwards, cards below it.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RequirementStatusBadge } from '@/components/instasolver/badges';
import type { Requirement } from '@/types/instasolver';
import { formatDate, formatINR } from './format';

const href = (r: Requirement) => `/instasolver/requirements/${r.id}`;

export function RequirementsTable({ rows }: { rows: Requirement[] }) {
  const router = useRouter();

  return (
    <>
      {/* Tablet and desktop */}
      <div className="scrollbar-slim hidden overflow-x-auto rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Cost estimate</TableHead>
              <TableHead>Needed by</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(href(r))}>
                <TableCell className="whitespace-nowrap font-medium">
                  <Link href={href(r)} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.reference_no}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[240px]">
                  <p className="truncate font-medium" title={r.item_requested}>
                    {r.item_requested}
                  </p>
                  {r.category?.name && <p className="truncate text-xs text-muted-foreground">{r.category.name}</p>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.quantity_needed ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">{formatINR(r.cost_estimate)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(r.needed_by)}</TableCell>
                <TableCell className="max-w-[180px] truncate" title={r.institution?.name}>
                  {r.institution?.name ?? '—'}
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.requester?.full_name ?? '—'}</TableCell>
                <TableCell>
                  <RequirementStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile */}
      <div className="space-y-3 md:hidden">
        {rows.map((r) => (
          <Link key={r.id} href={href(r)} className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{r.reference_no}</p>
                    <p className="break-words font-medium">{r.item_requested}</p>
                  </div>
                  <RequirementStatusBadge status={r.status} />
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Quantity</dt>
                  <dd className="text-right tabular-nums">{r.quantity_needed ?? '—'}</dd>
                  <dt className="text-muted-foreground">Cost estimate</dt>
                  <dd className="text-right tabular-nums">{formatINR(r.cost_estimate)}</dd>
                  <dt className="text-muted-foreground">Needed by</dt>
                  <dd className="text-right">{formatDate(r.needed_by)}</dd>
                  <dt className="text-muted-foreground">Institution</dt>
                  <dd className="truncate text-right">{r.institution?.name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Requested by</dt>
                  <dd className="truncate text-right">{r.requester?.full_name ?? '—'}</dd>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="text-right">{formatDate(r.created_at)}</dd>
                </dl>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
