'use client';

/**
 * LC-003: Event Coordination - Client-side event list with tabs
 */

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CalendarDays,
  MapPin,
  Users,
  Clock,
  Plus,
  Filter,
  CalendarCheck,
  History,
  Star,
} from 'lucide-react';
import type { LCEvent, EventStatus, EventScope } from '@/types/learners-council';

interface EventListClientProps {
  initialUpcoming: LCEvent[];
  upcomingCount: number;
  initialPast: LCEvent[];
  pastCount: number;
  initialMyEvents: LCEvent[];
  myCount: number;
  userId: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  pending_review: { label: 'Pending Review', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  published: { label: 'Published', variant: 'default' },
  in_progress: { label: 'In Progress', variant: 'default' },
  completed: { label: 'Completed', variant: 'secondary' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};

const scopeLabels: Record<string, string> = {
  campus: 'Campus',
  inter_campus: 'Inter-Campus',
  institution_wide: 'Institution-Wide',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function EventCard({ event }: { event: LCEvent }) {
  const statusCfg = statusConfig[event.status] || statusConfig.draft;
  const isUpcoming = new Date(event.starts_at) > new Date();
  const isPast = new Date(event.ends_at) < new Date();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{event.title}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              by {(event.proposer as any)?.full_name || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-3 flex-shrink-0">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            <Badge variant="outline" className="text-xs">
              {scopeLabels[event.scope] || event.scope}
            </Badge>
          </div>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {event.description}
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4 flex-shrink-0" />
            <span>{formatDate(event.starts_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>{formatTime(event.starts_at)} - {formatTime(event.ends_at)}</span>
          </div>
          {event.venue_name && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{event.venue_name}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>
              {event.current_participants}
              {event.max_participants ? ` / ${event.max_participants}` : ''} registered
            </span>
          </div>
        </div>

        {event.tags && event.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {event.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {event.requires_od && (
          <div className="mt-3 flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              OD Required
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventGrid({ events, emptyMessage }: { events: LCEvent[]; emptyMessage: string }) {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {events.map((event: any) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

export function EventListClient({
  initialUpcoming,
  upcomingCount,
  initialPast,
  pastCount,
  initialMyEvents,
  myCount,
  userId,
}: EventListClientProps) {
  const [scopeFilter, setScopeFilter] = useState<string>('all');

  const filterByScope = (events: LCEvent[]) => {
    if (scopeFilter === 'all') return events;
    return events.filter((e: any) => e.scope === scopeFilter);
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Events</h1>
          <p className="text-sm text-muted-foreground">
            Explore and participate in Learners Council events
          </p>
        </div>
        <Link href="/learners-council/events/proposals">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Propose Event
          </Button>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scopes</SelectItem>
            <SelectItem value="campus">Campus</SelectItem>
            <SelectItem value="inter_campus">Inter-Campus</SelectItem>
            <SelectItem value="institution_wide">Institution-Wide</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Upcoming
            <Badge variant="secondary" className="ml-1 text-xs">{upcomingCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="past" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Past
            <Badge variant="secondary" className="ml-1 text-xs">{pastCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="my" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            My Events
            <Badge variant="secondary" className="ml-1 text-xs">{myCount}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <EventGrid
            events={filterByScope(initialUpcoming as any)}
            emptyMessage="No upcoming events. Propose one to get started!"
          />
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          <EventGrid
            events={filterByScope(initialPast as any)}
            emptyMessage="No past events yet."
          />
        </TabsContent>

        <TabsContent value="my" className="mt-4">
          <EventGrid
            events={filterByScope(initialMyEvents as any)}
            emptyMessage="You haven't proposed any events yet."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
