'use client';

// ============================================================================
// Housekeeping — My Work (cleaning staff surface)
// ----------------------------------------------------------------------------
// The day's cleaning bookings assigned to the signed-in staff member. Reuses
// fn_housekeeping_booking_board (holders of campus_living.housekeeping.view —
// Housekeeping Staff have it) filtered client-side to own assignments, and
// fn_housekeeping_mark_booking for Complete / No-show ('.mark_done', which
// Housekeeping Staff also hold). Same access model as the sibling pages: no
// page-level PermissionGuard, RPC gates enforce server-side.
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Brush,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useBookingBoard,
  useMarkBooking,
} from '@/hooks/campus-living/use-housekeeping-bookings';

export const navMeta = {
  invokedFrom: '/campus-living/housekeeping',
} as const;

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toLocalDateString(new Date(y, m - 1, d + delta));
}

function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '—';
}

export default function HousekeepingMyWorkPage() {
  const { profile } = useAuth();
  const myProfileId = profile?.id || '';

  const [date, setDate] = useState<string>(() => toLocalDateString(new Date()));
  // No institution argument: the board returns every institution the user can
  // access and the rows are then narrowed to their OWN assignments. Pinning
  // this to profiles.institution_id hid work for staff whose profile carries a
  // different (or no) institution.
  const board = useBookingBoard(undefined, { date });
  const markMut = useMarkBooking();

  const myRows = useMemo(
    () =>
      (board.data ?? [])
        .filter((r) => r.assigned_profile_id === myProfileId)
        .sort((a, b) => a.slot_start.localeCompare(b.slot_start)),
    [board.data, myProfileId]
  );
  const openCount = myRows.filter((r) => r.status === 'assigned').length;
  const isToday = date === toLocalDateString(new Date());

  return (
    <ContentLayout title="My Cleaning Work">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'My Work' },
        ]}
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brush className="h-6 w-6 text-primary" />
            My Cleaning Work
          </h1>
          <p className="text-muted-foreground">
            Room-cleaning slots assigned to you — mark each one completed or
            no-show as you finish.
          </p>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous day"
                onClick={() => setDate((d) => addDays(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
                className="w-[160px]"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Next day"
                onClick={() => setDate((d) => addDays(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant={isToday ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setDate(toLocalDateString(new Date()))}
                disabled={isToday}
              >
                Today
              </Button>
              <span className="ml-auto text-sm text-muted-foreground">
                {openCount} open · {myRows.length} total
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {board.isLoading ? (
              <div className="space-y-2 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : board.error ? (
              <div className="p-6">
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Could not load your assignments</AlertTitle>
                  <AlertDescription>{(board.error as Error).message}</AlertDescription>
                </Alert>
              </div>
            ) : myRows.length === 0 ? (
              <div className="py-16 text-center">
                <Brush className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">Nothing assigned to you on {date}.</h3>
                <p className="text-sm text-muted-foreground">
                  Cleanings the warden assigns to you will appear here.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Slot</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Resident</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {fmtTime(row.slot_start)}–{fmtTime(row.slot_end)}
                      </TableCell>
                      <TableCell>{row.block_name ?? '—'}</TableCell>
                      <TableCell>{row.room_number ?? '—'}</TableCell>
                      <TableCell>
                        <span>{row.learner_name ?? '—'}</span>
                        {row.phone && (
                          <p className="text-xs text-muted-foreground">{row.phone}</p>
                        )}
                        {row.notes && (
                          <p className="text-xs text-muted-foreground max-w-[220px] truncate">
                            {row.notes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.status === 'completed'
                              ? 'border-green-400 text-green-700'
                              : row.status === 'no_show'
                                ? 'border-amber-400 text-amber-700'
                                : 'border-purple-400 text-purple-700'
                          }
                        >
                          {String(row.status).replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {row.status === 'assigned' ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-700 hover:text-green-800"
                              disabled={markMut.isPending}
                              onClick={() =>
                                markMut.mutate({ bookingId: row.id, status: 'completed' })
                              }
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Complete
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-amber-700 hover:text-amber-800"
                              disabled={markMut.isPending}
                              onClick={() =>
                                markMut.mutate({ bookingId: row.id, status: 'no_show' })
                              }
                            >
                              <UserX className="mr-1 h-3.5 w-3.5" />
                              No-show
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
