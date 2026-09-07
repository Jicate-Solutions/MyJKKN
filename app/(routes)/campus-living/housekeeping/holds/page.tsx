'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useFeedbackHolds } from '@/hooks/campus-living/use-housekeeping-holds';
import { formatHoldDate } from '@/lib/services/campus-living/housekeeping-rules';
import type { FeedbackHold } from '@/types/campus-living/housekeeping';

const HK_KEYS = ['campus_living.housekeeping.view'];

function daysOverdue(bookingDate: string): number {
  const then = new Date(`${bookingDate}T12:00:00Z`).getTime();
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

interface RoomHold {
  booking_id: string;
  room_id: string;
  booking_date: string;
  type_name: string;
  learners: number;
}

export default function HousekeepingHoldsPage() {
  const [institutionId, setInstitutionId] = useState<string>('all');

  const { isLoading: permsLoading } = usePermissions(HK_KEYS);
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const scopedInstitution = institutionId === 'all' ? undefined : institutionId;
  const { data: holds = [], isLoading } = useFeedbackHolds(scopedInstitution);

  // The RPC returns one row per LEARNER; a hold is a property of the room, so
  // collapse to one row per booking with a headcount.
  const rooms = useMemo<RoomHold[]>(() => {
    const byBooking = new Map<string, RoomHold>();
    for (const h of holds as FeedbackHold[]) {
      const existing = byBooking.get(h.booking_id);
      if (existing) existing.learners += 1;
      else
        byBooking.set(h.booking_id, {
          booking_id: h.booking_id,
          room_id: h.room_id,
          booking_date: h.booking_date,
          type_name: h.type_name,
          learners: 1,
        });
    }
    // Oldest first — those are the holds stranding real attendance records.
    return Array.from(byBooking.values()).sort((a, b) =>
      a.booking_date.localeCompare(b.booking_date),
    );
  }, [holds]);

  return (
    <ContentLayout title='Attendance holds'>
      <PageBreadcrumb
        items={[
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Attendance holds' },
        ]}
      />

      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Attendance holds</h1>
            <p className='max-w-3xl text-sm text-muted-foreground'>
              Rooms where a cleaning finished and nobody has rated it yet. Everyone in these
              rooms is blocked from attendance marking until any one of them rates, or a warden
              waives the hold from the day board.
            </p>
          </div>
          <Button asChild variant='outline' size='sm'>
            <Link href='/campus-living/housekeeping'>
              <ArrowLeft className='mr-1.5 h-4 w-4' /> Day board
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className='flex flex-wrap items-end gap-3 p-4'>
            <Select
              value={institutionId}
              onValueChange={setInstitutionId}
              disabled={institutionsLoading}
            >
              <SelectTrigger className='w-[16rem]'>
                <SelectValue placeholder='All institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All institutions</SelectItem>
                {institutions.map((inst: any) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {(isLoading || permsLoading) && (
          <p className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Checking for holds…
          </p>
        )}

        {!isLoading && rooms.length === 0 && (
          <Card>
            <CardContent className='flex flex-col items-center gap-2 p-10 text-center'>
              <ShieldCheck className='h-8 w-8 text-emerald-600' />
              <p className='text-sm text-muted-foreground'>
                No rooms are blocking attendance.
              </p>
            </CardContent>
          </Card>
        )}

        {rooms.length > 0 && (
          <Card>
            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cleaning</TableHead>
                      <TableHead>Finished</TableHead>
                      <TableHead>Days overdue</TableHead>
                      <TableHead>Learners affected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rooms.map((r) => {
                      const overdue = daysOverdue(r.booking_date);
                      return (
                        <TableRow key={r.booking_id}>
                          <TableCell className='font-medium'>{r.type_name}</TableCell>
                          <TableCell>{formatHoldDate(r.booking_date)}</TableCell>
                          <TableCell>
                            <Badge variant={overdue > 2 ? 'destructive' : 'secondary'}>
                              {overdue} {overdue === 1 ? 'day' : 'days'}
                            </Badge>
                          </TableCell>
                          <TableCell>{r.learners}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
