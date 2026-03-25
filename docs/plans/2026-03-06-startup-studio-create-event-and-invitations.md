# Startup Studio — Create Event & Pending Invitations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "New Event" button (admin-only) with a create dialog to the events list page, and surface pending team invitations for students on the same page.

**Architecture:** Two independent UI additions to `app/(routes)/startup-studio/events/page.tsx`. Task 1 adds a `useCreateEvent` mutation hook and a `CreateEventDialog` component following the exact same pattern as the existing `EditEventDialog`. Task 2 adds a `PendingInvitationsCard` component that uses the already-built `useMyPendingInvitations` and `useRespondToInvitation` hooks to let students accept/decline invitations.

**Tech Stack:** Next.js 15 App Router, React Query v5 (`useMutation`), react-hook-form + zod, shadcn/ui (Dialog, Form, Input, Textarea, Button, Card, Badge), Lucide icons, sonner (for use-events hooks), react-hot-toast (for use-event-registrations hooks — match the existing import in that file).

---

## Context — Key Files to Understand

Before starting, read these files:

1. **`hooks/startup-studio/use-events.ts`** — where `useCreateEvent` will be added. Uses `import { toast } from 'sonner'`.
2. **`hooks/startup-studio/use-event-registrations.ts`** — has `useMyPendingInvitations` and `useRespondToInvitation` already built. Uses `import toast from 'react-hot-toast'`.
3. **`app/(routes)/startup-studio/events/_components/edit-event-dialog.tsx`** — the exact pattern to clone for CreateEventDialog (zod schema, react-hook-form, Dialog, Form, grid layout).
4. **`app/(routes)/startup-studio/events/page.tsx`** — where the "New Event" button and `PendingInvitationsCard` will be rendered.
5. **`types/startup-studio.ts`** — `CreateEventDto`, `PendingInvitation` interfaces.

### Admin check pattern (copy exactly):
```ts
const isAdmin = profile?.is_super_admin || profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';
```

### `PendingInvitation` type (from `types/startup-studio.ts`):
```ts
export interface PendingInvitation {
  member_id: string;          // event_team_members.id
  registration_id: string;
  team_name: string;
  team_code: string | null;
  event_id: string;
  event_name: string;
  invited_at: string;
  invited_by_name: string | null;
}
```

---

## Task 1: `useCreateEvent` hook

**Files:**
- Modify: `hooks/startup-studio/use-events.ts`

**Step 1: Add the hook**

Append this to the end of `hooks/startup-studio/use-events.ts` (after `useUpdateEvent`):

```ts
export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, userId }: { dto: import('@/types/startup-studio').CreateEventDto; userId: string }) =>
      EventService.createEvent(dto, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['startup-events'] });
      toast.success('Event created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create event');
    },
  });
}
```

Also add `CreateEventDto` to the existing import from `@/types/startup-studio`:
```ts
import type { EventFilters, UpdateEventDto, CreateEventDto } from '@/types/startup-studio';
```

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add hooks/startup-studio/use-events.ts
git commit -m "feat(startup-studio): add useCreateEvent mutation hook"
```

---

## Task 2: `CreateEventDialog` component

**Files:**
- Create: `app/(routes)/startup-studio/events/_components/create-event-dialog.tsx`

**Step 1: Create the file**

This follows the *exact same pattern* as `edit-event-dialog.tsx`. Key differences:
- No `event` prop (no existing data to populate)
- No `status` field (new events always start as `'draft'`)
- Uses `useCreateEvent` instead of `useUpdateEvent`
- Receives `userId` prop
- On success, closes the dialog

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useCreateEvent } from '@/hooks/startup-studio/use-events';

const createEventSchema = z.object({
  name: z.string().min(2, 'Event name is required'),
  description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  demo_date: z.string().optional(),
  registration_deadline: z.string().optional(),
  submission_deadline: z.string().optional(),
  metrics_deadline: z.string().optional(),
  team_max_size: z.coerce.number().min(1).max(20).default(5),
});

type FormValues = z.infer<typeof createEventSchema>;

interface CreateEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function CreateEventDialog({ open, onOpenChange, userId }: CreateEventDialogProps) {
  const createEvent = useCreateEvent();

  const form = useForm<FormValues>({
    resolver: zodResolver(createEventSchema),
    defaultValues: {
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      demo_date: '',
      registration_deadline: '',
      submission_deadline: '',
      metrics_deadline: '',
      team_max_size: 5,
    },
  });

  const onSubmit = (values: FormValues) => {
    createEvent.mutate(
      {
        dto: {
          name: values.name,
          description: values.description || undefined,
          start_date: values.start_date || undefined,
          end_date: values.end_date || undefined,
          demo_date: values.demo_date || undefined,
          registration_deadline: values.registration_deadline || undefined,
          submission_deadline: values.submission_deadline || undefined,
          metrics_deadline: values.metrics_deadline || undefined,
          config: { team_max_size: values.team_max_size },
        },
        userId,
      },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Event Name *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. JKKN Appathon 3.0" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Brief description of the event" rows={2} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="team_max_size"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Team Size</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" min={1} max={20} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Dates & Deadlines</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="registration_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Deadline</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Build Day (Start)</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="demo_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Demo Day</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event End Date</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="submission_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Submission Deadline</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="metrics_deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Metrics Deadline</FormLabel>
                      <FormControl><Input {...field} type="datetime-local" /></FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createEvent.isPending}>
                {createEvent.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
                ) : (
                  'Create Event'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add "app/(routes)/startup-studio/events/_components/create-event-dialog.tsx"
git commit -m "feat(startup-studio): add CreateEventDialog component"
```

