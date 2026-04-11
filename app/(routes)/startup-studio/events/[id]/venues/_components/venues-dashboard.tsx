'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertCircle,
  Building2,
  Users,
  Laptop,
  MapPin,
  Plus,
  Wand2,
  Loader2,
} from 'lucide-react';
import {
  useSSEvent,
  useEventVenues,
  useAutoAllocateTeams,
} from '@/hooks/startup-studio';
import { toast } from 'sonner';
import { VenueCard } from './venue-card';
import { AddVenueDialog } from './add-venue-dialog';

interface VenuesDashboardProps {
  eventId: string;
}

type DayTab = 'build_day' | 'demo_day';

function VenuesList({
  eventId,
  dayType,
}: {
  eventId: string;
  dayType: DayTab;
}) {
  const [addVenueOpen, setAddVenueOpen] = useState(false);
  const { data: eventRaw } = useSSEvent(eventId);
  const event = eventRaw as any;

  const {
    data: venuesRaw,
    isLoading,
    error,
  } = useEventVenues(eventId, dayType);

  const autoAllocate = useAutoAllocateTeams();

  const venues: any[] = Array.isArray(venuesRaw)
    ? venuesRaw
    : (venuesRaw as any)?.data ?? [];

  const handleAutoAllocate = async () => {
    try {
      const result = await autoAllocate.mutateAsync({ eventId, dayType });
      const res = result as any;
      toast.success(
        `Auto-allocated ${res?.allocated ?? 0} of ${res?.total ?? 0} teams`
      );
    } catch {
      toast.error('Auto-allocation failed. Please try again.');
    }
  };

  // Compute stats from venues
  const totalVenues = venues.length;
  const totalCapacity = venues.reduce(
    (sum: number, v: any) => sum + (v.capacity ?? 0),
    0
  );
  const totalTeamsAllocated = venues.reduce(
    (sum: number, v: any) => sum + (v.teams?.length ?? v.team_count ?? 0),
    0
  );
  const totalStaff = venues.reduce(
    (sum: number, v: any) => sum + (v.staff?.length ?? v.staff_count ?? 0),
    0
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load venues. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Venues</p>
                <p className="text-2xl font-bold">{totalVenues}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <MapPin className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Capacity</p>
                <p className="text-2xl font-bold">{totalCapacity}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2">
                <Laptop className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Teams Allocated</p>
                <p className="text-2xl font-bold">
                  <span
                    className={
                      totalTeamsAllocated === totalCapacity && totalCapacity > 0
                        ? 'text-green-600'
                        : totalTeamsAllocated > 0
                          ? 'text-amber-600'
                          : 'text-muted-foreground'
                    }
                  >
                    {totalTeamsAllocated}
                  </span>
                  {totalCapacity > 0 && (
                    <span className="text-base font-normal text-muted-foreground">
                      /{totalCapacity}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Staff Assigned</p>
                <p className="text-2xl font-bold">{totalStaff}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            {dayType === 'build_day' ? 'Build Day' : 'Demo Day'} Venues
          </h2>
          {event?.name && (
            <p className="text-sm text-muted-foreground">{event.name}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {venues.length > 0 && (
            <Button
              variant="outline"
              onClick={handleAutoAllocate}
              disabled={autoAllocate.isPending}
            >
              {autoAllocate.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Auto-Allocate Teams
            </Button>
          )}
          <Button onClick={() => setAddVenueOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Venue
          </Button>
        </div>
      </div>

      {/* Venue Grid */}
      {venues.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Venues Configured</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Add venues to start allocating teams and assigning staff.
            </p>
            <Button onClick={() => setAddVenueOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Venue
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue: any) => (
            <VenueCard
              key={venue.id}
              venue={venue}
              eventId={eventId}
              dayType={dayType}
            />
          ))}
        </div>
      )}

      <AddVenueDialog
        open={addVenueOpen}
        onOpenChange={setAddVenueOpen}
        eventId={eventId}
        dayType={dayType}
      />
    </div>
  );
}

export function VenuesDashboard({ eventId }: VenuesDashboardProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Venue Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage venues, allocate teams, and assign mentors/judges for Build Day and Demo Day.
        </p>
      </div>

      <Tabs defaultValue="build_day">
        <TabsList>
          <TabsTrigger value="build_day">Build Day (Sunday)</TabsTrigger>
          <TabsTrigger value="demo_day">Demo Day (Monday)</TabsTrigger>
        </TabsList>
        <TabsContent value="build_day" className="mt-6">
          <VenuesList eventId={eventId} dayType="build_day" />
        </TabsContent>
        <TabsContent value="demo_day" className="mt-6">
          <VenuesList eventId={eventId} dayType="demo_day" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
