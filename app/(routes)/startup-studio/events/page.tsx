'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useEvents } from '@/hooks/startup-studio/use-events';
import { EventCard } from './_components/event-card';
import { Loader2 } from 'lucide-react';

export default function StartupStudioEventsPage() {
  const { data: events, isLoading, error } = useEvents();

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio' },
        { label: 'Events' },
      ]} />

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Events</h1>
          <p className="text-sm text-muted-foreground">
            Hackathons, competitions, and buildathons across JKKN colleges
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load events. Please try again.
          </div>
        )}

        {events && events.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No events found.
          </div>
        )}

        {events && events.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
