'use client';

// ============================================================================
// Competency Catalog - List Page
// Main listing of all competencies with filters and actions
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
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { CompetencyTable } from './_components/competency-table';
import { useCompetencyStats } from '@/hooks/competency';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  Award,
  BookOpen,
  Briefcase,
  Users,
  TrendingUp
} from 'lucide-react';

// ============================================================================
// STATS CARD COMPONENT
// ============================================================================

function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  loading = false
}: {
  title: string;
  value: number | string;
  description?: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-full bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
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
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CompetencyCatalogPage() {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || '';

  const { data: stats, isLoading: statsLoading } = useCompetencyStats(institutionId);

  // Show loading while institutions are being fetched
  const isLoadingData = institutionsLoading || statsLoading;

  return (
    <PermissionGuard module="competency.catalog" action="view">
      <ContentLayout title="Competency Catalog">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/academic">Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Competency Catalog</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <StatsCard
              title="Total Competencies"
              value={stats?.total_competencies || 0}
              icon={Award}
              loading={isLoadingData}
            />
            <StatsCard
              title="Active"
              value={stats?.active_count || 0}
              description={`${stats?.inactive_count || 0} archived`}
              icon={TrendingUp}
              loading={isLoadingData}
            />
            <StatsCard
              title="Mapped to Programs"
              value={stats?.mapped_to_programs || 0}
              icon={BookOpen}
              loading={isLoadingData}
            />
            <StatsCard
              title="Mapped to Courses"
              value={stats?.mapped_to_courses || 0}
              icon={Briefcase}
              loading={isLoadingData}
            />
          </div>

          {/* Type Distribution */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Competency Distribution by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800">Technical</Badge>
                    <span className="text-sm font-medium">{stats.by_type?.technical || 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-purple-100 text-purple-800">Behavioral</Badge>
                    <span className="text-sm font-medium">{stats.by_type?.behavioral || 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-100 text-amber-800">Domain</Badge>
                    <span className="text-sm font-medium">{stats.by_type?.domain || 0}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-100 text-emerald-800">Soft Skill</Badge>
                    <span className="text-sm font-medium">{stats.by_type?.soft_skill || 0}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Main Data Table */}
          <CompetencyTable />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
