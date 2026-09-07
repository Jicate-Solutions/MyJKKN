'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Brush,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { BlockSelector } from '@/components/campus-living/block-selector';
import { useDayBoard } from '@/hooks/campus-living/use-housekeeping-bookings';
import { BookingCard } from './_components/booking-card';
import { AssignCleanerDialog } from './_components/assign-cleaner-dialog';
import { WaiveHoldDialog } from './_components/waive-hold-dialog';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';

const HK_KEYS = [
  'campus_living.housekeeping.view',
  'campus_living.housekeeping.assign',
  'campus_living.housekeeping.execute',
  'campus_living.housekeeping.waive',
];

/** Local YYYY-MM-DD, not toISOString() — that would shift the date in IST. */
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function HousekeepingDayBoardPage() {
  const [date, setDate] = useState(todayLocal);
  const [institutionId, setInstitutionId] = useState<string>('all');
  const [blockId, setBlockId] = useState<string>('all');
  const [assignTarget, setAssignTarget] = useState<BookingBoardRow | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<BookingBoardRow | null>(null);

  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions(HK_KEYS);
  // Default OPEN while loading: isSuperAdmin reads false mid-load, and gating on
  // it before permissions resolve would false-negative super admins out.
  const gate = (key: string) => permsLoading || isSuperAdmin || !!permissions[key];
  const canAssign = gate('campus_living.housekeeping.assign');
  const canExecute = gate('campus_living.housekeeping.execute');
  const canWaive = gate('campus_living.housekeeping.waive');

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // Pass the selection straight through — never branch on isSuperAdmin to decide
  // WHICH institution's rows to fetch; RLS already filters them.
  const scopedInstitution = institutionId === 'all' ? undefined : institutionId;
  const scopedBlock = blockId === 'all' ? undefined : blockId;

  const { data: bookings = [], isLoading, refetch } = useDayBoard(
    date,
    scopedInstitution,
    scopedBlock,
  );

  const isOverdue = date < todayLocal();

  const summary = useMemo(() => {
    const s = { unassigned: 0, inProgress: 0, awaiting: 0, completed: 0 };
    for (const b of bookings) {
      if (b.status === 'booked') s.unassigned += 1;
      else if (b.status === 'assigned' || b.status === 'in_progress') s.inProgress += 1;
      else if (b.status === 'awaiting_feedback') s.awaiting += 1;
      else if (b.status === 'completed') s.completed += 1;
    }
    return s;
  }, [bookings]);

  const byBlock = useMemo(() => {
    const groups = new Map<string, BookingBoardRow[]>();
    for (const b of bookings) {
      const key = b.block_name ?? 'Unknown block';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [bookings]);

  return (
    <ContentLayout title='Housekeeping'>
      <PageBreadcrumb
        items={[
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping' },
        ]}
      />

      <div className='space-y-4'>
        {/* Header + quick links */}
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Housekeeping</h1>
            <p className='text-sm text-muted-foreground'>
              Every cleaning booked for the day, and what still needs doing.
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/holds'>
                <ShieldAlert className='mr-1.5 h-4 w-4' /> Attendance holds
              </Link>
            </Button>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/types'>
                <Sparkles className='mr-1.5 h-4 w-4' /> Cleaning types
              </Link>
            </Button>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/cleaners'>
                <Brush className='mr-1.5 h-4 w-4' /> Cleaners
              </Link>
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='flex flex-wrap items-end gap-3 p-4'>
            <div className='flex items-center gap-1'>
              <Button
                variant='outline'
                size='icon'
                aria-label='Previous day'
                onClick={() => setDate((d) => shiftDate(d, -1))}
              >
                <ChevronLeft className='h-4 w-4' />
              </Button>
              <Input
                type='date'
                value={date}
                onChange={(e) => setDate(e.target.value || todayLocal())}
                className='w-[10.5rem]'
              />
              <Button
                variant='outline'
                size='icon'
                aria-label='Next day'
                onClick={() => setDate((d) => shiftDate(d, 1))}
              >
                <ChevronRight className='h-4 w-4' />
              </Button>
              <Button variant='ghost' size='sm' onClick={() => setDate(todayLocal())}>
                Today
              </Button>
            </div>

            <Select
              value={institutionId}
              onValueChange={(v) => {
                setInstitutionId(v);
                setBlockId('all');
              }}
              disabled={institutionsLoading}
            >
              <SelectTrigger className='w-[15rem]'>
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

            {institutionId !== 'all' && (
              <BlockSelector
                institutionId={institutionId}
                value={blockId}
                onValueChange={setBlockId}
                className='w-[15rem]'
              />
            )}
          </CardContent>
        </Card>

        {/* Summary — unassigned is the number that matters */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <SummaryTile
            label='Unassigned'
            value={summary.unassigned}
            tone={summary.unassigned > 0 && isOverdue ? 'destructive' : 'default'}
          />
          <SummaryTile label='In progress' value={summary.inProgress} />
          <SummaryTile label='Awaiting feedback' value={summary.awaiting} />
          <SummaryTile label='Completed' value={summary.completed} />
        </div>

        {/* Board */}
        {isLoading && (
          <p className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading the day…
          </p>
        )}

        {!isLoading && bookings.length === 0 && (
          <Card>
            <CardContent className='p-10 text-center text-sm text-muted-foreground'>
              No cleanings booked for this day.
            </CardContent>
          </Card>
        )}

        {byBlock.map(([blockName, rows]) => (
          <section key={blockName} className='space-y-3'>
            <h2 className='text-sm font-semibold text-muted-foreground'>{blockName}</h2>
            <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {rows.map((b) => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  canAssign={canAssign}
                  canExecute={canExecute}
                  canWaive={canWaive}
                  isOverdue={isOverdue}
                  onAssign={setAssignTarget}
                  onWaive={setWaiveTarget}
                  onUploaded={() => void refetch()}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Keyed on the booking id so opening a different booking MOUNTS a fresh
          dialog with clean local state, instead of an effect resetting it (which
          would cascade a render on every open). */}
      <AssignCleanerDialog
        key={`assign-${assignTarget?.id ?? 'none'}`}
        booking={assignTarget}
        open={assignTarget !== null}
        onOpenChange={(o) => !o && setAssignTarget(null)}
      />
      <WaiveHoldDialog
        key={`waive-${waiveTarget?.id ?? 'none'}`}
        booking={waiveTarget}
        open={waiveTarget !== null}
        onOpenChange={(o) => !o && setWaiveTarget(null)}
      />
    </ContentLayout>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Card className={tone === 'destructive' ? 'border-destructive' : undefined}>
      <CardContent className='p-4'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p
          className={`text-2xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