---

## Task 3: `PendingInvitationsCard` component

**Files:**
- Create: `app/(routes)/startup-studio/events/_components/pending-invitations-card.tsx`

**Step 1: Create the file**

This component uses `useMyPendingInvitations` and `useRespondToInvitation` (both in `hooks/startup-studio/use-event-registrations.ts`).

UI: A Card with a list of pending invitations. Each row shows event name, team name (with team code if present), invited-by name, time ago, and Accept/Decline buttons. While a response is being submitted, show a spinner on that specific row (track `respondingId` state).

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Check, X } from 'lucide-react';
import {
  useMyPendingInvitations,
  useRespondToInvitation,
} from '@/hooks/startup-studio/use-event-registrations';

export function PendingInvitationsCard() {
  const { data: invitations, isLoading } = useMyPendingInvitations();
  const respond = useRespondToInvitation();
  const [respondingId, setRespondingId] = useState<string | null>(null);

  if (isLoading) return null;
  if (!invitations || invitations.length === 0) return null;

  const handleRespond = (memberId: string, accept: boolean) => {
    setRespondingId(memberId);
    respond.mutate(
      { memberId, accept },
      { onSettled: () => setRespondingId(null) }
    );
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          Pending Team Invitations
          <Badge variant="secondary" className="ml-auto">{invitations.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {invitations.map((inv) => (
          <div
            key={inv.member_id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-background rounded-lg border"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{inv.event_name}</p>
              <p className="text-xs text-muted-foreground">
                Team: <span className="font-medium">{inv.team_name}</span>
                {inv.team_code && (
                  <span className="ml-1 font-mono text-primary">({inv.team_code})</span>
                )}
              </p>
              {inv.invited_by_name && (
                <p className="text-xs text-muted-foreground">Invited by {inv.invited_by_name}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={respondingId === inv.member_id}
                onClick={() => handleRespond(inv.member_id, false)}
              >
                {respondingId === inv.member_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Decline
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                disabled={respondingId === inv.member_id}
                onClick={() => handleRespond(inv.member_id, true)}
              >
                {respondingId === inv.member_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Accept
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add "app/(routes)/startup-studio/events/_components/pending-invitations-card.tsx"
git commit -m "feat(startup-studio): add PendingInvitationsCard component"
```

---

## Task 4: Wire up both components on the events list page

**Files:**
- Modify: `app/(routes)/startup-studio/events/page.tsx`

**Step 1: Read the current file**

Read `app/(routes)/startup-studio/events/page.tsx` fully before editing.

**Step 2: Make these changes**

1. Add `useState` for `createDialogOpen` (already has `useState` imported — just add to destructure)
2. Add `useAuth` import
3. Add `CreateEventDialog` import
4. Add `PendingInvitationsCard` import
5. Add admin detection using the standard pattern
6. Add "New Event" button next to the "Events" heading (admin-only)
7. Add `PendingInvitationsCard` above the search bar (non-admin only, or always — it self-hides when empty)
8. Add `CreateEventDialog` below the return, just before the closing `</ContentLayout>`

The updated file should look like this (full rewrite with all changes):

```tsx
'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEvents } from '@/hooks/startup-studio/use-events';
import { useAuth } from '@/hooks/use-auth';
import { EventCard } from './_components/event-card';
import { CreateEventDialog } from './_components/create-event-dialog';
import { PendingInvitationsCard } from './_components/pending-invitations-card';
import { Loader2, Plus, Search } from 'lucide-react';
import type { EventStatus } from '@/types/startup-studio';

const ACTIVE_STATUSES: EventStatus[] = ['registration_open', 'build_day', 'demo_day'];

export default function StartupStudioEventsPage() {
  const { data: events, isLoading, error } = useEvents();
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [createOpen, setCreateOpen] = useState(false);

  const isAdmin = profile?.is_super_admin || profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';

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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold py-1">Events</h1>
            <p className="text-sm text-muted-foreground">
              Manage hackathons, sprints, and innovation events
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" /> New Event
            </Button>
          )}
        </div>

        <PendingInvitationsCard />

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

      {isAdmin && profile?.id && (
        <CreateEventDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          userId={profile.id}
        />
      )}
    </ContentLayout>
  );
}
```

**Step 3: Verify TypeScript**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add "app/(routes)/startup-studio/events/page.tsx"
git commit -m "feat(startup-studio): add New Event button and pending invitations to events list page"
```

---

## Task 5: Push to remote

```bash
git push origin main
```

Expected: All commits pushed successfully.

---

## Verification Checklist

After all tasks:

- [ ] As admin: events list page shows "New Event" button top-right
- [ ] Click "New Event": dialog opens with form (name, description, dates, max team size)
- [ ] Fill name + submit: event appears in list as `draft`, toast "Event created successfully"
- [ ] As non-admin: no "New Event" button visible
- [ ] As a student with pending invitations: card appears above search bar with invitation rows
- [ ] Click "Accept": row disappears, toast "You joined the team!"
- [ ] Click "Decline": row disappears, toast "Invitation declined"
- [ ] As student with no invitations: card is not rendered (self-hides)
- [ ] TypeScript: `npx tsc --noEmit` exits 0
