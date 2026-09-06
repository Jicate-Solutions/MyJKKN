'use client';

// ============================================================================
// Settings — Choose Your Menu (super-admin platform config, P0b)
// ----------------------------------------------------------------------------
// Edits the 9 `mess.choose.*` platform_policies rows that drive the resident
// menu-engagement feature, with a live English-consequences preview. Guard
// copies the strictest sibling settings page (housekeeping / block-economics):
// super-admin only, with an explicit "you don't have access" card — never a
// silent redirect (CLAUDE.md rule #27).
//
// The feature ships DARK (master_enabled = false from the P0 substrate
// migration). This page is the surface the super-admin uses to turn it on,
// per-mode × per-tier.
// Spec: specs/choose-your-menu-platform-spec-2026-06-11.md.
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ShieldAlert, UtensilsCrossed } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { ChooseYourMenuPolicyForm } from './_components/choose-your-menu-policy-form';

/**
 * navMeta — invoked from the Campus Living settings index card (and reachable
 * via a Settings nav chip), mirroring the other settings sub-pages.
 */
export const navMeta = {
  invokedFrom: '/campus-living/settings',
} as const;

export default function ChooseYourMenuSettingsPage() {
  const { isSuperAdmin, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <ContentLayout title="Choose Your Menu">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Choose Your Menu">
        <Card className="max-w-xl mx-auto mt-10">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold">You don&apos;t have access</h2>
            <p className="text-sm text-muted-foreground">
              Choose Your Menu configuration is restricted to super admins. If
              you need to view or change these settings, contact your system
              administrator.
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Choose Your Menu">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Settings', href: '/campus-living/settings' },
          { label: 'Choose Your Menu' },
        ]}
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            Choose Your Menu
          </h1>
          <p className="text-muted-foreground max-w-3xl">
            The optional engagement layer over the default mess menu —
            personalization (swap a meal), voting (thumbs up/down dishes), and
            special-day proposals — each switchable per resident tier. The whole
            feature ships off; turn it on here when you&apos;re ready. Changes
            apply on the next page load, no deploy needed.
          </p>
        </div>

        <ChooseYourMenuPolicyForm />
      </div>
    </ContentLayout>
  );
}
