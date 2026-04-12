'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Search,
  Plus,
  AlertCircle,
  ArrowRight,
  Palette,
} from 'lucide-react';
import { useSSEvents } from '@/hooks/startup-studio';

export function EventsList() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filters: Record<string, any> = {};
  if (activeFilter === 'active') filters.is_active = true;
  if (activeFilter === 'inactive') filters.is_active = false;

  const { data: eventsRaw, isLoading, error } = useSSEvents(filters);
  const events = eventsRaw as any;

  const eventsList = Array.isArray(events) ? events : events?.data ?? [];

  const filteredEvents = eventsList.filter((event: any) =>
    event.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load events. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter('all')}
          >
            All
          </Button>
          <Button
            variant={activeFilter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter('active')}
          >
            Active
          </Button>
          <Button
            variant={activeFilter === 'inactive' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveFilter('inactive')}
          >
            Inactive
          </Button>
        </div>
      </div>

      {/* Events Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-6 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No events found</p>
            <p className="text-sm text-muted-foreground mb-4">
              {search ? 'Try adjusting your search' : 'Create your first event to get started'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((event: any) => (
            <Link key={event.id} href={`/startup-studio/events/${event.id}`}>
              <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
                {event.banner_color && (
                  <div
                    className="h-2 rounded-t-lg"
                    style={{ backgroundColor: event.banner_color }}
                  />
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{event.name}</CardTitle>
                    <Badge variant={event.is_active ? 'default' : 'secondary'}>
                      {event.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {event.slug && (
                    <p className="text-xs text-muted-foreground font-mono">
                      /{event.slug}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {event.start_date
                        ? new Date(event.start_date).toLocaleDateString()
                        : 'No date'}
                      {event.end_date && (
                        <> &ndash; {new Date(event.end_date).toLocaleDateString()}</>
                      )}
                    </span>
                  </div>
                  {event.banner_color && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Palette className="h-3.5 w-3.5" />
                      <div
                        className="w-4 h-4 rounded border"
                        style={{ backgroundColor: event.banner_color }}
                      />
                      <span className="font-mono text-xs">{event.banner_color}</span>
                    </div>
                  )}
                  <div className="flex justify-end pt-2">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
