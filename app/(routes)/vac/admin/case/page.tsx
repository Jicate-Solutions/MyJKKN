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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/hooks/use-auth';
import {
  useCASEDashboardStats,
  useAtRiskLearners,
} from '@/hooks/vac/use-case';
import type { CASEDashboardStats, AtRiskLearner, CASERiskLevel } from '@/types/case';
import {
  Target,
  Users,
  UserCheck,
  AlertTriangle,
  AlertCircle,
  Clock,
  ArrowRight,
  Layers,
  Calendar,
  ShieldAlert,
} from 'lucide-react';

// ── Risk badge colors ─────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  at_risk: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  overdue: 'bg-red-200 text-red-900 dark:bg-red-950 dark:text-red-200',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

// ── Quick Link ────────────────────────────────────────────────────────────────

function QuickLink({
  href,
  icon: Icon,
  title,
}: {
  href: string;
  icon: typeof Target;
  title: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer group">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm group-hover:text-primary transition-colors">
              {title}
            </span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CASEAdminDashboard() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  const { data: dashData, isLoading: dashLoading } =
    useCASEDashboardStats(institutionId);
  const { data: atRiskData, isLoading: atRiskLoading } =
    useAtRiskLearners(institutionId);

  const dash = dashData as CASEDashboardStats | undefined;
  const atRiskLearners = (atRiskData ?? []) as AtRiskLearner[];

  return (
    <ContentLayout title="CASE Admin">
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
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>CASE</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">CASE Administration</h1>
          <p className="text-sm text-muted-foreground">
            Manage graduation tracks, batches, and learner readiness
          </p>
        </div>

        {/* Stats */}
        {dashLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : dash ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{dash.total_learners}</p>
                  <p className="text-xs text-muted-foreground">Total Learners</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <UserCheck className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {dash.graduation_ready_count}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Graduation Ready
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="text-2xl font-bold">{dash.at_risk_count}</p>
                  <p className="text-xs text-muted-foreground">At Risk</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <AlertCircle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="text-2xl font-bold">
                    {dash.critical_count + dash.overdue_count}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Critical / Overdue
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <QuickLink
            href="/vac/admin/case/tracks"
            icon={Layers}
            title="Manage Tracks"
          />
          <QuickLink
            href="/vac/admin/case/batches"
            icon={Calendar}
            title="Manage Batches"
          />
          <QuickLink
            href="/vac/admin/case/readiness"
            icon={ShieldAlert}
            title="Graduation Readiness"
          />
        </div>

        {/* At-Risk Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              At-Risk Learners
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Programme</TableHead>
                  <TableHead className="text-center">Semester</TableHead>
                  <TableHead className="text-center">Tracks Done</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                  <TableHead className="text-center">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atRiskLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : atRiskLearners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <UserCheck className="h-8 w-8 mx-auto text-green-600 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No at-risk learners found
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  atRiskLearners.slice(0, 10).map((learner) => (
                    <TableRow key={learner.user_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {learner.user_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {learner.user_email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {learner.programme_name}
                      </TableCell>
                      <TableCell className="text-center">
                        {learner.current_semester}
                      </TableCell>
                      <TableCell className="text-center">
                        {learner.tracks_completed} / 6
                      </TableCell>
                      <TableCell className="text-center">
                        {learner.tracks_remaining}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={RISK_COLORS[learner.risk_level] || ''}
                        >
                          {learner.risk_level.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
