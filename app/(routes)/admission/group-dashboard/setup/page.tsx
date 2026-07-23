'use client';

/**
 * ARPS Phase 2B — Cycle Setup
 *
 * Admin form for populating the Phase 2A substrate tables. Director sets
 * revenue targets per institution × cycle year (target_admits +
 * target_yield_per_seat → derived revenue). Bursar/Finance sets cost
 * baseline (fixed_operating_cost + marketing_budget_allocated → total).
 *
 * Phase 2E (next) will add per-role guards — Director sees both tabs,
 * Bursar sees only Cost Baseline, Principals see their own institution
 * scoped. For now this is Director-only via a coarse permission gate
 * (the ARPS Pace tab itself already lives behind admission.group_dashboard).
 */

import { Save, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Suspense } from 'react';
import Link from 'next/link';
import { useTabParam } from '@/hooks/use-tab-param';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useArpsCycleSetup,
  type ArpsCycleSetupRow,
} from '@/hooks/admission/use-arps-cycle-setup';
import { RevenueTargetsForm } from './_components/revenue-targets-form';
import { CostBaselineForm } from './_components/cost-baseline-form';

export const navMeta = {
  invokedFrom: '/admission/group-dashboard',
} as const;

const SETUP_TABS = ['revenue', 'cost'] as const;

function CycleSetupPageInner() {
  const { data: rows, isLoading, error } = useArpsCycleSetup();
  const [tab, setTab] = useTabParam('revenue', SETUP_TABS);

  return (
    <PermissionGuard module="admission.group_dashboard" action="view">
      <ContentLayout title="ARPS Cycle Setup">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admission/group-dashboard">Group Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Cycle Setup</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="space-y-4 mt-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>What this is for</AlertTitle>
            <AlertDescription className="text-sm">
              Director-locked 2026-06-07 in the 6-section strategy interview.
              Enter per-institution per-cycle revenue targets and cost baseline
              numbers. The Pace tab on the parent dashboard projects actual
              vs target using these once populated. Empty cells mean "no
              target locked yet" — the dashboard falls back to "show fill %
              only" for those rows.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load setup data</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          )}

          {isLoading ? (
            <SetupSkeleton />
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="revenue">Revenue Targets</TabsTrigger>
                <TabsTrigger value="cost">Cost Baseline</TabsTrigger>
              </TabsList>

              <TabsContent value="revenue" className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Revenue Targets
                  </span>{' '}
                  — what you intend to achieve per institution per cycle. The
                  Pace dashboard uses this to compute projected-shortfall
                  alerts. Director-owned.
                </p>
                <RevenueTargetsForm rows={rows ?? []} />
                <Stats rows={rows ?? []} stat="revenue" />
              </TabsContent>

              <TabsContent value="cost" className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Cost Baseline
                  </span>{' '}
                  — what the institution costs to run per cycle. The Pace
                  dashboard uses this to compute the "covered ÷ at risk"
                  ratio. Bursar/Finance-owned.
                </p>
                <CostBaselineForm rows={rows ?? []} />
                <Stats rows={rows ?? []} stat="cost" />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function CycleSetupPage() {
  return (
    <Suspense fallback={null}>
      <CycleSetupPageInner />
    </Suspense>
  );
}

function Stats({
  rows,
  stat,
}: {
  rows: ArpsCycleSetupRow[];
  stat: 'revenue' | 'cost';
}) {
  const isRevenue = stat === 'revenue';
  const populated = rows.filter((r) =>
    isRevenue
      ? r.target_admits !== null || r.target_yield_per_seat !== null
      : r.fixed_operating_cost !== null ||
        r.marketing_budget_allocated !== null,
  ).length;
  return (
    <Card className="border-stone-200">
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2 text-sm">
          {populated === rows.length ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          ) : (
            <Save className="h-4 w-4 text-stone-500" />
          )}
          <span className="text-stone-700">
            <strong>{populated}</strong> of <strong>{rows.length}</strong> cells
            populated
          </span>
        </div>
        <span className="text-xs text-stone-500">
          Empty cells render the Pace tab in "fill % only" fallback mode.
        </span>
      </CardContent>
    </Card>
  );
}

function SetupSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-[420px] w-full" />
    </div>
  );
}
