// ============================================================================
// ROOM CLEANING — RESIDENT SLOT-BOOKING PAGE (Agent C, 2026-06-10)
// ============================================================================
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md §"UI surfaces → Agent C"
// Pattern source: app/(routes)/campus-living/my-hostel/premium/page.tsx
//
// Premium-ROOM-CATEGORY residents book 10-minute housekeeping slots for their
// room. Slots are computed server-side (fn_housekeeping_available_slots);
// every knob is a platform_policies row, so nothing here hardcodes durations
// or windows — slot length + service window come back inside the slots
// response, and the advance-days / cancellation-cutoff knobs are read via
// fn_get_policy_int (same client-side reader mess-menu-policy-service uses)
// with the seeded migration defaults as fallback.
//
// WHO IS ENTITLED (reworked 2026-08-25, migration
// 20260825120000_housekeeping_entitlement_by_room_category.sql): the resident's
// ROOM CATEGORY (hostel_categories) decides, via hostel_categories.tier_key →
// hostel_tier_policy.tier_features + the weekly_quota_by_tier policy row.
// It used to key on hostel_allocations.tier_id, which production never
// populated — every row is 'standard' with tier_features [], so this page
// showed the upsell to 100% of residents and nobody ever booked. Do not
// reintroduce an allocation-tier check here.
//
// Gating is data-driven (matches premium/page.tsx — no PermissionGuard) and
// comes from ONE call, fn_housekeeping_my_entitlement, which is also what
// fn_housekeeping_book_slot enforces — so the card a resident sees and the
// answer the write gate gives cannot disagree:
//   1. no active allocation  → calm "allocation pending" card
//   2. tier not entitled     → upsell card linking to ../premium
//   3. quota configured to 0 → "not included in your plan" card
//   4. booking_enabled=false → "temporarily paused" card (enabled flag arrives
//      inside the slots response; fn_housekeeping_book_slot also returns
//      error_code 'disabled' as the server-side backstop)
// Students are confined to /campus-living/my-hostel/* by
// CampusLivingResidentGuard in the module layout, so this route is reachable.
// ============================================================================

'use client';

export const navMeta = {
  label: 'Room Cleaning',
  icon: 'Brush',
  invokedFrom: '/campus-living/my-hostel',
} as const;

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import {
  useAvailableSlots,
  useMyBookings,
  useMyEntitlement,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import { HostelAllocationService } from '@/lib/services/campus-living/hostel-allocation-service';
import { HOUSEKEEPING_POLICY_KEYS } from '@/lib/services/campus-living/housekeeping-policy-keys';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AvailableSlot } from '@/lib/services/campus-living/housekeeping-booking-service';
import { EntitlementHeader } from './_components/entitlement-header';
import { DateStrip } from './_components/date-strip';
import { SlotGrid } from './_components/slot-grid';
import { BookingConfirmDialog } from './_components/booking-confirm-dialog';
import { UpcomingBookings } from './_components/upcoming-bookings';
import { toISODate, dateRange } from './_components/booking-utils';
import {
  Brush,
  Loader2,
  Hourglass,
  Sparkles,
  PauseCircle,
  AlertCircle,
} from 'lucide-react';

// Seeded migration defaults — used only when the policy read fails
// (mirrors DEFAULT_* fallbacks in housekeeping-booking-service.ts).
const DEFAULT_ADVANCE_DAYS = 7;
const DEFAULT_CUTOFF_MINUTES = 60;

/**
 * Advance-window + cancellation-cutoff policy values. fn_get_policy_int is the
 * client-callable scalar reader (p_default baked in) already used from the
 * browser by mess-menu-policy-service — NOT a new RPC surface.
 */
