'use client';

// app/(routes)/events/[id]/page.tsx
// Detail page for a GENERAL event — the wizard-created rows (lecture, cultural,
// convocation, …) that have no dedicated console. Until this page existed there
// was no way to reach the registration form builder for such an event, and no
// way to read its registrations, even though both were already event-agnostic
// underneath.
//
// Tournaments redirect to their own console: one canonical page per event, so
// the two never drift.

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, MapPin, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { EVENT_STATUS_LABELS } from '@/types/events';
import { useGeneralEvent } from '@/hooks/events/use-general-events';
import { useEventAccess } from '@/hooks/events/use-event-access';
import { EventLogistics } from '@/components/events/shared/event-logistics';
import { RegistrationFormCard } from '@/components/events/shared/registration-form-card';

/** 'sports_day' → 'Sports Day'. Live event_type values are wider than the TS union. */
const formatEventType = (type: string) =>
  type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function GeneralEventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: event, isLoading } = useGeneralEvent(id);
  const access = useEventAccess(event);
  const canManage = access.canManage;

  const isTournament = event?.event_type === 'sports_tournament';

  // A tournament has a richer console; send it there rather than rendering a
  // second, poorer view of the same event.
  useEffect(() => {
    if (isTournament) router.replace(`/events/tournament/${id}`);
  }, [isTournament, id, router]);

  const copyLink = async () => {
    const url = `${window.location.origin}/events/${id}/register`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Registration link copied');
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers — show
      // the URL so the organizer can copy it by hand rather than fail silently.
      toast(url, { duration: 10000 });
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title="Event">
        <div className="mt-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!event) {
    return (
      <ContentLayout title="Event">
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            Event not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (isTournament) return null; // redirecting

  const dateLabel = formatDate(event.event_date ?? event.start_date);

  return (
    <ContentLayout title={event.name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: event.name },
        ]}
      />

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{event.name}</h1>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {formatEventType(event.event_type as string)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                {EVENT_STATUS_LABELS[event.status] ?? event.status}
              </Badge>
            </div>
            {(dateLabel || event.venue) && (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {dateLabel && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {dateLabel}
                  </span>
                )}
                {event.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {event.venue}
                  </span>
                )}
              </div>
            )}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
                <Link2 className="h-3.5 w-3.5" />
                Copy registration link
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/events/${id}/register`}>Preview form</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <div className="mt-4">
          <RegistrationFormCard
            eventId={id}
            canManage={canManage}
            href={`/events/${id}/registration-form`}
          />
          <EventLogistics
            eventId={id}
            eventType={String(event.event_type)}
            canManage={canManage}
          />
        </div>
      )}
    </ContentLayout>
  );
}
