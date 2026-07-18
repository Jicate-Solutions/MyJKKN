'use client';

// ============================================
// /cdc/admin/dashboard — CDC Operational Dashboard (T1.3)
// ============================================
// Director-facing live metrics across all 8 institutions.
//
// Widgets (each loads independently via its own React Query hook):
//   1. KPI row (4 cards): drives in flight | pending willingness |
//                          placements YTD | overdue coordinator items
//   2. Drives by status (table — counts per cdc_drive_status bucket)
//   3. Top 5 recruiters by placement count (table)
//   4. IDP submission rate by institution (table; current academic year)
//
// Auto-refreshes every 60s while the tab is visible. No new schema, no
// new RPCs; reads existing cdc_* tables under existing RLS policies.
// ============================================

import Link from 'next/link';
import {
  Briefcase,
  Hourglass,
  GraduationCap,
  AlertCircle,
  ShieldAlert,
  ArrowLeft,
  Activity,
  Building2,
  Users2,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { useCdcAdmin } from '@/hooks/cdc/use-cdc-admin';
import {
  useCdcDashboardKpis,
  useCdcDrivesByStatus,
  useCdcTopRecruiters,
  useCdcIdpByInstitution,
} from '@/hooks/cdc/use-cdc-dashboard';

// =====================================================================================
// KPI Card subcomponent
// =====================================================================================

interface KpiCardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  isError: boolean;
  icon: React.ElementType;
  color: string;
  hint?: string;
}

function KpiCard({ label, value, isLoading, isError, icon: Icon, color, hint }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium">{label}</CardDescription>
          <div className={`rounded-md p-1.5 ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-16" />
        ) : isError ? (
          <span className="text-sm text-destructive">Error</span>
        ) : (
          <div className="text-3xl font-bold tabular-nums">{value ?? 0}</div>
        )}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// Drives-by-Status widget
// =====================================================================================

function DrivesByStatusCard() {
  const { data, isLoading, isError, error } = useCdcDrivesByStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-blue-600" />
          Drives by Status
        </CardTitle>
        <CardDescription>
          Distribution of placement drives across the lifecycle. Updated every 60s.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error)?.message ?? 'Failed to load.'}</AlertDescription>
          </Alert>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((row) => (
                <TableRow key={row.status}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {row.label}
                      {row.status === 'cancelled' && (
                        <Badge variant="outline" className="text-xs">
                          side-state
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                </TableRow>
              ))}
              {(!data || data.every((r) => r.count === 0)) && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-sm text-muted-foreground">
                    No drives recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// Top Recruiters widget
// =====================================================================================

function TopRecruitersCard() {
  const { data, isLoading, isError, error } = useCdcTopRecruiters(5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-purple-600" />
          Top Recruiters by Placement Count
        </CardTitle>
        <CardDescription>
          Top 5 companies by total placements (all-time across all 8 institutions).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error)?.message ?? 'Failed to load.'}</AlertDescription>
          </Alert>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No placements recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Recruiter</TableHead>
                <TableHead className="text-right">Placements</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, idx) => (
                <TableRow key={row.recruiterId}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.placementCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// IDP by Institution widget
// =====================================================================================

function IdpByInstitutionCard() {
  const { data, isLoading, isError, error } = useCdcIdpByInstitution();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users2 className="h-4 w-4 text-emerald-600" />
          IDP Submissions by Institution
        </CardTitle>
        <CardDescription>
          Native IDP form submissions for the current academic year. Sorted by volume.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{(error as Error)?.message ?? 'Failed to load.'}</AlertDescription>
          </Alert>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No IDP submissions for the current academic year.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead className="text-right">Submissions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={row.institutionId}>
                  <TableCell className="font-medium">{row.institutionName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.idpSubmissionsYtd}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================================
// Page
// =====================================================================================

export default function CdcDashboardPage() {
  const { isCdcAdmin, isLoading: permsLoading } = useCdcAdmin();
  const kpis = useCdcDashboardKpis();

  if (permsLoading) {
    return (
      <ContentLayout title="CDC Dashboard">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!isCdcAdmin) {
    return (
      <ContentLayout title="CDC Dashboard">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            The CDC operational dashboard requires super-admin or CDC Head role.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const kpiData = kpis.data;
  const kpiLoading = kpis.isLoading;
  const kpiError = kpis.isError;

  return (
    <ContentLayout title="CDC Dashboard">
      <PageBreadcrumb
        items={[
          { label: 'CDC', href: '/cdc' },
          { label: 'Admin', href: '/cdc/admin' },
          { label: 'Dashboard', href: '/cdc/admin/dashboard' },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operational Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Live metrics across all 8 institutions. Refreshes every 60 seconds.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/cdc/admin">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to CDC Admin
          </Link>
        </Button>
      </div>

      {/* Row 1: KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Drives in Flight"
          value={kpiData?.drivesInFlight}
          isLoading={kpiLoading}
          isError={kpiError}
          icon={Briefcase}
          color="text-blue-600 bg-blue-50"
          hint="Excludes draft, closed, cancelled"
        />
        <KpiCard
          label="Pending Willingness"
          value={kpiData?.pendingWillingness}
          isLoading={kpiLoading}
          isError={kpiError}
          icon={Hourglass}
          color="text-amber-600 bg-amber-50"
          hint="Declared 'willing' but not yet confirmed"
        />
        <KpiCard
          label="Placements YTD"
          value={kpiData?.placementsYtd}
          isLoading={kpiLoading}
          isError={kpiError}
          icon={GraduationCap}
          color="text-emerald-600 bg-emerald-50"
          hint="Created since Jan 1 (calendar year)"
        />
        <KpiCard
          label="Overdue Coordinator Items"
          value={kpiData?.overdueCoordinatorItems}
          isLoading={kpiLoading}
          isError={kpiError}
          icon={AlertCircle}
          color="text-red-600 bg-red-50"
          hint="Open items needing CDC Head attention"
        />
      </div>

      {/* Row 2: Drives by Status */}
      <div className="mt-6">
        <DrivesByStatusCard />
      </div>

      {/* Row 3: Top Recruiters */}
      <div className="mt-6">
        <TopRecruitersCard />
      </div>

      {/* Row 4: IDP by Institution */}
      <div className="mt-6">
        <IdpByInstitutionCard />
      </div>
    </ContentLayout>
  );
}