function useBookingWindowPolicies() {
  return useQuery({
    queryKey: ['housekeeping-bookings', 'booking-window-policies'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const [adv, cutoff] = await Promise.all([
        supabase.rpc('fn_get_policy_int', {
          p_key: HOUSEKEEPING_POLICY_KEYS.BOOKING_ADVANCE_DAYS,
          p_default: DEFAULT_ADVANCE_DAYS,
          p_scope_id: null,
        }),
        supabase.rpc('fn_get_policy_int', {
          p_key: HOUSEKEEPING_POLICY_KEYS.CANCELLATION_CUTOFF_MINUTES,
          p_default: DEFAULT_CUTOFF_MINUTES,
          p_scope_id: null,
        }),
      ]);
      return {
        advanceDays:
          typeof adv.data === 'number' ? adv.data : DEFAULT_ADVANCE_DAYS,
        cutoffMinutes:
          typeof cutoff.data === 'number' ? cutoff.data : DEFAULT_CUTOFF_MINUTES,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function HousekeepingBookingPage() {
  const { profile } = useAuth();
  const profileId = profile?.id ?? '';

  const todayISO = toISODate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [pendingSlot, setPendingSlot] = useState<AvailableSlot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Entitlement: tier feature flag + weekly quota + usage (service-composed).
  const {
    data: entitlement,
    isLoading: entitlementLoading,
    isError: entitlementError,
  } = useMyEntitlement();

  // Active allocation for block/room context (getMyEntitlement doesn't return
  // them). Same query key as my-hostel/page.tsx — React Query dedupes.
  const { data: allocations, isLoading: allocLoading } = useQuery({
    queryKey: ['hostel-allocations', 'by-learner', profileId],
    queryFn: () => HostelAllocationService.getAllocationByLearner(profileId, true),
    enabled: !!profileId,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeAllocation = (allocations ?? [])[0] as any;
  const blockId: string | undefined = activeAllocation?.block_id;
  const blockName: string = activeAllocation?.hostel_blocks?.name ?? '';
  const roomNumber: string = activeAllocation?.hostel_rooms?.room_number ?? '';

  const { data: windowPolicies } = useBookingWindowPolicies();
  const advanceDays = windowPolicies?.advanceDays ?? DEFAULT_ADVANCE_DAYS;
  const cutoffMinutes = windowPolicies?.cutoffMinutes ?? DEFAULT_CUTOFF_MINUTES;

  const entitled = entitlement?.entitled === true;

  // Slot grid for the selected date (only once entitled + block known).
  const slotsQuery = useAvailableSlots(
    entitled ? blockId : undefined,
    entitled ? selectedDate : undefined
  );

  // Own bookings from today forward.
  const { data: myBookings, isLoading: bookingsLoading } = useMyBookings(todayISO);

  const quotaExhausted =
    entitled && (entitlement?.usedThisWeek ?? 0) >= (entitlement?.weeklyQuota ?? 0);

  const loading = entitlementLoading || allocLoading;

  const breadcrumb = (
    <PageBreadcrumb
      items={[
        { label: 'Home', href: '/' },
        { label: 'Campus Living', href: '/campus-living' },
        { label: 'My Hostel', href: '/campus-living/my-hostel' },
        { label: 'Room Cleaning' },
      ]}
    />
  );

  const header = (
    <div className='flex items-start gap-3'>
      <Brush className='h-7 w-7 text-primary mt-1' />
      <div>
        <h1 className='text-2xl font-bold py-1'>Room Cleaning</h1>
        <p className='text-sm text-muted-foreground max-w-2xl'>
          Book a quick housekeeping slot and our staff will clean your room
          while you carry on with your day.
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <ContentLayout title='Room Cleaning'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (entitlementError) {
    return (
      <ContentLayout title='Room Cleaning'>
        {breadcrumb}
        <div className='space-y-6 mt-4'>
          {header}
          <Card>
            <CardContent className='p-8 text-center space-y-2'>
              <AlertCircle className='h-10 w-10 mx-auto text-muted-foreground' />
              <p className='text-muted-foreground'>
                Could not load your booking details. Please refresh and try
                again.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ── Edge state 1: no active allocation ─────────────────────────────
  if (!entitlement || entitlement.reason === 'no_active_allocation' || !activeAllocation) {
    return (
      <ContentLayout title='Room Cleaning'>
        {breadcrumb}
        <div className='space-y-6 mt-4'>
          {header}
          <Card>
            <CardContent className='p-8 text-center space-y-3'>
              <Hourglass className='h-10 w-10 mx-auto text-muted-foreground' />
              <p className='font-medium'>
                Your hostel allocation is pending approval
              </p>
              <p className='text-sm text-muted-foreground max-w-md mx-auto'>
                Room-cleaning slot booking opens once you&apos;re checked in to
                your room. Check{' '}
                <Link
                  href='/campus-living/my-hostel'
                  className='underline underline-offset-2'
                >
                  My Hostel
                </Link>{' '}
                for your allocation status.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ── Edge state 2: tier not entitled → premium upsell ───────────────
  if (entitlement.reason === 'tier_not_entitled') {
    return (
      <ContentLayout title='Room Cleaning'>
        {breadcrumb}
        <div className='space-y-6 mt-4'>
          {header}
          <Card className='border-amber-200 bg-amber-50/50'>
            <CardContent className='p-8 text-center space-y-3'>
              <Sparkles className='h-10 w-10 mx-auto text-amber-500' />
              <p className='font-medium text-amber-900'>
                Personal room cleaning is a Premium Room feature
              </p>
              <p className='text-sm text-amber-700 max-w-md mx-auto'>
                {entitlement.categoryName
                  ? `${entitlement.categoryName} is covered by the regular block cleaning schedule.`
                  : 'Your room category is covered by the regular block cleaning schedule.'}{' '}
                Upgrade to a Premium room to book personal room-cleaning slots
                at a time that suits you.
              </p>
              <Button asChild className='mt-2'>
                <Link href='/campus-living/my-hostel/premium'>
                  <Sparkles className='mr-2 h-4 w-4' />
                  Upgrade to Premium
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ── Edge state 2b: tier has the feature but quota is configured to 0 ─
  if (entitlement.reason === 'no_weekly_quota') {
    return (
      <ContentLayout title='Room Cleaning'>
        {breadcrumb}
        <div className='space-y-6 mt-4'>
          {header}
          <Card>
            <CardContent className='p-8 text-center space-y-2'>
              <AlertCircle className='h-10 w-10 mx-auto text-muted-foreground' />
              <p className='font-medium'>
                Slot booking isn&apos;t currently included in your plan
              </p>
              <p className='text-sm text-muted-foreground max-w-md mx-auto'>
                Your tier&apos;s weekly cleaning quota is set to zero right
                now. Please contact your hostel office if you think this is a
                mistake.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  // ── Entitled: full booking surface ─────────────────────────────────
  const bookingPaused = slotsQuery.data?.enabled === false;
  const bookableDates = dateRange(todayISO, Math.max(1, advanceDays + 1));

  return (
    <ContentLayout title='Room Cleaning'>
      {breadcrumb}
      <div className='space-y-6 mt-4'>
        {header}

        <EntitlementHeader
          tierKey={entitlement.tierKey}
          categoryName={entitlement.categoryName}
          weeklyQuota={entitlement.weeklyQuota}
          usedThisWeek={entitlement.usedThisWeek}
          blockName={blockName}
          roomNumber={roomNumber}
        />

        {/* Edge state 3: master kill-switch off */}
        {bookingPaused ? (
          <Card>
            <CardContent className='p-8 text-center space-y-2'>
              <PauseCircle className='h-10 w-10 mx-auto text-muted-foreground' />
              <p className='font-medium'>
                Housekeeping booking is temporarily paused
              </p>
              <p className='text-sm text-muted-foreground max-w-md mx-auto'>
                The hostel office has paused new slot bookings for now. Please
                check back later.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className='space-y-3'>
            <DateStrip
              dates={bookableDates}
              selected={selectedDate}
              onSelect={setSelectedDate}
            />
            <SlotGrid
              data={slotsQuery.data}
              isLoading={slotsQuery.isLoading}
              isError={slotsQuery.isError}
              selectedDate={selectedDate}
              quotaExhausted={quotaExhausted}
              onPick={(slot) => {
                setPendingSlot(slot);
                setConfirmOpen(true);
              }}
            />
          </div>
        )}

        <UpcomingBookings
          bookings={myBookings ?? []}
          isLoading={bookingsLoading}
          cutoffMinutes={cutoffMinutes}
        />
      </div>

      <BookingConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          setConfirmOpen(o);
          if (!o) setPendingSlot(null);
        }}
        date={selectedDate}
        slot={pendingSlot}
        blockName={blockName}
        roomNumber={roomNumber}
      />
    </ContentLayout>
  );
}
