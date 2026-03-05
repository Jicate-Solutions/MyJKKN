'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin } from 'lucide-react';
import { EventStatusBadge } from './event-status-badge';
import type { StartupEvent } from '@/types/startup-studio';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function EventCard({ event }: { event: StartupEvent }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{event.name}</CardTitle>
          <EventStatusBadge status={event.status} />
        </div>
        {event.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(event.start_date)}</span>
          </div>
          {event.host_institution && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{event.host_institution.name}</span>
            </div>
          )}
        </div>
        {event.registration_deadline && (
          <p className="text-xs text-muted-foreground">
            Registration deadline: {formatDate(event.registration_deadline)}
          </p>
        )}
        <Link href={`/startup-studio/events/${event.id}`}>
          <Button variant="outline" size="sm" className="w-full mt-2">
            View Event
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
