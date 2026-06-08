'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/use-permissions';
import { BedEconScopeBar } from './_components/bed-econ-scope-bar';
import { ReadinessStrip } from './_components/readiness-strip';
import { HeadlineCards } from './_components/headline-cards';
import { BlockLeagueTable } from './_components/block-league-table';
import { ActionPanel } from './_components/action-panel';
import { TrendChart } from './_components/trend-chart';
import { CostReturnSection } from './_components/cost-return-section';
import { PremiumRevenueSection } from './_components/premium-revenue-section';
import { DqCard } from './_components/dq-card';
import { SettingsPanel } from './_components/settings-panel';

/**
 * Bed Economics Dashboard — Director's "return on every bed" view.
 *
 * Super-admin ONLY (spec §1, §10). Non-super-admins get an explicit
 * access-denied panel, never a silent redirect (platform rule 27).
 *
 * Page is deliberately thin: scope state + gate + section composition. Each
 * section is its own component under _components/ with its own loading/error
 * states, so a slow or failing RPC degrades one section, not the whole page.
 *
 * Precedents: skeleton from analytics/occupancy/page.tsx; super-admin gate
 * from admission/group-dashboard/page.tsx; scope picker adapted from
 * yoy-institution-picker.
 *
 * Spec: specs/bed-economics-dashboard-spec-2026-06-07.md §8 (screen layout).
 */

/**
 * navMeta — this page is reached via a drilldown card on the campus-living
 * analytics hub, not a nav chip. Documents that for the nav-coverage gate.
 */
export const navMeta = {
  invokedFrom: '/campus-living/analytics',
} as const;

export default function BedEconomicsPage() {
  const { isSuperAdmin, isLoading: permsLoading } = usePermissions();

  // Scope state. Institution null = network (all). Hostel year defaults to the
  // current year inside the scope bar once years load.
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [hostelYearId, setHostelYearId] = useState<string | null>(null);

  // While permissions resolve, show a spinner rather than flashing the
  // access-denied panel.
  if (permsLoading) {
    return (
      <ContentLayout title="Bed Economics">
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    );
  }

  // Explicit no-access panel — NO silent redirect (platform rule 27).
  if (!isSuperAdmin) {
    return (
      <ContentLayout title="Bed Economics">
        <div className="mx-auto mt-12 max-w-lg">
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>You don&apos;t have access</AlertTitle>
            <AlertDescription>
              The Bed Economics dashboard is restricted to super administrators.
              If you need access, contact the Director.
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  const scopedInstitutionId = institutionId ?? undefined;
  const scopedHostelYearId = hostelYearId ?? undefined;

  return (
    <ContentLayout title="Bed Economics">
      <div className="space-y-6">
        {/* 1. Scope bar + settings gear */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <BedEconScopeBar
              institutionId={institutionId}
              hostelYearId={hostelYearId}
              onInstitutionChange={setInstitutionId}
              onHostelYearChange={setHostelYearId}
            />
          </div>
          <div className="shrink-0 lg:pt-1">
            <SettingsPanel />
          </div>
        </div>

        {/* 2. Readiness strip */}
        <ReadinessStrip hostelYearId={scopedHostelYearId} />

        {/* 3. Headline cards */}
        <HeadlineCards hostelYearId={scopedHostelYearId} institutionId={scopedInstitutionId} />

        {/* 4. Block league table */}
        <BlockLeagueTable hostelYearId={scopedHostelYearId} institutionId={scopedInstitutionId} />

        {/* 5. Action panel */}
        <ActionPanel hostelYearId={scopedHostelYearId} institutionId={scopedInstitutionId} />

        {/* 6. Trend chart */}
        <TrendChart hostelYearId={scopedHostelYearId} institutionId={scopedInstitutionId} />

        {/* 7. Cost & return */}
        <CostReturnSection hostelYearId={scopedHostelYearId} institutionId={scopedInstitutionId} />

        {/* 8. Premium revenue — maximise yield per premium bed */}
        <PremiumRevenueSection hostelYearId={scopedHostelYearId} institutionId={scopedInstitutionId} />

        {/* 9. Data quality */}
        <DqCard institutionId={institutionId} />
      </div>
    </ContentLayout>
  );
}
