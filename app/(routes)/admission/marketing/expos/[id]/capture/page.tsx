'use client';

import { useParams } from 'next/navigation';
import { useExpoEvent, useExpoTeamMembers } from '@/hooks/admission';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { RapidCaptureForm } from './_components/rapid-capture-form';
import { CaptureStatsBar } from './_components/capture-stats-bar';

function ExpoCaptureSkeleton() {
  return (
    <div className="w-full max-w-lg mx-auto space-y-4 mt-4">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function ExpoCaptureContent() {
  const params = useParams();
  const eventId = params.id as string;
  const { profile } = useAuth();

  const { event, isLoading: eventLoading } = useExpoEvent(eventId);
  const { teamMembers, isLoading: teamLoading } = useExpoTeamMembers(eventId);
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();

  const isLoading = eventLoading || teamLoading;
  const currentUserId = profile?.id;

  // Loading state
  if (isLoading) {
    return <ExpoCaptureSkeleton />;
  }

  // Event not found
  if (!event) {
    return (
      <Card className="mx-auto mt-8">
        <CardContent className="flex flex-col items-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Event Not Found</h2>
          <p className="text-sm text-muted-foreground text-center mb-4">
            This exhibition event does not exist or has been removed.
          </p>
          <Link href="/admission/marketing/expos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Events
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Event expired
  if (event.event_status === 'completed' || event.event_status === 'cancelled') {
    return (
      <Card className="mx-auto mt-8">
        <CardContent className="flex flex-col items-center py-8">
          <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
          <h2 className="text-lg font-semibold mb-2">Event Has Ended</h2>
          <p className="text-sm text-muted-foreground text-center mb-4">
            &quot;{event.event_name}&quot; is no longer active. Use the leads form for manual entry.
          </p>
          <Link href="/admission/marketing/expos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Events
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Check team membership
  const isTeamMember = teamMembers?.some(
    (m) => m.staff_id === currentUserId || m.student_id === currentUserId
  );
  const hasAccess = isTeamMember || isSuperAdmin || isAdmissionGlobalUser;

  if (!hasAccess) {
    return (
      <Card className="mx-auto mt-8">
        <CardContent className="flex flex-col items-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Not Assigned</h2>
          <p className="text-sm text-muted-foreground text-center mb-4">
            You are not assigned to this event&apos;s team. Contact your team leader for access.
          </p>
          <Link href="/admission/marketing/expos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Events
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative pb-20">
      {/* Event context banner */}
      <div className="mb-4 flex items-center gap-3">
        <Link href={`/admission/marketing/expos/${eventId}`}>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{event.event_name}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {event.city} {event.venue_name ? `\u2022 ${event.venue_name}` : ''}
          </p>
        </div>
      </div>

      {/* Capture form */}
      <RapidCaptureForm
        eventId={eventId}
        institutionId={event.institution_id}
        capturedBy={currentUserId || ''}
      />

      {/* Sticky stats bar at bottom */}
      <CaptureStatsBar
        eventId={eventId}
        currentUserId={currentUserId || ''}
      />
    </div>
  );
}

export default function ExpoCapturePage() {
  return (
    <PermissionGuard module="admission.marketing.expos" action="view">
      <ContentLayout title="Capture Leads">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Capture Leads</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <AdmissionErrorBoundary>
            <ExpoCaptureContent />
          </AdmissionErrorBoundary>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
