'use client';

import { useParams } from 'next/navigation';
import { useExpoEvent, useExpoTeamMembers } from '@/hooks/admission';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { RapidCaptureForm } from './_components/rapid-capture-form';
import { CaptureStatsBar } from './_components/capture-stats-bar';

export default function ExpoCapturePage() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();

  const { event, isLoading: eventLoading } = useExpoEvent(eventId);
  const { teamMembers, isLoading: teamLoading } = useExpoTeamMembers(eventId);
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();

  const isLoading = eventLoading || teamLoading;

  // Check if the current user is a team member for this event
  const currentUserId = profile?.id;
  const isTeamMember = teamMembers?.some(
    (m) => m.staff_id === currentUserId || m.student_id === currentUserId
  );
  const hasAccess = isTeamMember || isSuperAdmin || isAdmissionGlobalUser;

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-4 w-64 mb-8" />
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }

  // Event not found
  if (!event) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-semibold mb-2">Event Not Found</h1>
        <p className="text-muted-foreground text-center mb-6">
          This exhibition event does not exist or has been removed.
        </p>
        <Link href="/admission/marketing/expos">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Events</Button>
        </Link>
      </div>
    );
  }

  // Event expired
  if (event.event_status === 'completed' || event.event_status === 'cancelled') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Event Has Ended</h1>
        <p className="text-muted-foreground text-center mb-6">
          &quot;{event.event_name}&quot; is no longer active. Use the leads form for manual entry.
        </p>
        <Link href="/admission/marketing/expos">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Events</Button>
        </Link>
      </div>
    );
  }

  // Not authorized
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-semibold mb-2">Not Assigned</h1>
        <p className="text-muted-foreground text-center mb-6">
          You are not assigned to this event&apos;s team. Contact your team leader for access.
        </p>
        <Link href="/admission/marketing/expos">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Events</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header — event context */}
      <div className="border-b bg-card px-4 py-3 flex items-center gap-3">
        <Link href={`/admission/marketing/expos/${eventId}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold truncate">{event.event_name}</h1>
          <p className="text-xs text-muted-foreground truncate">
            {event.city} {event.venue_name ? `\u2022 ${event.venue_name}` : ''}
          </p>
        </div>
      </div>

      {/* Main capture form area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        <RapidCaptureForm
          eventId={eventId}
          institutionId={event.institution_id}
          capturedBy={currentUserId || ''}
        />
      </div>

      {/* Sticky stats bar at bottom */}
      <CaptureStatsBar
        eventId={eventId}
        currentUserId={currentUserId || ''}
      />
    </div>
  );
}
