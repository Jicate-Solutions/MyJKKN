'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyHostelSummary } from '@/hooks/campus-living/use-my-hostel';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import {
  BedDouble,
  Building2,
  Calendar,
  Home,
  UtensilsCrossed,
  Loader2,
  Info,
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

  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', profileId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(profileId, true),
    enabled: !!profileId,
  });

  const activeAllocation = (allocations ?? [])[0] as any;

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
          <CardDescription>Category and fee information from your profile.</CardDescription>
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
              label='Hostel Category'
              value={summary?.hostelCategory?.name ?? '—'}
              sub={summary?.hostelCategory?.type}
            />
            <InfoTile
              icon={<UtensilsCrossed className='h-4 w-4' />}
              label='Mess Category'
              value={summary?.messCategory?.name ?? '—'}
            />
            <InfoTile
              icon={<Info className='h-4 w-4' />}
              label='Hostel Fee'
              value={
                summary?.hostelFee != null
                  ? `₹${summary.hostelFee.toLocaleString()}`
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
              Current Room Allocation
            </CardTitle>
            <CardDescription>Where you are currently assigned.</CardDescription>
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
                value={`Bed ${getJoined(activeAllocation, 'hostel_beds', 'bed_number')}`}
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
                  activeAllocation.status === 'pending_vacate' ? 'secondary' : 'success'
                }
              >
                {activeAllocation.status === 'pending_vacate' ? 'Pending vacate' : 'Active'}
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
    </div>
  );
}
