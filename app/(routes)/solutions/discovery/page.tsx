'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  MapPin,
  Calendar,
  Users,
  Building2,
  AlertCircle,
  Eye,
  MessageSquare,
  ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';
import { useDiscoveryVisits, useDiscoveryVisitStats } from '@/hooks/solutions/use-discovery';
import type { DiscoveryVisit } from '@/lib/services/solutions/types';

export default function DiscoveryPage() {
  const { data: visitsData, isLoading, error } = useDiscoveryVisits({ limit: 50 });
  const { data: stats } = useDiscoveryVisitStats();

  const visits = visitsData?.data || [];

  return (
    <ContentLayout title="Discovery Visits">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Discovery' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Discovery Visits</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Track client site visits and discovery sessions
            </p>
          </div>
          <Button asChild>
            <Link href="/solutions/discovery/new">
              <Plus className="mr-2 h-4 w-4" />
              Log Visit
            </Link>
          </Button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Visits</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Calendar className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.thisMonth}</p>
                  <p className="text-sm text-muted-foreground">This Month</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <MessageSquare className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.pendingFollowUp}</p>
                  <p className="text-sm text-muted-foreground">Pending Follow-up</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <Eye className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.conversionRate}%</p>
                  <p className="text-sm text-muted-foreground">Conversion Rate</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <AlertCircle className="h-10 w-10 text-destructive" />
                <div>
                  <h3 className="font-semibold">Failed to load discovery visits</h3>
                  <p className="text-sm text-muted-foreground">
                    {error instanceof Error ? error.message : 'An error occurred'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-28" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-24" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && visits.length === 0 && (
          <Card>
            <CardContent className="py-10">
              <div className="flex flex-col items-center justify-center gap-4 text-center">
                <MapPin className="h-10 w-10 text-muted-foreground" />
                <div>
                  <h3 className="font-semibold">No discovery visits yet</h3>
                  <p className="text-sm text-muted-foreground">
                    Get started by logging your first client visit
                  </p>
                </div>
                <Button asChild>
                  <Link href="/solutions/discovery/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Log Visit
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Visits List */}
        {!isLoading && !error && visits.length > 0 && (
          <div className="space-y-4">
            {visits.map((visit: DiscoveryVisit) => (
              <Card key={visit.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {(visit as any).client?.name || visit.client_id}
                        </CardTitle>
                        {visit.department_id && (
                          <CardDescription>
                            Department: {(visit as any).department?.department_name || visit.department_id}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {visit.follow_up_required && (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                          Follow-up Required
                        </Badge>
                      )}
                      {visit.visit_date && (
                        <Badge variant="outline">
                          <Calendar className="mr-1 h-3 w-3" />
                          {format(new Date(visit.visit_date), 'dd MMM yyyy')}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    {visit.visitors && Array.isArray(visit.visitors) && visit.visitors.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {visit.visitors
                            .map((v: Record<string, unknown>) => (v as { name: string }).name)
                            .join(', ')}
                        </span>
                      </div>
                    )}
                    {visit.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{visit.location}</span>
                      </div>
                    )}
                    {visit.follow_up_date && (
                      <div className="flex items-center gap-1 text-yellow-600">
                        <Calendar className="h-4 w-4" />
                        Follow-up: {format(new Date(visit.follow_up_date), 'dd MMM yyyy')}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {visit.pain_points && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Pain Points</p>
                        <p className="text-sm">{visit.pain_points}</p>
                      </div>
                    )}
                    {visit.opportunities && (
                      <div>
                        <p className="text-sm font-medium text-muted-foreground mb-1">Opportunities</p>
                        <p className="text-sm">{visit.opportunities}</p>
                      </div>
                    )}
                    {visit.observations && !visit.pain_points && !visit.opportunities && (
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-muted-foreground mb-1">Observations</p>
                        <p className="text-sm">{visit.observations}</p>
                      </div>
                    )}
                  </div>
                  {visit.notes && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm text-muted-foreground">{visit.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
