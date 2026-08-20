'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyHostelSummary, useMyRoommates } from '@/hooks/campus-living/use-my-hostel';
import { WinsFeedCard } from './wins-feed-card';
import { RoomSharingChoiceCard } from './room-sharing-choice-card';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import {
  BedDouble,
  Building2,
  Calendar,
  Home,
  UtensilsCrossed,
  Loader2,
  Users,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// InfoTile — small labelled tile used in this tab
// ---------------------------------------------------------------------------
function InfoTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className='p-3 bg-muted/50 rounded-lg'>
      <div className='flex items-center gap-1 text-xs text-muted-foreground'>
        {icon}
        {label}
      </div>
      <p className='font-medium mt-1'>{value || '—'}</p>
      {sub && <p className='text-xs text-muted-foreground capitalize'>{sub}</p>}
    </div>
  );
}

const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';

// ---------------------------------------------------------------------------
// OverviewTab
// ---------------------------------------------------------------------------
export function OverviewTab() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';

  const { data: summary, isLoading: summaryLoading } = useMyHostelSummary();

  // Display query includes a not-yet-approved (proposed) allocation so a freshly
  // allocated student sees "awaiting approval" instead of "no allocation yet".
  // Distinct query key ('…by-learner-display') from the plain active-only lookup
  // used elsewhere, so the wider status list here can't overwrite that cache.
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner-display', profileId],
    queryFn: () =>
      HostelAllocationService.getAllocationByLearner(profileId, true, [
        'active',
        'pending_approval',
        'pending_vacate',
      ]),
    enabled: !!profileId,
  });

  const activeAllocation = (allocations ?? [])[0] as any;
  const isPendingApproval = activeAllocation?.status === 'pending_approval';

  // Co-residents of the assigned room (own-room scoped RPC). Only meaningful once
  // the student has an allocation, so gate the query on it.
  const hasAllocation = !!activeAllocation;
  const { data: roommates, isLoading: roommatesLoading } = useMyRoommates(hasAllocation);

  if (summaryLoading || allocLoading) {
    return (
      <div className='flex items-center justify-center min-h-[200px]'>
        <Loader2 className='h-6 w-6 animate-spin text-primary' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Hostel summary from profile */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Home className='h-5 w-5 text-primary' />
            Your Hostel Details
          </CardTitle>
          <CardDescription>Accommodation and category information from your profile.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            <InfoTile
              icon={<Building2 className='h-4 w-4' />}
              label='Accommodation'
              value={summary?.accommodationType ?? '—'}
            />
            <InfoTile
              icon={<Building2 className='h-4 w-4' />}
              label='Room Category'
              value={summary?.hostelCategory?.name ?? '—'}
            />
            <InfoTile
              icon={<UtensilsCrossed className='h-4 w-4' />}
              label='Mess Category'
              value={summary?.messCategory?.name ?? '—'}
            />
            <InfoTile
              icon={<Users className='h-4 w-4' />}
              label='Hostel Type'
              value={
                summary?.hostelCategory?.type
                  ? summary.hostelCategory.type.charAt(0).toUpperCase() +
                    summary.hostelCategory.type.slice(1)
                  : '—'
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Room allocation */}
      {activeAllocation ? (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <BedDouble className='h-5 w-5 text-primary' />
              {isPendingApproval ? 'Proposed Room Allocation' : 'Current Room Allocation'}
            </CardTitle>
            <CardDescription>
              {isPendingApproval
                ? 'Proposed by auto-allocation — awaiting warden approval.'
                : 'Where you are currently assigned.'}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
              <InfoTile
                icon={<Building2 className='h-4 w-4' />}
                label='Block'
                value={getJoined(activeAllocation, 'hostel_blocks', 'name')}
                sub={getJoined(activeAllocation, 'hostel_blocks', 'code')}
              />
              <InfoTile
                icon={<Building2 className='h-4 w-4' />}
                label='Room'
                value={getJoined(activeAllocation, 'hostel_rooms', 'room_number')}
                sub={getJoined(activeAllocation, 'hostel_rooms', 'room_type')}
              />
              <InfoTile
                icon={<BedDouble className='h-4 w-4' />}
                label='Bed'
                value={
                  getJoined(activeAllocation, 'hostel_beds', 'bed_number')
                    ? `Bed ${getJoined(activeAllocation, 'hostel_beds', 'bed_number')}`
                    : ''
                }
                sub={getJoined(activeAllocation, 'hostel_beds', 'bed_type')}
              />
              <InfoTile
                icon={<Calendar className='h-4 w-4' />}
                label='Since'
                value={activeAllocation.allocation_date ?? '—'}
              />
            </div>

            <div className='flex items-center gap-2'>
              <Badge
                variant={
                  activeAllocation.status === 'active' ? 'success' : 'secondary'
                }
              >
                {activeAllocation.status === 'pending_approval'
                  ? 'Awaiting approval'
                  : activeAllocation.status === 'pending_vacate'
                    ? 'Pending vacate'
                    : 'Active'}
              </Badge>
              {activeAllocation.fee_status && (
                <Badge variant='outline'>Fee: {activeAllocation.fee_status}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='p-6 flex items-start gap-3'>
            <BedDouble className='h-5 w-5 text-muted-foreground mt-0.5 shrink-0' />
            <p className='text-sm text-muted-foreground'>
              You don&apos;t have a room allocation yet — your hostel details are shown above.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Any empty bed in a multi-bed room → she is carrying it. Names the
          cost, shows the deadline, and offers invite / buy-out / move.
          Self-gates away when the room is full.
          ACTIVE allocations only: this display query also returns
          pending_approval and pending_vacate rows, and neither should be told
          she is overpaying or nudged toward an irreversible charge — one is not
          hers yet, the other she is leaving. */}
      <RoomSharingChoiceCard
        roomId={activeAllocation?.status === 'active' ? activeAllocation.room_id ?? null : null}
        roomNumber={activeAllocation?.hostel_rooms?.room_number ?? null}
        messCategoryId={summary?.messCategory?.id ?? null}
        tierId={activeAllocation?.tier_id ?? null}
      />

      {/* Roommates — co-residents of the assigned room */}
      {hasAllocation && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Users className='h-5 w-5 text-primary' />
              Roommates
            </CardTitle>
            <CardDescription>
              Others sharing {activeAllocation.hostel_rooms?.room_number
                ? `Room ${activeAllocation.hostel_rooms.room_number}`
                : 'your room'}
              {isPendingApproval ? ' (proposed — pending approval)' : ''}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {roommatesLoading ? (
              <div className='flex items-center text-sm text-muted-foreground'>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Loading roommates…
              </div>
            ) : (roommates ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No roommates yet — you&apos;re currently the only resident in this room.
              </p>
            ) : (
              <div className='divide-y'>
                {(roommates ?? []).map((rm, i) => (
                  <div key={i} className='flex items-center justify-between gap-3 py-2'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{rm.full_name}</p>
                      <p className='truncate text-xs text-muted-foreground'>
                        {[rm.program_name, rm.semester_name].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <div className='flex shrink-0 items-center gap-2'>
                      {rm.bed_number && (
                        <Badge variant='outline' className='gap-1'>
                          <BedDouble className='h-3 w-3' /> Bed {rm.bed_number}
                        </Badge>
                      )}
                      {rm.status === 'pending_approval' && (
                        <Badge variant='secondary'>Pending</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Public recognition feed — renders only when wins exist (CARE keystone) */}
      <WinsFeedCard />
    </div>
  );
}
