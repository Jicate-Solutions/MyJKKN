'use client';

// Student my-hostel dashboard: shows active allocation + "Request Vacate" action
// + current request status tracker (if one is in flight).

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useMyVacateRequests } from '@/hooks/campus-living/use-hostel-vacate';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import {
  BedDouble,
  Building2,
  Calendar,
  FileText,
  Loader2,
  LogOut,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

const statusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  draft: 'outline',
  pending_parent: 'secondary',
  pending_warden: 'secondary',
  pending_chief: 'secondary',
  pending_dues: 'default',
  approved: 'default',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  pending_parent: 'Waiting for parent consent',
  pending_warden: 'With warden',
  pending_chief: 'With chief warden',
  pending_dues: 'Dues clearance',
  approved: 'Approved — awaiting finalize',
  completed: 'Vacated',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const getJoined = (row: any, relation: string, field: string): string =>
  row?.[relation]?.[field] ?? '';

export default function MyHostelPage() {
  const { profile, user } = useAuth();
  const userId = user?.id ?? '';

  const {
    data: allocations,
    isLoading: allocLoading,
  } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', userId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(userId, true),
    enabled: !!userId,
  });

  const { data: myRequests, isLoading: reqLoading } = useMyVacateRequests(userId);

  const activeAllocation = (allocations ?? [])[0] as any;
  const activeRequest = (myRequests ?? []).find(
    (r) => r.status !== 'completed' && r.status !== 'rejected' && r.status !== 'cancelled'
  );

  if (allocLoading || reqLoading) {
    return (
      <ContentLayout title='My Hostel'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='My Hostel'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'My Hostel' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>My Hostel</h1>
          <p className='text-sm text-muted-foreground'>
            Your current allocation and any active vacate requests.
          </p>
        </div>

        {/* Active allocation */}
        {activeAllocation ? (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <BedDouble className='h-5 w-5 text-primary' />
                Current Allocation
              </CardTitle>
              <CardDescription>Where you're currently assigned.</CardDescription>
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
                <Badge variant={activeAllocation.status === 'pending_vacate' ? 'secondary' : 'success'}>
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
            <CardContent className='p-8 text-center'>
              <AlertCircle className='h-10 w-10 mx-auto text-muted-foreground mb-2' />
              <p className='text-muted-foreground'>
                You don't have an active hostel allocation.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Vacate request card */}
        {activeRequest ? (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <FileText className='h-5 w-5 text-amber-600' />
                Your Vacate Request
              </CardTitle>
              <CardDescription>
                Submitted {new Date(activeRequest.created_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div className='flex items-center gap-2'>
                <Badge variant={statusVariant[activeRequest.status] ?? 'outline'}>
                  {statusLabel[activeRequest.status] ?? activeRequest.status}
                </Badge>
                <span className='text-xs text-muted-foreground capitalize'>
                  {activeRequest.reason_type.replace(/_/g, ' ')}
                </span>
              </div>
              <p className='text-sm text-muted-foreground'>
                Requested vacate date:{' '}
                <strong>{activeRequest.requested_vacate_date}</strong>
              </p>
              <Button asChild variant='outline' size='sm'>
                <Link href={`/campus-living/vacate-requests/${activeRequest.id}`}>
                  View details
                  <ArrowRight className='ml-2 h-4 w-4' />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          activeAllocation &&
          activeAllocation.status !== 'pending_vacate' && (
            <Card>
              <CardContent className='p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between'>
                <div className='space-y-1'>
                  <p className='font-medium'>Need to vacate?</p>
                  <p className='text-sm text-muted-foreground max-w-xl'>
                    Start a vacate request. You'll go through parent consent (learners), warden
                    approval, chief warden approval, and dues clearance before the room is
                    released.
                  </p>
                </div>
                <Button asChild>
                  <Link href='/campus-living/my-hostel/vacate-request'>
                    <LogOut className='mr-2 h-4 w-4' />
                    Request Vacate
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )
        )}

        {/* Past requests */}
        {(myRequests ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Request History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-2'>
                {(myRequests ?? [])
                  .filter((r) => r.id !== activeRequest?.id)
                  .map((r) => (
                    <div
                      key={r.id}
                      className='flex items-center justify-between gap-2 rounded-md border p-2'
                    >
                      <div className='flex items-center gap-3'>
                        {r.status === 'completed' ? (
                          <CheckCircle2 className='h-4 w-4 text-green-600' />
                        ) : (
                          <FileText className='h-4 w-4 text-muted-foreground' />
                        )}
                        <div className='flex flex-col'>
                          <span className='text-sm capitalize'>
                            {r.reason_type.replace(/_/g, ' ')}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {new Date(r.created_at).toLocaleDateString()} &middot;{' '}
                            {statusLabel[r.status] ?? r.status}
                          </span>
                        </div>
                      </div>
                      <Button asChild size='sm' variant='ghost'>
                        <Link href={`/campus-living/vacate-requests/${r.id}`}>View</Link>
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

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
