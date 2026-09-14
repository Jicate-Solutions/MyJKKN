'use client';

/**
 * Online Meetings — the list island.
 *
 * Presentation only. The page fetched and authorized; this splits the rows
 * into upcoming and past and renders them.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Radio, Users, Video } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OnlineMeetingListRow } from '@/lib/services/online-meetings/types';

interface MeetingListProps {
  meetings: OnlineMeetingListRow[];
  canCreate: boolean;
}

function when(m: OnlineMeetingListRow): string {
  const tz = m.timezone || 'Asia/Kolkata';
  const start = new Date(m.starts_at).toLocaleString('en-IN', {
    timeZone: tz,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const end = new Date(m.ends_at).toLocaleTimeString('en-IN', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

function StatusBadge({ status }: { status: OnlineMeetingListRow['effective_status'] }) {
  if (status === 'live') {
    return (
      <Badge className="gap-1 bg-red-600 hover:bg-red-600">
        <Radio className="h-3 w-3" aria-hidden /> Live
      </Badge>
    );
  }
  if (status === 'cancelled') return <Badge variant="destructive">Cancelled</Badge>;
  if (status === 'completed') return <Badge variant="secondary">Finished</Badge>;
  return <Badge variant="outline">Scheduled</Badge>;
}

function MeetingRow({ m }: { m: OnlineMeetingListRow }) {
  return (
    <Card className="transition-colors hover:bg-muted/40">
      <CardContent className="flex flex-wrap items-start justify-between gap-4 py-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/online-meetings/${m.id}`}
              className="font-medium hover:underline"
            >
              {m.title}
            </Link>
            <StatusBadge status={m.effective_status} />
            {m.is_host && <Badge variant="outline">You host this</Badge>}
            {m.join_mode === 'open_link' && (
              <Badge variant="outline" className="text-amber-700 dark:text-amber-500">
                Open link
              </Badge>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden />
            {when(m)}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {m.joined_count} of {m.participant_count} joined
            {m.host_name ? ` · hosted by ${m.host_name}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {m.effective_status !== 'cancelled' && (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href={`/online-meetings/${m.id}/live`}>
                <Video className="h-3.5 w-3.5" aria-hidden />
                Live page
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href={`/online-meetings/${m.id}`}>Open</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ message, canCreate }: { message: string; canCreate: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Video className="h-8 w-8 text-muted-foreground/40" aria-hidden />
        <p className="text-sm font-medium">{message}</p>
        {canCreate && (
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href="/online-meetings/new">Schedule one</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function MeetingList({ meetings, canCreate }: MeetingListProps) {
  const [search, setSearch] = useState('');

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const term = search.trim().toLowerCase();
    const filtered = term
      ? meetings.filter((m) => m.title.toLowerCase().includes(term))
      : meetings;
    return {
      upcoming: filtered
        .filter((m) => new Date(m.ends_at).getTime() >= now)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      past: filtered
        .filter((m) => new Date(m.ends_at).getTime() < now)
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    };
  }, [meetings, search]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search meetings by title…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {upcoming.length === 0 ? (
            <EmptyState
              message="No upcoming meetings you host or were invited to."
              canCreate={canCreate}
            />
          ) : (
            upcoming.map((m) => <MeetingRow key={m.id} m={m} />)
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4 space-y-3">
          {past.length === 0 ? (
            <EmptyState message="Nothing here yet." canCreate={false} />
          ) : (
            past.map((m) => <MeetingRow key={m.id} m={m} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
