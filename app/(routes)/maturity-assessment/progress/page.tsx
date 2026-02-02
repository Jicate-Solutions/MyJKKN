/**
 * Maturity Assessment Progress Page
 *
 * Displays all improvement action items across assessments,
 * grouped by dimension with filtering and status management.
 */

import { Suspense } from 'react';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  Filter
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TableSkeleton } from '@/components/Loading';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { MaturityAssessmentService } from '@/lib/services/maturity-assessment/maturity-assessment-service';
import type {
  MaturityProgressItem,
  ProgressStatus,
  MaturityDimensionName
} from '@/types/maturity-assessment';
import { MATURITY_DIMENSIONS, MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';

interface SearchParams {
  dimension?: string;
  status?: string;
}

interface ProgressPageProps {
  searchParams: Promise<SearchParams>;
}

const statusConfig: Record<
  ProgressStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-800', icon: Clock },
  in_progress: {
    label: 'In Progress',
    color: 'bg-blue-100 text-blue-800',
    icon: Clock
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-800',
    icon: CheckCircle2
  },
  blocked: {
    label: 'Blocked',
    color: 'bg-red-100 text-red-800',
    icon: Ban
  }
};

async function getProgressData(institutionId: string, filters: SearchParams) {
  try {
    const result = await MaturityAssessmentService.getProgressItems({
      dimension: filters.dimension as MaturityDimensionName | undefined,
      status: filters.status as ProgressStatus | undefined
    });

    return result.data || [];
  } catch (error) {
    console.error('[progress/page] Error fetching progress items:', error);
    return [];
  }
}

function ProgressItemCard({ item }: { item: MaturityProgressItem }) {
  const config = statusConfig[item.status];
  const StatusIcon = config.icon;
  const isOverdue =
    item.status !== 'completed' &&
    item.due_date &&
    new Date(item.due_date) < new Date();

  return (
    <Card className={isOverdue ? 'border-red-300' : ''}>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Action Item */}
          <div>
            <h3 className="font-medium text-base">{item.action_item}</h3>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline" className="text-xs">
              {item.dimension}
            </Badge>

            <div className="flex items-center gap-1 text-muted-foreground">
              <span>Target: Stage {item.target_stage}</span>
              <span className="text-xs">
                ({MATURITY_STAGE_NAMES[item.target_stage]})
              </span>
            </div>

            {item.due_date && (
              <div
                className={`flex items-center gap-1 ${
                  isOverdue ? 'text-red-600' : 'text-muted-foreground'
                }`}
              >
                <Calendar className="h-3 w-3" />
                <span>Due: {format(new Date(item.due_date), 'MMM d, yyyy')}</span>
                {isOverdue && <AlertTriangle className="h-4 w-4 ml-1" />}
              </div>
            )}
          </div>

          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <Badge className={config.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>

            {item.assessment && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/maturity-assessment/${item.assessment_id}`}>
                  View Assessment
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            )}
          </div>

          {/* Notes */}
          {item.notes && (
            <div className="text-sm text-muted-foreground pt-2 border-t">
              <p className="italic">{item.notes}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressStats({ items }: { items: MaturityProgressItem[] }) {
  const stats = {
    total: items.length,
    completed: items.filter((i) => i.status === 'completed').length,
    inProgress: items.filter((i) => i.status === 'in_progress').length,
    pending: items.filter((i) => i.status === 'pending').length,
    blocked: items.filter((i) => i.status === 'blocked').length,
    overdue: items.filter(
      (i) =>
        i.status !== 'completed' && i.due_date && new Date(i.due_date) < new Date()
    ).length
  };

  const completionRate =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
      <Card>
        <CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Actions</div>
        </CardContent>
      </Card>

      <Card className="bg-green-50">
        <CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-muted-foreground mt-1">Completed</div>
        </CardContent>
      </Card>

      <Card className="bg-blue-50">
        <CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-blue-600">{stats.inProgress}</div>
          <div className="text-xs text-muted-foreground mt-1">In Progress</div>
        </CardContent>
      </Card>

      <Card className="bg-gray-50">
        <CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-gray-600">{stats.pending}</div>
          <div className="text-xs text-muted-foreground mt-1">Pending</div>
        </CardContent>
      </Card>

      <Card className="bg-red-50">
        <CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-red-600">{stats.blocked}</div>
          <div className="text-xs text-muted-foreground mt-1">Blocked</div>
        </CardContent>
      </Card>

      <Card className="bg-orange-50">
        <CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-orange-600">{stats.overdue}</div>
          <div className="text-xs text-muted-foreground mt-1">Overdue</div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function ProgressPage({ searchParams }: ProgressPageProps) {
  const params = await searchParams;
  const { profile } = await getEnhancedUserProfile();

  const institutionId = profile?.institution_id;

  if (!institutionId) {
    return (
      <ContentLayout title="Progress Tracking">
        <div className="flex items-center justify-center min-h-[400px]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                You need to be assigned to an institution to view progress items.
              </p>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const items = await getProgressData(institutionId, params);

  // Group by dimension
  const groupedItems = items.reduce(
    (acc, item) => {
      if (!acc[item.dimension]) {
        acc[item.dimension] = [];
      }
      acc[item.dimension].push(item);
      return acc;
    },
    {} as Record<MaturityDimensionName, MaturityProgressItem[]>
  );

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <Suspense fallback={<TableSkeleton rows={1} columns={6} />}>
        <ProgressStats items={items} />
      </Suspense>

      {/* Filter Tabs by Status */}
      <Tabs defaultValue={params.status || 'all'} className="space-y-6">
        <TabsList>
          <TabsTrigger value="all" asChild>
            <Link href="/maturity-assessment/progress">All</Link>
          </TabsTrigger>
          <TabsTrigger value="pending" asChild>
            <Link href="/maturity-assessment/progress?status=pending">Pending</Link>
          </TabsTrigger>
          <TabsTrigger value="in_progress" asChild>
            <Link href="/maturity-assessment/progress?status=in_progress">
              In Progress
            </Link>
          </TabsTrigger>
          <TabsTrigger value="blocked" asChild>
            <Link href="/maturity-assessment/progress?status=blocked">Blocked</Link>
          </TabsTrigger>
          <TabsTrigger value="completed" asChild>
            <Link href="/maturity-assessment/progress?status=completed">
              Completed
            </Link>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={params.status || 'all'}>
          {items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No improvement actions found.</p>
                <Button asChild className="mt-4">
                  <Link href="/maturity-assessment">Go to Dashboard</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {/* Grouped by Dimension */}
              {MATURITY_DIMENSIONS.filter((dim) => groupedItems[dim]?.length > 0).map(
                (dimension) => (
                  <div key={dimension}>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-xl font-semibold">{dimension}</h2>
                      <Badge variant="outline">
                        {groupedItems[dimension].length} action
                        {groupedItems[dimension].length !== 1 ? 's' : ''}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {groupedItems[dimension].map((item) => (
                        <ProgressItemCard key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
