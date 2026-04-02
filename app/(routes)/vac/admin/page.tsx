'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { useVACOverviewStats } from '@/hooks/vac/use-vac';
import { useCASEDashboardStats } from '@/hooks/vac/use-case';
import type { VACOverviewStats } from '@/types/vac';
import type { CASEDashboardStats } from '@/types/case';
import {
  BookOpen,
  Users,
  GraduationCap,
  IndianRupee,
  BarChart3,
  Settings,
  Target,
  UserCheck,
  ArrowRight,
  TrendingUp,
  Clock,
} from 'lucide-react';

// ── Quick Link Card ──────────────────────────────────────────────────────────

function QuickLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group h-full">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  isLoading,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string | number;
  color: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${color}`} />
        <div>
          {isLoading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <p className="text-2xl font-bold">{value}</p>
          )}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VACAdminDashboard() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const { data: overviewStats, isLoading: statsLoading } =
    useVACOverviewStats(institutionId);
  const { data: caseStats, isLoading: caseLoading } =
    useCASEDashboardStats(institutionId);

  const stats = overviewStats as VACOverviewStats | undefined;
  const caseDash = caseStats as CASEDashboardStats | undefined;

  return (
    <ContentLayout title="VAC Admin">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Admin</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">VAC Administration</h1>
          <p className="text-sm text-muted-foreground">
            Manage courses, enrollments, CASE tracks, and analytics
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={BookOpen}
            label="Total Courses"
            value={stats?.total_courses ?? 0}
            color="text-primary"
            isLoading={statsLoading}
          />
          <StatCard
            icon={Users}
            label="Active Enrollments"
            value={stats?.active_enrollments ?? 0}
            color="text-green-600"
            isLoading={statsLoading}
          />
          <StatCard
            icon={GraduationCap}
            label="Total Learners"
            value={stats?.total_learners ?? 0}
            color="text-violet-600"
            isLoading={statsLoading}
          />
          <StatCard
            icon={IndianRupee}
            label="Revenue"
            value={
              stats
                ? `${(stats.total_revenue / 1000).toFixed(1)}K`
                : '0'
            }
            color="text-amber-600"
            isLoading={statsLoading}
          />
        </div>

        {/* CASE summary row */}
        {!caseLoading && caseDash && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Target}
              label="CASE Learners"
              value={caseDash.total_learners}
              color="text-blue-600"
              isLoading={false}
            />
            <StatCard
              icon={UserCheck}
              label="Graduation Ready"
              value={caseDash.graduation_ready_count}
              color="text-green-600"
              isLoading={false}
            />
            <StatCard
              icon={TrendingUp}
              label="Avg Tracks Done"
              value={caseDash.avg_tracks_completed.toFixed(1)}
              color="text-cyan-600"
              isLoading={false}
            />
            <StatCard
              icon={Clock}
              label="Avg Hours"
              value={caseDash.avg_hours_completed.toFixed(0)}
              color="text-purple-600"
              isLoading={false}
            />
          </div>
        )}

        {/* Quick Links */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Quick Access</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <QuickLinkCard
              href="/vac/admin/courses"
              icon={BookOpen}
              title="Courses"
              description="Manage course catalog and lessons"
            />
            <QuickLinkCard
              href="/vac/admin/enrollments"
              icon={Users}
              title="Enrollments"
              description="Manage student enrollments and payments"
            />
            <QuickLinkCard
              href="/vac/admin/analytics"
              icon={BarChart3}
              title="Analytics"
              description="View enrollment trends and statistics"
            />
            <QuickLinkCard
              href="/vac/admin/case"
              icon={Target}
              title="CASE Admin"
              description="Tracks, batches, and graduation readiness"
            />
            <QuickLinkCard
              href="/vac/admin/settings"
              icon={Settings}
              title="Settings"
              description="Module configuration and preferences"
            />
          </div>
        </div>

        {/* Recent Activity Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2" />
              <p className="text-sm">Activity feed coming soon</p>
              <p className="text-xs mt-1">
                Recent enrollments, completions, and admin actions will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
