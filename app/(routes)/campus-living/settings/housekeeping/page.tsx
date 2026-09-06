'use client';

// ============================================================================
// Settings — Housekeeping Slot Booking (Director's config page)
// ----------------------------------------------------------------------------
// Edits the 7 housekeeping.* platform_policies rows that drive the resident
// slot-booking feature, with a live English-consequences preview. Guard copies
// the strictest sibling settings page (block-economics): super-admin only,
// with an explicit "you don't have access" card — never a silent redirect
// (CLAUDE.md rule #27).
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md §"Agent D".
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { HousekeepingPolicyForm } from './_components/housekeeping-policy-form';

/**
 * navMeta — invoked from the Campus Living settings index card, not via a
 * nav chip (mirrors the other settings sub-pages).
 */
export const navMeta = {
  invokedFrom: '/campus-living/settings',
} as const;

export default function HousekeepingBookingSettingsPage() {
  const { isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title="Housekeeping Booking">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Housekeeping Booking">
        <Card className="max-w-xl mx-auto mt-10">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">You don&apos;t have access</h2>
            <p className="text-sm text-muted-foreground">
              Housekeeping booking configuration is restricted to super admins.
              If you need to view or change these settings, contact your system
              administrator.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Housekeeping Booking">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Settings', href: '/campus-living/settings' },
          { label: 'Housekeeping Booking' },
        ]}
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Housekeeping Slot Booking
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            Every knob of the resident cleaning-slot feature — slot length,
            daily window, capacity, advance booking, cancellation cutoff,
            per-tier weekly quotas, and the master switch. Changes apply on the
            next page load, no deploy needed.
          </p>
        </div>

        <HousekeepingPolicyForm />
      </div>
    </ContentLayout>
  );
}
