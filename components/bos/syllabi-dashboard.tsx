'use client';

import React from 'react';
import { useSyllabusMetrics, useSyllabusHealthCheck } from '@/hooks/bos/use-syllabi-metrics';
import { useBosPermissions } from '@/hooks/bos/use-bos-permissions';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  BookOpen,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface SyllabihDashboardProps {
  institutionsId: string;
}

export function SyllabiDashboard({ institutionsId }: SyllabihDashboardProps) {
  const router = useRouter();
  const permissions = useBosPermissions();
  const { data: metrics, isLoading: metricsLoading } = useSyllabusMetrics(institutionsId);
  const { data: health, isLoading: healthLoading } = useSyllabusHealthCheck(institutionsId);

  const streams = Object.entries(metrics?.byStream ?? {})
    .sort(([, a], [, b]) => b - a);
  const regulations = Object.entries(metrics?.byRegulation ?? {})
    .sort(([, a], [, b]) => b - a);

  if (!permissions.canView) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          You do not have permission to view the syllabi dashboard. Please contact your administrator.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Syllabi */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Syllabi</p>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className="text-3xl font-bold mt-2">{metrics?.totalSyllabi ?? 0}</p>
                )}
              </div>
              <BookOpen className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        {/* Avg Revisions */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Avg Revisions</p>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className="text-3xl font-bold mt-2">
                    {metrics?.averageRevisionsPerCourse.toFixed(1) ?? 0}
                  </p>
                )}
              </div>
              <TrendingUp className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>

        {/* Incomplete Syllabi */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Incomplete</p>
                {metricsLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className={`text-3xl font-bold mt-2 ${
                    (metrics?.incompleteCount ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'
                  }`}>
                    {metrics?.incompleteCount ?? 0}
                  </p>
                )}
              </div>
              {(metrics?.incompleteCount ?? 0) > 0 ? (
                <AlertTriangle className="h-8 w-8 text-amber-500/30" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-green-500/30" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Health Issues */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Health Issues</p>
                {healthLoading ? (
                  <Skeleton className="h-8 w-16 mt-2" />
                ) : (
                  <p className={`text-3xl font-bold mt-2 ${
                    (health?.totalIssues ?? 0) > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {health?.totalIssues ?? 0}
                  </p>
                )}
              </div>
              <AlertCircle className="h-8 w-8 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Health Alerts ──────────────────────────────────────── */}
      {!healthLoading && (health?.totalIssues ?? 0) > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">{health?.totalIssues} data quality issues found</p>
              <ul className="text-sm space-y-1">
                {(health?.missingObjectives?.length ?? 0) > 0 && (
                  <li>• {health?.missingObjectives?.length} syllabi missing course objectives</li>
                )}
                {(health?.missingLearningOutcomes?.length ?? 0) > 0 && (
                  <li>• {health?.missingLearningOutcomes?.length} syllabi missing learning outcomes</li>
                )}
                {(health?.missingContent?.length ?? 0) > 0 && (
                  <li>• {health?.missingContent?.length} syllabi missing course content</li>
                )}
                {(health?.missingMappings?.length ?? 0) > 0 && (
                  <li>• {health?.missingMappings?.length} syllabi missing PO mappings</li>
                )}
              </ul>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── By Stream ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Stream</CardTitle>
            <CardDescription>Course distribution across programs</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : streams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <div className="space-y-2">
                {streams.map(([stream, count]) => (
                  <div key={stream} className="flex items-center justify-between">
                    <span className="text-sm">{stream}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── By Regulation ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By Regulation</CardTitle>
            <CardDescription>Courses across regulations</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : regulations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <div className="space-y-2">
                {regulations.slice(0, 5).map(([regId, count]) => (
                  <div key={regId} className="flex items-center justify-between">
                    <span className="text-sm truncate">{regId}</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Revision Distribution ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revisions</CardTitle>
            <CardDescription>Version distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {metricsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (metrics?.revisionDistribution ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No data</p>
            ) : (
              <div className="space-y-2">
                {metrics?.revisionDistribution?.map((item) => (
                  <div key={item.version} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm">v{item.version}</span>
                        <span className="text-xs text-muted-foreground">{item.count}</span>
                      </div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500"
                          style={{
                            width: `${Math.max(
                              10,
                              (item.count / (metrics?.totalSyllabi ?? 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Recently Modified ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recently Modified</CardTitle>
              <CardDescription>Last 10 updated syllabi</CardDescription>
            </div>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          {metricsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (metrics?.recentlyModified ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No syllabi yet</p>
          ) : (
            <div className="space-y-2">
              {metrics?.recentlyModified?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => router.push(`/bos/syllabi/${item.id}/edit`)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm group-hover:underline">
                      {item.courseCode}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.courseName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Badge variant="outline" className="text-xs">
                      {item.stream}
                    </Badge>
                    <p className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(item.lastModified), 'MMM d')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Quick Actions ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => router.push('/bos/syllabi/new')}
            disabled={!permissions.canCreate}
            title={permissions.canCreate ? '' : 'You do not have permission to create syllabi'}
          >
            Create New Syllabus
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/bos/syllabi?incomplete=true')}
            disabled={!permissions.canView}
            title={permissions.canView ? '' : 'You do not have permission to view syllabi'}
          >
            Review Incomplete
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/bos/taxonomy')}
            disabled={!permissions.canManageTaxonomy}
            title={permissions.canManageTaxonomy ? '' : 'You do not have permission to manage taxonomy'}
          >
            Manage Taxonomy
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
