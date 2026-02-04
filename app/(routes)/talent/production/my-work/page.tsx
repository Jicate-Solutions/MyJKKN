'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Clock,
  CheckCircle,
  Upload,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useProductionProfile,
  useMyWork,
} from '@/hooks/solutions/use-production-portal';

function getStatusBadge(status: string) {
  switch (status) {
    case 'in_progress':
      return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
    case 'review':
      return <Badge className="bg-yellow-100 text-yellow-800">Under Review</Badge>;
    case 'revision':
      return <Badge className="bg-orange-100 text-orange-800">Needs Revision</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
    case 'delivered':
      return <Badge variant="secondary">Delivered</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface MyDeliverable {
  id: string;
  role: string;
  deliverable?: {
    id: string;
    title: string;
    status: string;
    file_url: string | null;
    notes: string | null;
    revision_count: number;
    order?: {
      title: string;
      due_date: string | null;
    };
  };
}

export default function MyWorkPage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Get production learner profile
  const { data: productionProfile, isLoading: profileLoading } = useProductionProfile(profile?.id || '');
  const learnerId = productionProfile?.id;

  // Get my work
  const { data: assignments, isLoading: workLoading } = useMyWork(learnerId || '');

  const isLoading = authLoading || profileLoading || workLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!productionProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your production learner profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const typedAssignments = (assignments || []) as MyDeliverable[];

  const inProgress = typedAssignments.filter((d) => d.deliverable?.status === 'in_progress');
  const inReview = typedAssignments.filter((d) => d.deliverable?.status === 'review');
  const needsRevision = typedAssignments.filter((d) => d.deliverable?.status === 'revision');
  const completed = typedAssignments.filter((d) =>
    ['approved', 'delivered'].includes(d.deliverable?.status || '')
  );

  const renderDeliverableCard = (item: MyDeliverable) => {
    const d = item.deliverable;
    if (!d) return null;

    return (
      <Card key={item.id}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{d.title}</CardTitle>
              <CardDescription>
                {(d.order as Record<string, unknown>)?.title as string || 'Order'}
              </CardDescription>
            </div>
            {getStatusBadge(d.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {(d.order as Record<string, unknown>)?.due_date
                ? `Due: ${new Date((d.order as Record<string, unknown>).due_date as string).toLocaleDateString()}`
                : 'No deadline'}
            </span>
            {d.revision_count > 0 && (
              <span className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                {d.revision_count} revision(s)
              </span>
            )}
          </div>

          {d.notes && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {d.notes}
            </p>
          )}

          <div className="flex gap-2">
            {d.status === 'in_progress' && (
              <Button asChild className="flex-1">
                <Link href={`/talent/production/submit/${d.id}`}>
                  <Upload className="h-4 w-4 mr-2" />
                  Submit Work
                </Link>
              </Button>
            )}
            {d.status === 'revision' && (
              <Button asChild className="flex-1" variant="outline">
                <Link href={`/talent/production/submit/${d.id}`}>
                  <Upload className="h-4 w-4 mr-2" />
                  Submit Revision
                </Link>
              </Button>
            )}
            {d.file_url && (
              <Button variant="outline" asChild>
                <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Work</h1>
        <p className="text-muted-foreground">
          Track and manage your assigned deliverables
        </p>
      </div>

      <Tabs defaultValue="in-progress">
        <TabsList>
          <TabsTrigger value="in-progress">
            In Progress ({inProgress.length})
          </TabsTrigger>
          <TabsTrigger value="review">
            Under Review ({inReview.length})
          </TabsTrigger>
          <TabsTrigger value="revision">
            Needs Revision ({needsRevision.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Completed ({completed.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="in-progress" className="mt-6">
          {inProgress.length > 0 ? (
            <div className="space-y-4">
              {inProgress.map(renderDeliverableCard)}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No work in progress</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="review" className="mt-6">
          {inReview.length > 0 ? (
            <div className="space-y-4">
              {inReview.map(renderDeliverableCard)}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No work under review</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="revision" className="mt-6">
          {needsRevision.length > 0 ? (
            <div className="space-y-4">
              {needsRevision.map(renderDeliverableCard)}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <p className="text-muted-foreground">No revisions needed</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          {completed.length > 0 ? (
            <div className="space-y-4">
              {completed.map(renderDeliverableCard)}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No completed work yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
