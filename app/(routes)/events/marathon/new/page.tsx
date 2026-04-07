'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useAuth } from '@/hooks/use-auth';
import { EventBaseService } from '@/lib/services/events/core/event-base-service';
import { Loader2 } from 'lucide-react';

export default function CreateMarathonEventPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? '';
  const createMutation = useCreateMarathonEvent();

  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    name: '',
    year: currentYear,
    theme: '',
    tagline: '',
    event_date: '',
    start_time: '',
    venue: '',
    venue_address: '',
    target_registrations: '',
    description: '',
  });

  const slug = EventBaseService.generateSlug(form.name, form.year);

  const updateField = (
    field: string,
    value: string | number
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name.trim()) return;
    if (!institutionId) return;

    const dto = {
      institution_id: institutionId,
      name: form.name.trim(),
      slug,
      year: form.year,
      theme: form.theme || undefined,
      tagline: form.tagline || undefined,
      event_date: form.event_date || undefined,
      start_time: form.start_time || undefined,
      venue: form.venue || undefined,
      venue_address: form.venue_address || undefined,
      target_registrations: form.target_registrations
        ? parseInt(form.target_registrations, 10)
        : undefined,
      description: form.description || undefined,
    };

    try {
      const event = await createMutation.mutateAsync(dto);
      router.push(`/events/marathon/${event.id}/settings`);
    } catch {
      // Error handled by mutation hook toast
    }
  };

  return (
    <ContentLayout title="Create Marathon Event">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: 'New Event' },
        ]}
      />

      <div className="max-w-2xl mx-auto mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Marathon Event</CardTitle>
            <CardDescription>
              Set up a new marathon event. Default categories (10K, 5K, 3K) will
              be created automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Event Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g. JKKN Marathon"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  required
                />
                {slug && (
                  <p className="text-xs text-muted-foreground">
                    Slug: <code className="bg-muted px-1 rounded">{slug}</code>
                  </p>
                )}
              </div>

              {/* Year */}
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  min={2020}
                  max={2100}
                  value={form.year}
                  onChange={(e) =>
                    updateField('year', parseInt(e.target.value, 10) || currentYear)
                  }
                />
              </div>

              {/* Theme & Tagline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Input
                    id="theme"
                    placeholder="e.g. Run for Health"
                    value={form.theme}
                    onChange={(e) => updateField('theme', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tagline">Tagline</Label>
                  <Input
                    id="tagline"
                    placeholder="e.g. Every step counts"
                    value={form.tagline}
                    onChange={(e) => updateField('tagline', e.target.value)}
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="event_date">Event Date</Label>
                  <Input
                    id="event_date"
                    type="date"
                    value={form.event_date}
                    onChange={(e) => updateField('event_date', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start_time">Start Time</Label>
                  <Input
                    id="start_time"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => updateField('start_time', e.target.value)}
                  />
                </div>
              </div>

              {/* Venue */}
              <div className="space-y-2">
                <Label htmlFor="venue">Venue</Label>
                <Input
                  id="venue"
                  placeholder="e.g. JKKN College Campus"
                  value={form.venue}
                  onChange={(e) => updateField('venue', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue_address">Venue Address</Label>
                <Textarea
                  id="venue_address"
                  placeholder="Full address of the venue"
                  value={form.venue_address}
                  onChange={(e) => updateField('venue_address', e.target.value)}
                  rows={2}
                />
              </div>

              {/* Target Registrations */}
              <div className="space-y-2">
                <Label htmlFor="target_registrations">
                  Target Registrations
                </Label>
                <Input
                  id="target_registrations"
                  type="number"
                  min={0}
                  placeholder="e.g. 5000"
                  value={form.target_registrations}
                  onChange={(e) =>
                    updateField('target_registrations', e.target.value)
                  }
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the marathon event"
                  value={form.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || !form.name.trim() || !institutionId
                  }
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Event
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/events/marathon')}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
