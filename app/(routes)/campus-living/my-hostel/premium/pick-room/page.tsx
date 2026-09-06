// ============================================================================
// PREMIUM ROOM — PICK ROOM (learner-facing, Phase 2)
// ============================================================================
// Created: 2026-05-19
//
// Learner selects:
//   1. A room (grouped by block + floor) — filterable by AC / attached
//      bathroom / capacity
//   2. A specific bed within that room
//   3. Confirms emergency contact details (form)
//   4. Submits → fn_premium_reserve_bed RPC
//   5. On success → routes to ../invite-roommate?allocation=<id>
//
// Concurrency: RPC returns bed_locked_by_other if another learner reserves
// the same bed under load. We surface a toast and re-fetch availability.
// ============================================================================

'use client';

export const navMeta = {
  label: 'Premium Room — Pick Room',
  icon: 'BedDouble',
  invokedFrom: '/campus-living/my-hostel/premium',
} as const;

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useHostelTier } from '@/hooks/campus-living/use-hostel-tier-policy';
import {
  usePremiumAvailableRooms,
  useReservePremiumBed,
} from '@/hooks/campus-living/use-premium-allocation';
import { useAcademicYears } from '@/hooks/use-academic-years';
import { useMyHostelSummary } from '@/hooks/campus-living/use-my-hostel';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { RoomBedPicker } from '../_components/room-bed-picker';
import { SoleOccupancyNotice } from '../_components/sole-occupancy-notice';
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  Sparkles,
  BedDouble,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

interface BedRow {
  id: string;
  room_id: string;
  bed_number: string;
  bed_type: string;
  status: string;
  current_occupant_id: string | null;
}

