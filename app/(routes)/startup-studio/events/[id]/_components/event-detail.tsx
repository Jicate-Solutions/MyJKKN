'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Pencil,
  Save,
  X,
  AlertCircle,
  ArrowLeft,
  Settings,
  Palette,
  Users,
  ClipboardList,
  ListChecks,
  Presentation,
  Send,
  Clock,
  MapPin,
} from 'lucide-react';
import { useSSEvent, useUpdateEvent } from '@/hooks/startup-studio';

interface EventDetailProps {
  id: string;
}

export function EventDetail({ id }: EventDetailProps) {
  const { data: eventRaw, isLoading, error } = useSSEvent(id);
  const updateEvent = useUpdateEvent();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});

  const event = eventRaw as any;

  const startEditing = () => {
    setFormData({
      name: event?.name ?? '',
      slug: event?.slug ?? '',
      description: event?.description ?? '',
      start_date: event?.start_date ? event.start_date.slice(0, 10) : '',
      end_date: event?.end_date ? event.end_date.slice(0, 10) : '',
      is_active: event?.is_active ?? false,
      banner_color: event?.banner_color ?? '',
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    await updateEvent.mutateAsync({ id, data: formData });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({});
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load event details. Please try again.
          </AlertDescription>
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/events">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Link>
        </Button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Event not found.</p>
        <Button variant="outline" asChild>
          <Link href="/startup-studio/events">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Events
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold py-1">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            Event details and configuration
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/startup-studio/events">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          {!isEditing ? (
            <Button onClick={startEditing}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={updateEvent.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={updateEvent.isPending}
              >
                <Save className="mr-2 h-4 w-4" />
                {updateEvent.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Event Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Event Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Banner Color</label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={formData.banner_color || '#000000'}
                    onChange={(e) =>
                      setFormData({ ...formData, banner_color: e.target.value })
                    }
                    className="w-12 h-9 p-1"
                  />
                  <Input
                    value={formData.banner_color}
                    onChange={(e) =>
                      setFormData({ ...formData, banner_color: e.target.value })
                    }
                    placeholder="#hex"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) =>
                      setFormData({ ...formData, is_active: e.target.checked })
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Active</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Name</p>
                <p className="text-base">{event.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Slug</p>
                <p className="text-base font-mono">{event.slug ?? '-'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm font-medium text-muted-foreground">
                  Description
                </p>
                <p className="text-base">{event.description || 'No description'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Start Date
                </p>
                <p className="text-base">
                  {event.start_date
                    ? new Date(event.start_date).toLocaleDateString()
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  End Date
                </p>
                <p className="text-base">
                  {event.end_date
                    ? new Date(event.end_date).toLocaleDateString()
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant={event.is_active ? 'default' : 'secondary'}>
                  {event.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {event.banner_color && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Banner Color
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="w-6 h-6 rounded border"
                      style={{ backgroundColor: event.banner_color }}
                    />
                    <span className="font-mono text-sm">{event.banner_color}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registration & Participation */}
      {event.is_active && (
        <RegistrationSection eventId={id} event={event} />
      )}

      {/* Event Management (Admin) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-5 w-5" />
            Event Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link href={`/startup-studio/events/${id}/registrations`}>
                <Users className="mr-2 h-4 w-4 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">Registrations</p>
                  <p className="text-xs text-muted-foreground">View all teams and stats</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link href={`/startup-studio/events/${id}/checklists`}>
                <ListChecks className="mr-2 h-4 w-4 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">Checklists</p>
                  <p className="text-xs text-muted-foreground">Pre-event, on-day, post-event</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link href={`/startup-studio/events/${id}/demo-day`}>
                <Presentation className="mr-2 h-4 w-4 text-purple-500" />
                <div className="text-left">
                  <p className="font-medium">Demo Day</p>
                  <p className="text-xs text-muted-foreground">Presentation schedule</p>
                </div>
              </Link>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" asChild>
              <Link href={`/startup-studio/events/${id}/venues`}>
                <MapPin className="mr-2 h-4 w-4 text-orange-500" />
                <div className="text-left">
                  <p className="font-medium">Venues & Mentors</p>
                  <p className="text-xs text-muted-foreground">Allocate teams to venues</p>
                </div>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Config */}
      {event.config && Object.keys(event.config).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto max-h-64">
              {JSON.stringify(event.config, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// --- Registration Section (separate for clarity) ---

function RegistrationSection({ eventId, event }: { eventId: string; event: any }) {
  const registrationDeadline = event.config?.registration_deadline;

  const isPastDeadline = useMemo(() => {
    if (!registrationDeadline) return false;
    return new Date() > new Date(registrationDeadline);
  }, [registrationDeadline]);

  return (
    <Card className={isPastDeadline ? 'border-amber-300' : 'border-primary/30'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" />
          Participate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPastDeadline && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Registration deadline ({new Date(registrationDeadline).toLocaleDateString()}) has passed.
              Late registration is still allowed.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button asChild size="lg">
            <Link href={`/startup-studio/events/${eventId}/register`}>
              <Users className="mr-2 h-4 w-4" />
              Register Your Team
            </Link>
          </Button>
          <Button variant="outline" asChild size="lg">
            <Link href={`/startup-studio/events/${eventId}/submit`}>
              <Send className="mr-2 h-4 w-4" />
              Submit Project
            </Link>
          </Button>
        </div>

        {event.description && (
          <p className="text-sm text-muted-foreground">{event.description}</p>
        )}
      </CardContent>
    </Card>
  );
}
