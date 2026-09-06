'use client';

// Sports Tournaments — list page.
// A tournament is an `events` row (event_type='sports_tournament'); this page
// lists them in the shared advanced DataTable (search, sort, pagination,
// column visibility/resizing, export) with permission-gated View/Edit/Delete
// row actions. Mobile (<md) falls back to the original tappable card layout.

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { TournamentsDataTable } from './_components/tournaments-data-table';

export default function TournamentsListPage() {
  return (
    <ContentLayout title="Sports Tournaments">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Tournaments' },
        ]}
      />

      <div className="mt-4">
        <TournamentsDataTable />
      </div>
    </ContentLayout>
  );
}
