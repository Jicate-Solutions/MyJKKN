'use client';
// app/(routes)/admin/hostel/allocations/page.tsx
//
// Hostel rooms-v2 PR 4b (2026-05-26)
//
// Director-only admin page for active hostel allocations — the final
// piece of the 4-PR Option C sequence (substrate → service+RLS → API →
// rooms UI → THIS allocations UI).
//
// Lists active allocations (check_out_date IS NULL) with learner / block
// / room / bed / fee labels in a flat client-side table. "+ Allocate
// Resident" opens the allocation dialog; per-row "Check Out" opens the
// check-out dialog. No filters, no search, no pagination — explicitly
// out of scope (PR 4c+ if needed).

import { useMemo, useState } from 'react';
import { Home, LogOut, Plus } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useActiveAllocationsForAdmin } from '@/hooks/campus-living/use-hostel-allocations';

import { AllocateResidentDialog } from './_components/allocate-resident-dialog';
import { CheckOutDialog, type CheckOutDialogAllocation } from './_components/check-out-dialog';

export const navMeta = { label: 'Allocations', icon: 'Home' } as const;

function formatINR(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `₹${value.toLocaleString('en-IN')}`;
}

function feeStatusBadge(status: string | null | undefined) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const palette: Record<string, string> = {
    paid: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
    partial: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    pending: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
    overdue: 'bg-rose-100 text-rose-800 hover:bg-rose-100',
  };
  const cls = palette[status] ?? 'bg-slate-100 text-slate-800 hover:bg-slate-100';
  return <Badge className={cls}>{status}</Badge>;
}

export default function HostelAllocationsAdminPage() {
  const { data, isLoading, error } = useActiveAllocationsForAdmin();
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [checkOutFor, setCheckOutFor] = useState<CheckOutDialogAllocation | null>(null);

  const rows = useMemo(() => data ?? [], [data]);

  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout>
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators. The Allocations
            module governs which learners occupy which beds across the
            hostel network.
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout>
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Home className="h-6 w-6 text-emerald-600" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Hostel Allocations</h1>
              <p className="text-sm text-muted-foreground">
                Active residents with current room / bed assignment and fee snapshot.
              </p>
            </div>
          </div>
          <Button onClick={() => setAllocateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Allocate Resident
          </Button>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Active allocations</CardTitle>
            <CardDescription>
              {isLoading
                ? 'Loading allocations…'
                : `${rows.length} active allocation${rows.length === 1 ? '' : 's'}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load allocations: {(error as Error).message}
              </div>
            ) : isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm italic text-muted-foreground">
                No active allocations. Click + Allocate Resident to start.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Block</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Bed</TableHead>
                      <TableHead className="text-right">Monthly fee</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Fee status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.learner?.full_name ?? row.learner?.email ?? row.learner_id ?? '—'}
                        </TableCell>
                        <TableCell>{row.hostel_blocks?.name ?? '—'}</TableCell>
                        <TableCell>{row.hostel_rooms?.room_number ?? '—'}</TableCell>
                        <TableCell className="tabular-nums">
                          {row.hostel_beds?.bed_number ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatINR(row.monthly_fee_at_allocation_inr)}
                        </TableCell>
                        <TableCell className="tabular-nums">{row.check_in_date}</TableCell>
                        <TableCell>{feeStatusBadge(row.fee_status)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setCheckOutFor({
                                id: row.id,
                                learner_label:
                                  row.learner?.full_name ?? row.learner?.email ?? row.learner_id ?? 'Unknown',
                                block_label: row.hostel_blocks?.name ?? '—',
                                room_label: row.hostel_rooms?.room_number ?? '—',
                                bed_label: row.hostel_beds?.bed_number ?? '—',
                                check_in_date: row.check_in_date,
                              })
                            }
                          >
                            <LogOut className="mr-1 h-3 w-3" />
                            Check Out
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <AllocateResidentDialog open={allocateOpen} onOpenChange={setAllocateOpen} />

        <CheckOutDialog
          allocation={checkOutFor}
          open={Boolean(checkOutFor)}
          onOpenChange={(next) => {
            if (!next) setCheckOutFor(null);
          }}
        />
      </ContentLayout>
    </SuperAdminOnly>
  );
}
