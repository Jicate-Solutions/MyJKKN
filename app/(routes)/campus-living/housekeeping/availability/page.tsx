'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { BlockSelector } from '@/components/campus-living/block-selector';
import {
  useBlockAvailability,
  useUpsertAvailability,
  useHousekeepingPolicies,
  useSaveHousekeepingPolicy,
} from '@/hooks/campus-living/use-housekeeping-availability';
import { HOUSEKEEPING_POLICY_KEYS } from '@/lib/services/campus-living/housekeeping-availability-service';
import type { CleaningAvailability } from '@/types/campus-living/housekeeping';

const HK_KEYS = ['campus_living.housekeeping.availability_manage'];

// Postgres DOW: 0 = Sunday .. 6 = Saturday. Index of this array IS the weekday
// value stored in hostel_cleaning_availability.weekday.
const DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function HousekeepingAvailabilityPage() {
  const [institutionId, setInstitutionId] = useState<string>('');
  const [blockId, setBlockId] = useState<string>('all');

  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions(HK_KEYS);
  // Default OPEN while loading — isSuperAdmin reads false mid-load.
  const canManage =
    permsLoading || isSuperAdmin || !!permissions['campus_living.housekeeping.availability_manage'];

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const scopedBlock = blockId === 'all' ? undefined : blockId;
  const { data: rows = [], isLoading } = useBlockAvailability(scopedBlock, institutionId);
  const upsert = useUpsertAvailability();

  return (
    <ContentLayout title='Booking availability'>
      <PageBreadcrumb
        items={[
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Availability' },
        ]}
      />

      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Booking availability</h1>
            <p className='max-w-3xl text-sm text-muted-foreground'>
              When each block accepts cleaning bookings, and how many can run at once.
            </p>
          </div>
          <Button asChild variant='outline' size='sm'>
            <Link href='/campus-living/housekeeping'>
              <ArrowLeft className='mr-1.5 h-4 w-4' /> Day board
            </Link>
          </Button>
        </div>

        {/* This relationship is not obvious, and getting it wrong produces an
            empty slot list the warden cannot explain. */}
        <Card className='bg-muted/40'>
          <CardContent className='p-4 text-sm text-muted-foreground'>
            Slots are generated from this window at the length of whichever cleaning type the
            learner picks. A 09:00–17:00 window offers sixteen 30-minute slots, or five
            90-minute slots. <strong>Capacity</strong> is how many cleanings can run{' '}
            <strong>at the same time</strong> in this block.
          </CardContent>
        </Card>

        <Card>
          <CardContent className='flex flex-wrap items-end gap-3 p-4'>
            <Select
              value={institutionId}
              onValueChange={(v) => {
                setInstitutionId(v);
                setBlockId('all');
              }}
              disabled={institutionsLoading}
            >
              <SelectTrigger className='w-[16rem]'>
                <SelectValue placeholder='Choose an institution' />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst: any) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {institutionId && (
              <BlockSelector
                institutionId={institutionId}
                value={blockId}
                onValueChange={setBlockId}
                includeAll={false}
                className='w-[16rem]'
              />
            )}
          </CardContent>
        </Card>

        {!institutionId && (
          <Card>
            <CardContent className='p-8 text-center text-sm text-muted-foreground'>
              Choose an institution and a block to set its cleaning window.
            </CardContent>
          </Card>
        )}

        {institutionId && blockId === 'all' && (
          <Card>
            <CardContent className='p-8 text-center text-sm text-muted-foreground'>
              Choose a block — availability is set per block.
            </CardContent>
          </Card>
        )}

        {isLoading && scopedBlock && (
          <p className='flex items-center gap-2 py-6 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading the week…
          </p>
        )}

        {!isLoading && scopedBlock && rows.length > 0 && (
          <Card>
            <CardContent className='space-y-3 p-4'>
              {rows.map((row) => (
                <WeekdayRow
                  key={row.weekday}
                  row={row}
                  institutionId={institutionId}
                  blockId={scopedBlock}
                  disabled={!canManage || upsert.isPending}
                  onSave={(dto) => upsert.mutate(dto)}
                />
              ))}
            </CardContent>
          </Card>
        )}

        <PolicyKnobs canManage={canManage} />
      </div>
    </ContentLayout>
  );
}

