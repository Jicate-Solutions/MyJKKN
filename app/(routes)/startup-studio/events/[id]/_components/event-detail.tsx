'use client';

import { useState } from 'react';
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
