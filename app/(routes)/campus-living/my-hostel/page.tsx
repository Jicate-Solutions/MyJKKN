'use client';

// My Hostel hub — tabbed layout for hostelers.
// Tabs are URL-driven (?tab=overview|category-fees|requests|profile) to avoid
// the eager-render gotcha (Radix TabsContent renders all children regardless
// of visibility). Each tab's body is only mounted when active.

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useIsHosteler } from '@/hooks/campus-living/use-is-hosteler';
import { useMyVacateRequests } from '@/hooks/campus-living/use-hostel-vacate';
import { OverviewTab } from './_components/overview-tab';
import { CategoryFeesTab } from './_components/category-fees-tab';
import {
  FileText,
  Loader2,
  LogOut,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Stethoscope,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Status helpers (used in the Requests tab)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function MyHostelPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, can, isLoading: permsLoading } = usePermissions();
  const profileId = profile?.id ?? '';

  const { data: isHosteler, isLoading: hostelerLoading } = useIsHosteler();
  const { data: myRequests, isLoading: reqLoading } = useMyVacateRequests(profileId);

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
            <div className='mt-4 space-y-6'>
              {reqLoading ? (
                <div className='flex items-center justify-center min-h-[200px]'>
                  <Loader2 className='h-6 w-6 animate-spin text-primary' />
                </div>
              ) : (
                <>
                  {/* Active vacate request */}
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
                          <Badge
                            variant={statusVariant[activeRequest.status] ?? 'outline'}
                          >
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
                          <Link
                            href={`/campus-living/vacate-requests/${activeRequest.id}`}
                          >
                            View details
                            <ArrowRight className='ml-2 h-4 w-4' />
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className='p-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between'>
                        <div className='space-y-1'>
                          <p className='font-medium'>Request Vacate</p>
                          <p className='text-sm text-muted-foreground max-w-xl'>
                            Start a vacate request. You&apos;ll go through parent consent
                            (learners), warden approval, chief warden approval, and dues
                            clearance before the room is released.
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
                  )}

                  {/* Request history */}
                  {pastRequests.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className='text-base'>Request History</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='space-y-2'>
                          {pastRequests.map((r) => (
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
                                <Link href={`/campus-living/vacate-requests/${r.id}`}>
                                  View
                                </Link>
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          )}

          {/* Profile — Phase 3 placeholder */}
          {tab === 'profile' && (
            <div className='mt-4'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Stethoscope className='h-5 w-5 text-primary' />
                    Emergency &amp; Medical Profile
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-sm text-muted-foreground'>
                    Emergency &amp; medical profile editing — coming soon.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </Tabs>
      </div>
    </ContentLayout>
  );
}
