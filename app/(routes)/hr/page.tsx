'use client';

/**
 * HR Command Center — Sprint 6 live dashboard.
 *
 * Replaces the Sprint 1 stub. Renders role-adapted quadrants (decision #16):
 *   - HR Officer (daily):   4 operational quadrants
 *   - Director (weekly):    4 strategic quadrants
 *   - Super admin:          11-institution grid by default, with a header
 *                           toggle to switch to a rolled-up Director view
 *
 * Non-HR users land here via /hr route — we render a redirect-with-toast per
 * decision #13 (page-level UX; the API also returns 403 so nothing leaks).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  LayoutDashboard,
  Layers,
  RefreshCw,
  Building2,
  Users,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useHRDashboard, logDashboardAccess } from '@/hooks/hr/use-hr-dashboard';
import { QuadrantCard, QuadrantCardSkeleton } from '@/features/hr/dashboard/quadrant-card';
import { InstitutionGrid, InstitutionGridSkeleton } from '@/features/hr/dashboard/institution-grid';
import { DashboardBanners } from '@/features/hr/dashboard/banners';
import type { DashboardMode } from '@/types/hr-dashboard';

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  } catch {
    return '—';
  }
}

export default function HRCommandCenterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<DashboardMode>('institution-grid');
  const { data, isLoading, isFetching, isError, error, refetch } = useHRDashboard(mode);

  // --- Audit log: one POST per successful payload render (decision #18) ---
  useEffect(() => {
    if (data && !isLoading) {
      void logDashboardAccess(data);
    }
  }, [data, isLoading]);

  // --- Route-level 403 handler → redirect-with-toast (decision #13) ---
  useEffect(() => {
    if (isError && error instanceof Error && /403|Forbidden/i.test(error.message)) {
      toast.error('HR dashboard is restricted to HR staff.', {
        description: 'Redirecting to your main dashboard.',
        duration: 4000,
      });
      router.replace('/dashboard');
    }
  }, [isError, error, router]);

  const isSuperAdmin = data?.viewer_role === 'super_admin';
  const showGrid = isSuperAdmin && mode === 'institution-grid';
  const roleLabel = useMemo(() => {
    if (!data) return '';
    switch (data.viewer_role) {
      case 'super_admin':
        return 'Super Admin';
      case 'hr_officer':
        return 'HR Officer';
      case 'director':
        return 'Director';
    }
  }, [data]);

  return (
    <ContentLayout title="HR — Central Command Center">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>HR</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        {/* --- Header --- */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">HR Command Center</h1>
              {data && (
                <Badge variant="outline" className="text-xs">
                  {roleLabel}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Live posture across leave, workforce, and compliance.{' '}
              {data?.fiscal_year && (
                <span>
                  FY <strong>{data.fiscal_year.label}</strong> ·{' '}
                </span>
              )}
              {data?.generated_at && (
                <span className="font-mono text-xs">
                  updated {formatGeneratedAt(data.generated_at)} IST
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Super admin mode toggle (decision #17) */}
            {isSuperAdmin && (
              <div className="inline-flex rounded-md border">
                <Button
                  variant={mode === 'institution-grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('institution-grid')}
                  className="rounded-r-none h-8"
                >
                  <Layers className="mr-2 h-3.5 w-3.5" />
                  11 Institutions
                </Button>
                <Button
                  variant={mode === 'rolled-up' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMode('rolled-up')}
                  className="rounded-l-none h-8"
                >
                  <LayoutDashboard className="mr-2 h-3.5 w-3.5" />
                  Rolled-up
                </Button>
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* --- Cross-module CTAs (kept from Sprint 1; still useful) --- */}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/staff/list">
              <Users className="mr-2 h-3.5 w-3.5" />
              Full-Time Staff
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/hr/employees">
              <UsersRound className="mr-2 h-3.5 w-3.5" />
              Non-Staff Workforce
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/hr/leave">
              <Building2 className="mr-2 h-3.5 w-3.5" />
              Leave Workflow
            </Link>
          </Button>
        </div>

        {/* --- Error (non-403 errors render inline; 403 triggers redirect above) --- */}
        {isError && error instanceof Error && !/403|Forbidden/i.test(error.message) && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <p className="font-semibold">Dashboard failed to load.</p>
              <p className="text-xs mt-1 font-mono break-all">{error.message}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* --- Banners (today-holiday + FY-end prompt) --- */}
        {data && <DashboardBanners banners={data.banners} />}

        {/* --- Body --- */}
        {isLoading && !data ? (
          showGrid ? (
            <InstitutionGridSkeleton />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <QuadrantCardSkeleton />
              <QuadrantCardSkeleton />
              <QuadrantCardSkeleton />
              <QuadrantCardSkeleton />
            </div>
          )
        ) : data ? (
          showGrid && data.institution_cards.length > 0 ? (
            <InstitutionGrid cards={data.institution_cards} />
          ) : data.quadrants.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {data.quadrants.map((q) => (
                <QuadrantCard key={q.id} quadrant={q} />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              <p className="font-medium">All caught up.</p>
              <p className="text-xs mt-1">
                No HR events require attention right now. Dashboard refreshes
                automatically when new leave applications are submitted.
              </p>
            </div>
          )
        ) : null}
      </div>
    </ContentLayout>
  );
}
