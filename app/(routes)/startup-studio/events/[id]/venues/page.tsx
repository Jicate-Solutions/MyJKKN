'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { useEvent } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { VenuesPanel } from './_components/venues-panel';
import { StaffVenueView } from './_components/staff-venue-view';

export default function VenuesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  // Guard against Next.js DRP placeholder tokens (%%drp:...) in route params
  const isValidId = !!id && !id.includes('%%drp:') && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isValidId) {
    return (
      <ContentLayout title="Venues & Mentors">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  const { data: event } = useEvent(id);
  const { profile, isLoading: authLoading } = useAuth();

  // Role detection — same logic as events/[id]/page.tsx and my-assignment page
  const isAdmin =
    profile?.is_super_admin === true ||
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    profile?.role === 'super_admin';

  // Faculty roles — can see ALL venues and mark attendance for any team
  const isFacultyRole =
    !isAdmin &&
    ['faculty', 'hod', 'principal', 'staff', 'lecturer'].includes(profile?.role ?? '');

  // Remaining non-admin, non-faculty with an email → assigned-staff-only view
  const isStaff = !isAdmin && !isFacultyRole && !!profile?.email;

  return (
    <ContentLayout title="Venues & Mentors">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Startup Studio', href: '/startup-studio/events' },
          { label: event?.name || 'Event', href: `/startup-studio/events/${id}` },
          { label: 'Venues & Mentors' },
        ]}
      />

      <div className="space-y-6 mt-4 pb-10">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => router.push(`/startup-studio/events/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" /> Back to Event
        </Button>

        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" />
            Venues & Mentors
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{event?.name || 'Event'}</p>
        </div>

        {authLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isAdmin ? (
          // Full admin view — all venues, add/edit/delete, stats, allocation
          <VenuesPanel eventId={id} />
        ) : isFacultyRole ? (
          // Faculty view — all venues (read-only) + attendance marking for any team
          <StaffVenueView eventId={id} staffEmail={profile!.email} showAll defaultDayType={event?.status === 'demo_day' ? 'demo_day' : 'build_day'} />
        ) : isStaff ? (
          // Assigned-staff view — only venues they are explicitly assigned to
          <StaffVenueView eventId={id} staffEmail={profile!.email} defaultDayType={event?.status === 'demo_day' ? 'demo_day' : 'build_day'} />
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">You don&apos;t have access to venue management.</p>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