function WeekdayRow({
  row,
  institutionId,
  blockId,
  disabled,
  onSave,
}: {
  row: CleaningAvailability;
  institutionId: string;
  blockId: string;
  disabled: boolean;
  onSave: (dto: {
    institution_id: string;
    block_id: string;
    weekday: number;
    is_open: boolean;
    window_start: string;
    window_end: string;
    capacity: number;
  }) => void;
}) {
  const [isOpen, setIsOpen] = useState(row.is_open);
  const [start, setStart] = useState(row.window_start?.slice(0, 5) ?? '09:00');
  const [end, setEnd] = useState(row.window_end?.slice(0, 5) ?? '17:00');
  const [capacity, setCapacity] = useState(row.capacity);

  // Re-sync when the block changes under us.
  useEffect(() => {
    setIsOpen(row.is_open);
    setStart(row.window_start?.slice(0, 5) ?? '09:00');
    setEnd(row.window_end?.slice(0, 5) ?? '17:00');
    setCapacity(row.capacity);
  }, [row.block_id, row.weekday, row.is_open, row.window_start, row.window_end, row.capacity]);

  const invalidWindow = end <= start;

  return (
    <div className='flex flex-wrap items-center gap-3 rounded-md border p-3'>
      <span className='w-24 text-sm font-medium'>{DOW_LABEL[row.weekday]}</span>

      <div className='flex items-center gap-2'>
        <Switch checked={isOpen} onCheckedChange={setIsOpen} disabled={disabled} />
        <span className='text-sm text-muted-foreground'>{isOpen ? 'Open' : 'Closed'}</span>
      </div>

      <div className='flex items-center gap-1.5'>
        <Input
          type='time'
          value={start}
          onChange={(e) => setStart(e.target.value)}
          disabled={disabled || !isOpen}
          className='w-[7.5rem]'
        />
        <span className='text-muted-foreground'>–</span>
        <Input
          type='time'
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          disabled={disabled || !isOpen}
          className='w-[7.5rem]'
        />
      </div>

      <div className='flex items-center gap-2'>
        <Label className='text-sm text-muted-foreground'>Capacity</Label>
        <Input
          type='number'
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
          disabled={disabled || !isOpen}
          className='w-20'
        />
      </div>

      {invalidWindow && isOpen && (
        <span className='text-xs text-destructive'>End must be after start.</span>
      )}

      <Button
        size='sm'
        variant='outline'
        className='ml-auto'
        disabled={disabled || (isOpen && invalidWindow)}
        onClick={() =>
          onSave({
            institution_id: institutionId,
            block_id: blockId,
            weekday: row.weekday,
            is_open: isOpen,
            window_start: start,
            window_end: end,
            capacity,
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

/**
 * The two platform_policies rows that survived the rebuild. Everything else the
 * old settings page held is now table configuration, which is why that page
 * stays deleted.
 */
function PolicyKnobs({ canManage }: { canManage: boolean }) {
  const { data: policies, isLoading } = useHousekeepingPolicies();
  const save = useSaveHousekeepingPolicy();

  const enabled = (policies?.[HOUSEKEEPING_POLICY_KEYS.BOOKING_ENABLED] as boolean) ?? true;
  const advanceDays = (policies?.[HOUSEKEEPING_POLICY_KEYS.BOOKING_ADVANCE_DAYS] as number) ?? 7;
  const [draftDays, setDraftDays] = useState<number | null>(null);
  const days = draftDays ?? advanceDays;

  return (
    <Card>
      <CardContent className='space-y-4 p-4'>
        <h2 className='text-sm font-semibold'>Booking settings</h2>

        {isLoading && (
          <p className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading…
          </p>
        )}

        {!isLoading && (
          <>
            <div className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>Booking enabled</p>
                <p className='text-sm text-muted-foreground'>
                  {enabled
                    ? 'Learners can book cleanings.'
                    : 'Learners cannot book any cleaning. Existing bookings are unaffected.'}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={!canManage || save.isPending}
                onCheckedChange={(v) =>
                  save.mutate({ policyKey: HOUSEKEEPING_POLICY_KEYS.BOOKING_ENABLED, value: v })
                }
              />
            </div>

            <div className='flex flex-wrap items-center justify-between gap-3 rounded-md border p-3'>
              <div>
                <p className='text-sm font-medium'>Advance booking window</p>
                <p className='text-sm text-muted-foreground'>
                  Learners can book up to {days} {days === 1 ? 'day' : 'days'} ahead.
                </p>
              </div>
              <div className='flex items-center gap-2'>
                <Input
                  type='number'
                  min={0}
                  max={60}
                  value={days}
                  disabled={!canManage}
                  onChange={(e) => setDraftDays(Math.max(0, Number(e.target.value) || 0))}
                  className='w-20'
                />
                <Button
                  size='sm'
                  variant='outline'
                  disabled={!canManage || save.isPending || draftDays === null || draftDays === advanceDays}
                  onClick={() =>
                    save.mutate(
                      {
                        policyKey: HOUSEKEEPING_POLICY_KEYS.BOOKING_ADVANCE_DAYS,
                        value: days,
                      },
                      { onSuccess: () => setDraftDays(null) },
                    )
                  }
                >
                  Save
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
