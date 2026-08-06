'use client';

// Events Hub — the all-events list.
//
// Was a grid of four event-type navigation cards plus a card list of general
// events. The cards are gone: the sidebar now carries Marathon · All Events,
// Tournament · All and Induction directly, so they were a second, weaker copy
// of navigation that already exists — and they pushed the actual event data
// below the fold. What replaces them is one advanced DataTable over EVERY
// event row (search, type/status filters, sort, pagination, column
// visibility/resizing, export), with each row opening in its own console.

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { EventsDataTable } from './_components/events-data-table';

export default function EventsHubPage() {
  return (
    <ContentLayout title="Events">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events' },
        ]}
      />

      <div className="space-y-4 mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold py-1">Events Hub</h1>
            <p className="text-sm text-muted-foreground">
              Every event across the platform — marathons, tournaments,
              inductions and one-off programmes. Tag an event with NAAC evidence
              criteria so it emits accreditation evidence once it completes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/events/proposals">Proposals</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/events/presets">Presets</Link>
            </Button>
            <Button asChild>
              <Link href="/events/create" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Create an Event
              </Link>
            </Button>
          </div>
        </div>

        <EventsDataTable />
      </div>
    </ContentLayout>
  );
}
