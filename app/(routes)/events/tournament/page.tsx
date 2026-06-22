'use client';

// Sports Tournaments — list page.
// A tournament is an `events` row (event_type='sports_tournament'); this page
// lists them with a tappable mobile-first card layout (mirrors the marathon list).
// Created: 2026-06-22 (Sports Tournament PR1).

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useTournaments } from '@/hooks/events/use-tournaments';
import {
  Loader2,
  Plus,
  Calendar,
  MapPin,
  Trophy,
  Search,
  Globe,
  Building2,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Event, EventStatus } from '@/types/events';

const STATUS_CONFIG: Record<EventStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  planning: { label: 'Planning', color: 'text-blue-600', bg: 'bg-blue-50' },
  preparation: { label: 'Preparation', color: 'text-amber-600', bg: 'bg-amber-50' },
  execution: { label: 'Execution', color: 'text-orange-600', bg: 'bg-orange-50' },
  live: { label: 'LIVE', color: 'text-red-600', bg: 'bg-red-50' },
  post_event: { label: 'Post Event', color: 'text-purple-600', bg: 'bg-purple-50' },
  archived: { label: 'Archived', color: 'text-gray-500', bg: 'bg-gray-50' },
  cancelled: { label: 'Cancelled', color: 'text-red-500', bg: 'bg-red-50' },
};

function TournamentCard({ event }: { event: Event }) {
  const status = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.draft;
  const isAllJkkn = event.scope === 'all_jkkn';

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-emerald-50 p-2">
              <Trophy className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold leading-tight">{event.name}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {event.start_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(event.start_date), 'd MMM yyyy')}
                  </span>
                )}
                {(event.venue || event.venue_text) && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="h-3 w-3" />
                    {event.venue || event.venue_text}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  {isAllJkkn ? (
                    <>
                      <Globe className="h-3 w-3" /> All JKKN
                    </>
                  ) : (
                    <>
                      <Building2 className="h-3 w-3" /> Institution
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className={`${status.bg} ${status.color} border-0 text-[10px] font-semibold`}>
              {status.label}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TournamentsListPage() {
  const router = useRouter();
  const { data: tournaments, isLoading } = useTournaments();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = tournaments ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.venue ?? '').toLowerCase().includes(q) ||
        (e.venue_text ?? '').toLowerCase().includes(q)
    );
  }, [tournaments, search]);

  return (
    <ContentLayout title="Sports Tournaments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Tournaments' },
        ]}
      />

      <div className="mt-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tournaments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button onClick={() => router.push('/events/tournament/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Tournament
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No tournaments yet</p>
                <p className="text-sm text-muted-foreground">
                  Create your first sports tournament to get started.
                </p>
              </div>
              <Button variant="outline" onClick={() => router.push('/events/tournament/new')}>
                <Plus className="mr-2 h-4 w-4" />
                New Tournament
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map((event) => (
              <TournamentCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