export default function PickRoomPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tierId = searchParams.get('tier') ?? '';
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const institutionId = profile?.institution_id ?? null;

  const { data: tier, isLoading: tierLoading } = useHostelTier(tierId);
  const { data: rooms, isLoading: roomsLoading, refetch: refetchRooms } =
    usePremiumAvailableRooms(institutionId);
  const { data: academicYears } = useAcademicYears(institutionId ?? undefined);
  // Her mess category, so the sole-occupancy quote matches what she'd be billed.
  const { data: hostelSummary } = useMyHostelSummary();

  // Pull beds for selected room (lazy)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  // Ticked only when the chosen room would leave her its only occupant.
  const [soleOccupancyAck, setSoleOccupancyAck] = useState(false);

  // Filters
  const [filterAC, setFilterAC] = useState<string>('all');
  const [filterBathroom, setFilterBathroom] = useState<string>('all');

  // Emergency contact
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');

  const reserveMutation = useReservePremiumBed();

  // Lazy bed fetch
  const { data: beds, isLoading: bedsLoading } = useQuery<BedRow[]>({
    queryKey: ['hostel-beds', 'by-room', selectedRoomId],
    queryFn: async () => {
      if (!selectedRoomId) return [];
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_beds')
        .select('id, room_id, bed_number, bed_type, status, current_occupant_id')
        .eq('room_id', selectedRoomId)
        .order('bed_number');
      if (error) throw error;
      return (data ?? []) as BedRow[];
    },
    enabled: !!selectedRoomId,
  });

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    if (!rooms) return [];
    return rooms.filter((r) => {
      if (filterAC === 'ac_only' && r.ac_status !== 'AC') return false;
      if (filterAC === 'non_ac_only' && r.ac_status === 'AC') return false;
      if (filterBathroom === 'attached_only' && r.has_attached_bathroom !== true) return false;
      if (filterBathroom === 'shared_only' && r.has_attached_bathroom === true) return false;
      return true;
    });
  }, [rooms, filterAC, filterBathroom]);

  // Group by block + floor for the picker
  const roomsByBlock = useMemo(() => {
    const map = new Map<string, typeof filteredRooms>();
    for (const r of filteredRooms) {
      const key = `${r.block_name ?? 'Block'} (block:${r.block_id})`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [filteredRooms]);

  const selectedRoom = filteredRooms.find((r) => r.room_id === selectedRoomId) ?? null;
  const activeAY = academicYears?.data?.[0];

  // A multi-bed room with nobody in it leaves her paying for every empty bed.
  // She has to be told, and tick, before the reserve button opens.
  const wouldBeSoleOccupant =
    !!selectedRoom && selectedRoom.capacity > 1 && selectedRoom.current_occupancy === 0;

  const canSubmit =
    !!selectedRoomId &&
    !!selectedBedId &&
    !!tierId &&
    !!userId &&
    !!institutionId &&
    !!activeAY?.id &&
    (!wouldBeSoleOccupant || soleOccupancyAck) &&
    emergencyName.trim().length >= 2 &&
    emergencyPhone.trim().length >= 7 &&
    emergencyRelation.trim().length >= 2;

  async function handleReserve() {
    if (!canSubmit || !selectedRoom || !selectedBedId) return;
    const result = await reserveMutation.mutateAsync({
      learnerId: userId,
      bedId: selectedBedId,
      tierId,
      roomId: selectedRoom.room_id,
      blockId: selectedRoom.block_id,
      institutionId: institutionId!,
      academicYearId: activeAY!.id as string,
      emergencyContactName: emergencyName.trim(),
      emergencyContactPhone: emergencyPhone.trim(),
      emergencyContactRelation: emergencyRelation.trim(),
    });
    if (result.success && result.allocationId) {
      router.push(
        `/campus-living/my-hostel/premium/invite-roommate?allocation=${result.allocationId}`,
      );
    } else if (result.reason === 'bed_locked_by_other' || result.reason === 'bed_unavailable') {
      // Refresh availability so the picker reflects the conflict.
      refetchRooms();
      setSelectedBedId(null);
    }
  }

  if (!tierId) {
    return (
      <ContentLayout title='Premium Room — Pick Room'>
        <Card className='mt-6'>
          <CardContent className='p-8 text-center space-y-3'>
            <AlertCircle className='h-10 w-10 mx-auto text-amber-500' />
            <p>No tier selected. Choose a premium tier first.</p>
            <Button asChild variant='outline'>
              <Link href='/campus-living/my-hostel/premium'>
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back to tier selection
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (tierLoading || roomsLoading) {
    return (
      <ContentLayout title='Premium Room — Pick Room'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Premium Room — Pick Room'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel', href: '/campus-living/my-hostel' },
          { label: 'Premium Room', href: '/campus-living/my-hostel/premium' },
          { label: 'Pick Room' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex items-start gap-3'>
          <Sparkles className='h-7 w-7 text-amber-500 mt-1' />
          <div>
            <h1 className='text-2xl font-bold py-1'>
              Pick Room & Bed — {tier?.tier_display_name ?? 'Premium'}
            </h1>
            <p className='text-sm text-muted-foreground'>
              Choose a block, room, and bed. Reservation is atomic: first
              learner to click "Reserve" wins the bed.
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Filter rooms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
              <div>
                <Label className='text-xs'>AC</Label>
                <Select value={filterAC} onValueChange={setFilterAC}>
                  <SelectTrigger>
                    <SelectValue placeholder='All' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All</SelectItem>
                    <SelectItem value='ac_only'>AC only</SelectItem>
                    <SelectItem value='non_ac_only'>Non-AC only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className='text-xs'>Bathroom</Label>
                <Select value={filterBathroom} onValueChange={setFilterBathroom}>
                  <SelectTrigger>
                    <SelectValue placeholder='All' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All</SelectItem>
                    <SelectItem value='attached_only'>Attached only</SelectItem>
                    <SelectItem value='shared_only'>Shared only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='flex items-end'>
                <Badge variant='outline' className='text-xs'>
                  {filteredRooms.length} room{filteredRooms.length === 1 ? '' : 's'} available
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Room/bed picker */}
        <RoomBedPicker
          roomsByBlock={roomsByBlock}
          selectedRoomId={selectedRoomId}
          selectedBedId={selectedBedId}
          beds={beds ?? []}
          bedsLoading={bedsLoading}
          onSelectRoom={(roomId) => {
            setSelectedRoomId(roomId);
            setSelectedBedId(null);
            // A tick belongs to one room only — a new room needs a new one.
            setSoleOccupancyAck(false);
          }}
          onSelectBed={setSelectedBedId}
        />

        {/* Sole-occupancy warning — what she'd owe alone vs. with the room full,
            and a way to invite people in first. Renders itself away unless the
            chosen room is multi-bed and empty. */}
        {selectedRoom && (
          <SoleOccupancyNotice
            roomId={selectedRoom.room_id}
            roomNumber={selectedRoom.room_number}
            roomCategoryId={selectedRoom.category_id}
            capacity={selectedRoom.capacity}
            currentOccupancy={selectedRoom.current_occupancy}
            messCategoryId={hostelSummary?.messCategory?.id ?? null}
            acknowledged={soleOccupancyAck}
            onAcknowledgedChange={setSoleOccupancyAck}
          />
        )}

        {/* Emergency contact form (shown when bed selected) */}
        {selectedBedId && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base flex items-center gap-2'>
                <ShieldCheck className='h-4 w-4 text-primary' />
                Emergency contact
              </CardTitle>
              <CardDescription>
                Required for any hostel allocation.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='grid grid-cols-1 sm:grid-cols-3 gap-3'>
                <div>
                  <Label htmlFor='emergencyName'>Name</Label>
                  <Input
                    id='emergencyName'
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder='Parent / Guardian'
                  />
                </div>
                <div>
                  <Label htmlFor='emergencyPhone'>Phone</Label>
                  <Input
                    id='emergencyPhone'
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder='+91 …'
                  />
                </div>
                <div>
                  <Label htmlFor='emergencyRelation'>Relation</Label>
                  <Input
                    id='emergencyRelation'
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    placeholder='Father / Mother / …'
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <Card>
          <CardContent className='p-4 flex items-center justify-between flex-wrap gap-3'>
            <div className='text-sm text-muted-foreground'>
              {selectedRoom && selectedBedId ? (
                <span>
                  Reserving <strong>Bed {beds?.find((b) => b.id === selectedBedId)?.bed_number}</strong>{' '}
                  in <strong>{selectedRoom.block_name}</strong>, Room{' '}
                  <strong>{selectedRoom.room_number}</strong>
                  {wouldBeSoleOccupant && !soleOccupancyAck && (
                    <span className='mt-1 block text-amber-700 dark:text-amber-400'>
                      Tick the box above to confirm you understand the cost of
                      living in this room on your own.
                    </span>
                  )}
                </span>
              ) : (
                <span className='flex items-center gap-2'>
                  <BedDouble className='h-4 w-4' />
                  Pick a room, then a bed
                </span>
              )}
            </div>
            <Button
              size='lg'
              disabled={!canSubmit || reserveMutation.isPending}
              onClick={handleReserve}
            >
              {reserveMutation.isPending ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Reserving…
                </>
              ) : (
                'Reserve bed'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
