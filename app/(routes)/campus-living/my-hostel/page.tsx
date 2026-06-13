'use client';

// My Hostel hub — tabbed layout for hostelers.
// Tabs are URL-driven (?tab=overview|category-fees|requests|profile) to avoid
// the eager-render gotcha (Radix TabsContent renders all children regardless
// of visibility). Each tab's body is only mounted when active.

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsHosteler } from '@/hooks/campus-living/use-is-hosteler';
import { useMyVacateRequests } from '@/hooks/campus-living/use-hostel-vacate';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { OverviewTab } from './_components/overview-tab';
import { CategoryFeesTab } from './_components/category-fees-tab';
import { ProfileTab } from './_components/profile-tab';
import { RequestsTab } from './_components/requests-tab';
import {
  Loader2,
  AlertCircle,
  Brush,
  ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MyHostelPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const profileId = profile?.id ?? '';

  const { data: isHosteler, isLoading: hostelerLoading } = useIsHosteler();
  const { data: myRequests, isLoading: reqLoading } = useMyVacateRequests(profileId);

  // Same query key as OverviewTab — React Query dedupes the request.
  const { data: allocations } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', profileId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(profileId, true),
    enabled: !!profileId,
  });

  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') ?? 'overview';

  // ------------------------------------------------------------------
  // Access guard (identical logic to pre-refactor page)
  // ------------------------------------------------------------------
  const allowed = isSuperAdmin || (can('campus_living.my_hostel.view') && isHosteler);

  if (hostelerLoading || permsLoading) {
    return (
      <ContentLayout title='My Hostel'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (!allowed) {
    return (
      <ContentLayout title='My Hostel'>
        <Card>
          <CardContent className='p-8 text-center space-y-2'>
            <AlertCircle className='h-10 w-10 mx-auto text-muted-foreground' />
            <p className='text-muted-foreground'>
              My Hostel is available only to hostel residents.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  // ------------------------------------------------------------------
  // Requests tab helpers (derived from myRequests)
  // ------------------------------------------------------------------
  const activeRequest = (myRequests ?? []).find(
    (r) => r.status !== 'completed' && r.status !== 'rejected' && r.status !== 'cancelled'
  );
  const pastRequests = (myRequests ?? []).filter((r) => r.id !== activeRequest?.id);
  const activeAllocation = (allocations ?? [])[0] as any;
  const canRequestVacate =
    !activeRequest && activeAllocation && activeAllocation.status !== 'pending_vacate';

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
            Your hostel details, fees, and requests — all in one place.
          </p>
        </div>

        {/* Room Cleaning — housekeeping slot-booking entry (Agent C, 2026-06-10) */}
        <Link href='/campus-living/my-hostel/housekeeping' className='block'>
          <Card className='hover:bg-muted/50 transition-colors'>
            <CardContent className='p-4 flex items-center gap-3'>
              <Brush className='h-5 w-5 text-primary shrink-0' />
              <div className='min-w-0 flex-1'>
                <p className='font-medium'>Room Cleaning</p>
                <p className='text-sm text-muted-foreground'>
                  Book a 10-minute housekeeping slot for your room.
                </p>
              </div>
              <ChevronRight className='h-4 w-4 text-muted-foreground shrink-0' />
            </CardContent>
          </Card>
        </Link>

        {/* URL-driven tabs — only the active tab body is mounted */}
        <Tabs
          value={tab}
          onValueChange={(v) => router.replace(`/campus-living/my-hostel?tab=${v}`)}
        >
          <TabsList className='w-full sm:w-auto flex flex-wrap gap-1 h-auto'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='category-fees'>My Category &amp; Fees</TabsTrigger>
            <TabsTrigger value='requests'>Requests</TabsTrigger>
            <TabsTrigger value='profile'>Profile</TabsTrigger>
          </TabsList>

          {/* Overview */}
          {tab === 'overview' && (
            <div className='mt-4'>
              <OverviewTab />
            </div>
          )}

          {/* Category & Fees */}
          {tab === 'category-fees' && (
            <div className='mt-4'>
              <CategoryFeesTab />
            </div>
          )}

          {/* Requests */}
          {tab === 'requests' && (
            <div className='mt-4'>
              <RequestsTab
                profileId={profileId}
                reqLoading={reqLoading}
                activeRequest={activeRequest}
                pastRequests={pastRequests}
                canRequestVacate={canRequestVacate}
              />
            </div>
          )}

          {/* Profile — emergency contact + medical notes (resident edits own row) */}
          {tab === 'profile' && (
            <div className='mt-4'>
              <ProfileTab />
            </div>
          )}
        </Tabs>
      </div>
    </ContentLayout>
  );
}
