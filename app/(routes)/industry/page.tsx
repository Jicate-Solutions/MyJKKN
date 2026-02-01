'use client';

// ============================================================================
// Industry Integration - Dashboard Page
// Overview of industry partnerships, mentors, projects, and engagements
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryStats, usePartnerSummaries } from '@/hooks/industry';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import Link from 'next/link';
import {
  Handshake,
  Users,
  Target,
  UserCheck,
  TrendingUp,
  Plus,
  ArrowRight,
  Building2,
  Briefcase
} from 'lucide-react';

// ============================================================================
// STATS CARD COMPONENT
// ============================================================================

function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  loading = false,
  href
}: {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  loading?: boolean;
  href?: string;
}) {
  const content = (
    <Card className={href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold">{value}</p>
            )}
            <p className="text-sm text-muted-foreground">{title}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {href && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ============================================================================
// PARTNER CARD COMPONENT
// ============================================================================

function PartnerCard({
  name,
  sector,
  type,
  mentorsCount,
  projectsCount
}: {
  name: string;
  sector: string | null;
  type: string | null;
  mentorsCount: number;
  projectsCount: number;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium">{name}</p>
            <p className="text-sm text-muted-foreground">{sector || 'No sector'}</p>
          </div>
          {type && (
            <Badge variant="outline" className="capitalize">
              {type.replace('_', ' ')}
            </Badge>
          )}
        </div>
        <div className="flex gap-4 mt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {mentorsCount} mentors
          </span>
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            {projectsCount} projects
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function IndustryDashboardPage() {
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const { data: stats, isLoading: statsLoading } = useIndustryStats(institutionId);
  const { data: partnerSummaries, isLoading: partnersLoading } = usePartnerSummaries(institutionId);

  return (
    <PermissionGuard module="industry" action="view">
      <ContentLayout title="Industry Connect">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Industry Connect</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header with actions */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Industry Integration</h2>
              <p className="text-muted-foreground">
                Manage partnerships, mentors, projects, and learner engagements
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/industry/partners/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Partner
                </Link>
              </Button>
              <Button asChild>
                <Link href="/industry/projects/new">
                  <Plus className="h-4 w-4 mr-2" />
                  New Project
                </Link>
              </Button>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatsCard
              title="Industry Partners"
              value={stats?.total_partners || 0}
              description={`${stats?.active_partners || 0} active`}
              icon={Handshake}
              loading={statsLoading}
              href="/industry/partners"
            />
            <StatsCard
              title="Mentors"
              value={stats?.total_mentors || 0}
              description={`${stats?.active_mentors || 0} active`}
              icon={Users}
              loading={statsLoading}
              href="/industry/mentors"
            />
            <StatsCard
              title="Projects"
              value={stats?.total_projects || 0}
              description={`${stats?.open_projects || 0} open`}
              icon={Target}
              loading={statsLoading}
              href="/industry/projects"
            />
            <StatsCard
              title="Engagements"
              value={stats?.total_engagements || 0}
              description={`${stats?.active_engagements || 0} active`}
              icon={UserCheck}
              loading={statsLoading}
              href="/industry/engagements"
            />
          </div>

          {/* Distribution Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Partnership Types */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Partnership Types</CardTitle>
                <CardDescription>Distribution by partnership category</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {stats?.by_partnership_type && Object.entries(stats.by_partnership_type).map(([type, count]) => (
                      <div key={type} className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {type.replace('_', ' ')}
                        </Badge>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                    {(!stats?.by_partnership_type || Object.keys(stats.by_partnership_type).length === 0) && (
                      <p className="text-sm text-muted-foreground">No partnerships yet</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Project Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Project Status</CardTitle>
                <CardDescription>Current status of all projects</CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-3/4" />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {stats?.by_project_status && Object.entries(stats.by_project_status).map(([status, count]) => (
                      <div key={status} className="flex items-center gap-2">
                        <Badge
                          className={
                            status === 'open' ? 'bg-green-100 text-green-800' :
                            status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                            status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                            status === 'draft' ? 'bg-gray-100 text-gray-800' :
                            'bg-amber-100 text-amber-800'
                          }
                        >
                          {status.replace('_', ' ')}
                        </Badge>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                    {(!stats?.by_project_status || Object.keys(stats.by_project_status).length === 0) && (
                      <p className="text-sm text-muted-foreground">No projects yet</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Partners */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Industry Partners</CardTitle>
                <CardDescription>Active partnerships with organizations</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/industry/partners">
                  View All
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {partnersLoading ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : partnerSummaries && partnerSummaries.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {partnerSummaries.slice(0, 6).map((partner) => (
                    <PartnerCard
                      key={partner.id}
                      name={partner.company_name}
                      sector={partner.industry_sector}
                      type={partner.partnership_type}
                      mentorsCount={partner.mentors_count}
                      projectsCount={partner.projects_count}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No industry partners yet</p>
                  <Button className="mt-4" asChild>
                    <Link href="/industry/partners/new">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Your First Partner
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-4">
            <Link href="/industry/partners/new">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Handshake className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Add Partner</p>
                      <p className="text-sm text-muted-foreground">Register new industry partner</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/industry/mentors/new">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-100">
                      <Users className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium">Add Mentor</p>
                      <p className="text-sm text-muted-foreground">Register industry mentor</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/industry/projects/new">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-green-100">
                      <Target className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">Create Project</p>
                      <p className="text-sm text-muted-foreground">Post new industry project</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/industry/engagements/new">
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-100">
                      <UserCheck className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-medium">New Engagement</p>
                      <p className="text-sm text-muted-foreground">Assign learner to project</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
