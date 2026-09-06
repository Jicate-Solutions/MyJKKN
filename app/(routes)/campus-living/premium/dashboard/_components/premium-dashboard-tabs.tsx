'use client';

// ============================================================================
// Premium Room — Dashboard Tabs
// ============================================================================
// Created: 2026-05-16
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html (decision-#14)
//
// 3 tabs:
//   1. Revenue + Adoption (Director view)
//   2. Per-college fill-rate heatmap (Ops view)
//   3. Activity log (Audit view) — Phase 1 shows empty state with
//      "wires up in Phase 2" message
// ============================================================================

import { useMemo } from 'react';

import { useTabParam } from '@/hooks/use-tab-param';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePremiumAllocationCounts } from '@/hooks/campus-living/use-premium-allocation';
import { useHostelTiers } from '@/hooks/campus-living/use-hostel-tier-policy';

const PREMIUM_DASHBOARD_TABS = ['revenue', 'heatmap', 'activity'] as const;

export function PremiumDashboardTabs() {
  const [activeTab, setActiveTab] = useTabParam('revenue', PREMIUM_DASHBOARD_TABS);
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
        <TabsTrigger value="revenue">Revenue + Adoption</TabsTrigger>
        <TabsTrigger value="heatmap">Per-college Heatmap</TabsTrigger>
        <TabsTrigger value="activity">Activity Log</TabsTrigger>
      </TabsList>

      <TabsContent value="revenue" className="space-y-4">
        <RevenueAdoptionTab />
      </TabsContent>

      <TabsContent value="heatmap" className="space-y-4">
        <PerCollegeHeatmapTab />
      </TabsContent>

      <TabsContent value="activity" className="space-y-4">
        <ActivityLogTab />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Revenue + Adoption
// ---------------------------------------------------------------------------

function RevenueAdoptionTab() {
  const counts = usePremiumAllocationCounts(null);
  const tiers = useHostelTiers(null);

  const adoptionPercent = useMemo(() => {
    if (!counts.data || counts.data.total === 0) return 0;
    return ((counts.data.premium + counts.data.premium_plus) / counts.data.total) * 100;
  }, [counts.data]);

  const projectedRevenueInr = useMemo(() => {
    // Conservative projection — assumes ₹50,000 annual standard fee and uses
    // the global tier default uplift % to estimate ₹ revenue. Phase 2 will
    // replace this with actual hostel_premium_invoices SUM once invoice
    // subsystem ships.
    if (!counts.data || !tiers.data) return 0;
    const STANDARD_BASE_INR = 50_000;
    const premiumTier = tiers.data.find((t) => t.tier_key === 'premium' && t.institution_id === null);
    const premiumPlusTier = tiers.data.find((t) => t.tier_key === 'premium_plus' && t.institution_id === null);
    const premiumUplift = (Number(premiumTier?.fee_uplift_percentage_default ?? 0) / 100) * STANDARD_BASE_INR;
    const premiumPlusUplift = (Number(premiumPlusTier?.fee_uplift_percentage_default ?? 0) / 100) * STANDARD_BASE_INR;
    return (
      counts.data.premium * premiumUplift +
      counts.data.premium_plus * premiumPlusUplift
    );
  }, [counts.data, tiers.data]);

  if (counts.isLoading || tiers.isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (counts.isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Failed to load adoption data: {counts.error?.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total hostelites</CardDescription>
            <CardTitle className="text-3xl tabular-nums">{counts.data?.total ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Active allocations across all colleges.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Premium adoption</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {adoptionPercent.toFixed(1)}%
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {(counts.data?.premium ?? 0) + (counts.data?.premium_plus ?? 0)} on premium / premium+ ·{' '}
            {counts.data?.standard ?? 0} on standard
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Projected uplift revenue</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              ₹{(projectedRevenueInr / 100000).toFixed(2)}L
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Estimated from tier default uplift × premium-tier allocations.
            Actual ₹ from invoices in Phase 2.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tier mix</CardTitle>
          <CardDescription>
            Today's distribution of hostelites across the 3 tier rows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Allocations</TableHead>
                <TableHead className="text-right">% of total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell><Badge variant="outline">standard</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{counts.data?.standard ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {counts.data?.total
                    ? (((counts.data.standard ?? 0) / counts.data.total) * 100).toFixed(1)
                    : '0.0'}%
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge variant="secondary">premium</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{counts.data?.premium ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {counts.data?.total
                    ? (((counts.data.premium ?? 0) / counts.data.total) * 100).toFixed(1)
                    : '0.0'}%
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell><Badge>premium_plus</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{counts.data?.premium_plus ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {counts.data?.total
                    ? (((counts.data.premium_plus ?? 0) / counts.data.total) * 100).toFixed(1)
                    : '0.0'}%
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Per-college heatmap
// ---------------------------------------------------------------------------

function PerCollegeHeatmapTab() {
  const { institutions, loading } = useInstitutionsWithAccess();

  if (loading) {
    return <Skeleton className="h-48" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Per-college tier fill rate</CardTitle>
        <CardDescription>
          Each row queries hostel_allocations live. Higher premium / premium+
          fill = better SKU adoption at that college.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>College</TableHead>
              <TableHead className="text-right">Standard</TableHead>
              <TableHead className="text-right">Premium</TableHead>
              <TableHead className="text-right">Premium+</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Premium %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {institutions.map((inst) => (
              <PerCollegeRow key={inst.id} institutionId={inst.id} institutionName={inst.name} />
            ))}
            {institutions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No colleges in scope.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PerCollegeRow({
  institutionId,
  institutionName,
}: {
  institutionId: string;
  institutionName: string;
}) {
  const counts = usePremiumAllocationCounts(institutionId);

  if (counts.isLoading) {
    return (
      <TableRow>
        <TableCell>{institutionName}</TableCell>
        <TableCell colSpan={5}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      </TableRow>
    );
  }

  const total = counts.data?.total ?? 0;
  const premiumPct = total === 0
    ? 0
    : (((counts.data?.premium ?? 0) + (counts.data?.premium_plus ?? 0)) / total) * 100;

  return (
    <TableRow>
      <TableCell>{institutionName}</TableCell>
      <TableCell className="text-right tabular-nums">{counts.data?.standard ?? 0}</TableCell>
      <TableCell className="text-right tabular-nums">{counts.data?.premium ?? 0}</TableCell>
      <TableCell className="text-right tabular-nums">{counts.data?.premium_plus ?? 0}</TableCell>
      <TableCell className="text-right tabular-nums">{total}</TableCell>
      <TableCell className="text-right tabular-nums">
        <Badge variant={premiumPct > 10 ? 'secondary' : 'outline'}>
          {premiumPct.toFixed(1)}%
        </Badge>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Activity log
// ---------------------------------------------------------------------------

function ActivityLogTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent premium activity</CardTitle>
        <CardDescription>
          Audit trail of premium SKU state transitions — opt-ins, room picks,
          roommate invites, payments, chief warden overrides.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">Activity log wires up in Phase 2</p>
          <p className="mt-2 text-xs text-muted-foreground">
            This tab reads from <code>audit_logs</code> with{' '}
            <code>module = 'campus_living_premium'</code>. The audit-log seed +
            notification fan-out land in Phase 2 alongside the learner-facing
            premium opt-in UI. Until then, no rows are written here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
