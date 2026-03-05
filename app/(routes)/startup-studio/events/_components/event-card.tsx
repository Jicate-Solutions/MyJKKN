'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, ChevronDown, Users } from 'lucide-react';
import { EventStatusBadge } from './event-status-badge';
import type { StartupEvent, EventStatus } from '@/types/startup-studio';

const ACTIVE_STATUSES: EventStatus[] = ['registration_open', 'build_day', 'demo_day'];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function getParticipantCount(event: any): number {
  const registrations = event.registrations;
  if (!Array.isArray(registrations)) return 0;
  return registrations.reduce(
    (sum: number, reg: any) => sum + (reg.team_members?.length || 0),
    0
  );
}

export function EventCard({ event }: { event: StartupEvent }) {
  const participantCount = getParticipantCount(event);
  const isActive = ACTIVE_STATUSES.includes(event.status);

  return (
    <Link href={`/startup-studio/events/${event.id}`}>
      <Card className={`hover:shadow-md transition-shadow cursor-pointer border-t-4 ${isActive ? 'border-t-green-500' : 'border-t-muted-foreground/30'}`}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-base truncate">{event.name}</h3>
            <EventStatusBadge status={event.status} />
          </div>
          {event.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
          )}
          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDate(event.start_date)} - {formatDate(event.end_date)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {participantCount} users
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
