'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvents } from '@/hooks/startup-studio/use-events';
import { EventCard } from './_components/event-card';
import { Loader2, Search } from 'lucide-react';
import type { EventStatus } from '@/types/startup-studio';

const ACTIVE_STATUSES: EventStatus[] = ['registration_open', 'build_day', 'demo_day'];

export default function StartupStudioEventsPage() {
  const { data: events, isLoading, error } = useEvents();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter((event) => {
      const matchesSearch = !search || event.name.toLowerCase().includes(search.toLowerCase());
      const isActive = ACTIVE_STATUSES.includes(event.status);
      const matchesFilter = filter === 'all' || (filter === 'active' ? isActive : !isActive);
      return matchesSearch && matchesFilter;
    });
  }, [events, search, filter]);

  return (
    <ContentLayout title="Startup Studio">
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'Startup Studio' },
        { label: 'Events' },
      ]} />

      <div className="space-y-4 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1">Events</h1>
          <p className="text-sm text-muted-foreground">
            Manage hackathons, sprints, and innovation events
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>

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

        {!isLoading && !error && filteredEvents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No events found.
          </div>
        )}

        {filteredEvents.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
