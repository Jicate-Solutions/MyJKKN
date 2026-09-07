'use client';

// Hostel Allocations — a single table, no tabs.
//
// Until 2026-09-02 this page carried an outer <Tabs> (All / Allocated / Not
// Allocated) wrapped around <AllAllocationsTab />, which already had its own
// placement quick-filter carrying the identical three labels. Two identical
// controls, one directly above the other, both driving the same rows.
//
// The outer tabs are gone. The two view-only tabs they hosted — an inline
// Allocated table that lived in this file, and not-allocated-tab.tsx — are
// folded into that one table as a Status dropdown, readiness chips, a
// "Why not allocated" column and Mess/Type/Date/Fee columns, so removing the
// duplicate removed no view. See the header of all-allocations-tab.tsx.
//
// The table itself still owns ?tab= (via useTabParam) for its placement
// filter, so every existing ?tab=allocated / ?tab=not-allocated link — and the
// navbar FavoriteStar, which favorites a specific ?tab= value — keeps working.

import { Suspense } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { AllAllocationsTab } from './_components/all-allocations-tab';
import { Plus, Users, ClipboardList } from 'lucide-react';

export default function AllocationsPage() {
  // Suspense boundary required: the table's placement + readiness filters are
  // URL-synced via useTabParam(), which reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <ContentLayout title="Hostel Allocations">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Campus Living', href: '/campus-living' },
            { label: 'Allocations' },
          ]}
        />

        <div className="space-y-6 mt-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <div>
              <h1 className="text-2xl font-bold py-1">Hostel Allocations</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Manage student bed allocations across all blocks
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Promoted from under the old Allocated tab's table, which no
                  longer exists — the link would otherwise have gone with it. */}
              <Button variant="outline" asChild>
                <Link href="/campus-living/allocations/waitlist">
                  <ClipboardList className="mr-2 h-4 w-4" /> View Waitlist
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/campus-living/allocations/roommate-matching">
                  <Users className="mr-2 h-4 w-4" /> Roommate Matching
                </Link>
              </Button>
              <Button asChild>
                <Link href="/campus-living/allocations/new">
                  <Plus className="mr-2 h-4 w-4" /> Allocate Bed
                </Link>
              </Button>
            </div>
          </div>

          <AllAllocationsTab />
        </div>
      </ContentLayout>
    </Suspense>
  );
}
