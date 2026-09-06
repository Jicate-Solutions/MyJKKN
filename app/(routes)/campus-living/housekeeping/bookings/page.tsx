'use client';

// ============================================================================
// Housekeeping — Slot Bookings (staff day board)
// ----------------------------------------------------------------------------
// Staff view of resident-booked cleaning slots for one day. Same access model
// as the sibling housekeeping pages (no page-level PermissionGuard — the
// campus-living layout's resident guard blocks students from /housekeeping/*,
// and fn_housekeeping_booking_board / fn_housekeeping_mark_booking enforce
// campus_living.housekeeping permissions server-side).
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md §"Agent D".
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { CalendarClock } from 'lucide-react';
import { BookingDayBoard } from './_components/booking-day-board';

/**
 * navMeta — invoked from the parent housekeeping page via the "Bookings"
 * button, not via a nav chip. Mirrors the sibling tasks/schedules pages.
 */
export const navMeta = {
  invokedFrom: '/campus-living/housekeeping',
} as const;

export default function HousekeepingBookingsPage() {
  return (
    <ContentLayout title="Housekeeping Bookings">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Bookings' },
        ]}
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Slot Bookings
          </h1>
          <p className="text-muted-foreground">
            Resident-booked cleaning slots — assign each one to a cleaner, then
            mark it completed or no-show as the team works through them.
          </p>
        </div>

        <BookingDayBoard />
      </div>
    </ContentLayout>
  );
}
