'use client';

/**
 * My Leave/OnDuty Applications Page
 *
 * Allows learners to:
 * - View all their applications
 * - Filter by status
 * - View application details
 * - Cancel pending applications
 *
 * @route /learners/leave-onduty/my-applications
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  useMyLeaveOndutyApplications,
  useCancelLeaveOndutyApplication,
} from '@/hooks/academic/use-leave-onduty';
import { ApplicationStatus, APPLICATION_STATUS_COLORS } from '@/types/leave-onduty';
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
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ApprovalTimeline } from '@/components/academic/leave-onduty/approval-timeline';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  FileText,
  Calendar,
  Clock,
  AlertCircle,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function MyApplicationsPage() {
  const { profile } = useAuth();
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus | 'all'>('all');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  const { data: applications, isLoading, error } = useMyLeaveOndutyApplications(
    profile?.learner_id || '',
    selectedStatus === 'all' ? {} : { status: selectedStatus }
  );

  const cancelApplication = useCancelLeaveOndutyApplication();

  const handleCancelApplication = async (applicationId: string) => {
    if (!confirm('Are you sure you want to cancel this application?')) {
      return;
    }

    cancelApplication.mutate(
      {
        applicationId,
        learnerId: profile?.learner_id || '',
      },
      {
        onSuccess: () => {
          setSelectedApplicationId(null);
        },
      }
    );
  };

  const filteredApplications = applications || [];

  const getStatusCounts = () => {
    if (!applications) return { all: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };

    return {
      all: applications.length,
      pending: applications.filter((a) => a.status === 'pending').length,
      approved: applications.filter((a) => a.status === 'approved').length,
      rejected: applications.filter((a) => a.status === 'rejected').length,
      cancelled: applications.filter((a) => a.status === 'cancelled').length,
    };
  };

  const counts = getStatusCounts();
  const selectedApplication = applications?.find((a) => a.id === selectedApplicationId);

  if (isLoading) {
    return (
      <ContentLayout title="My Applications">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title="My Applications">
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load applications. Please try again.</AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="My Applications">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/learners">Learners</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Leave/OnDuty Applications</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            My Leave/OnDuty Applications
          </h2>
          <Link href="/learners/leave-onduty/apply">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Application
            </Button>
          </Link>
        </div>

      <Tabs value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            All
            {counts.all > 0 && (
              <span className="ml-2 rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs">
                {counts.all}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Pending
            {counts.pending > 0 && (
              <span className="ml-2 rounded-full bg-yellow-200 dark:bg-yellow-900/50 px-2 py-0.5 text-xs">
                {counts.pending}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved
            {counts.approved > 0 && (
              <span className="ml-2 rounded-full bg-green-200 dark:bg-green-900/50 px-2 py-0.5 text-xs">
                {counts.approved}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected
            {counts.rejected > 0 && (
              <span className="ml-2 rounded-full bg-red-200 dark:bg-red-900/50 px-2 py-0.5 text-xs">
                {counts.rejected}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled
            {counts.cancelled > 0 && (
              <span className="ml-2 rounded-full bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs">
                {counts.cancelled}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedStatus} className="space-y-4">
          {filteredApplications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 text-center">
                  No applications found
                </p>
                <Link href="/learners/leave-onduty/apply">
                  <Button variant="outline" className="mt-4">
                    Create Your First Application
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredApplications.map((application) => (
                <Card
                  key={application.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedApplicationId(application.id)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Badge
                            variant="outline"
                            className={`capitalize bg-${APPLICATION_STATUS_COLORS[application.status]}-50 dark:bg-${APPLICATION_STATUS_COLORS[application.status]}-900/20 text-${APPLICATION_STATUS_COLORS[application.status]}-700 dark:text-${APPLICATION_STATUS_COLORS[application.status]}-300 border-${APPLICATION_STATUS_COLORS[application.status]}-200 dark:border-${APPLICATION_STATUS_COLORS[application.status]}-800`}
                          >
                            {application.status}
                          </Badge>
                          <Badge variant="secondary" className="capitalize">
                            {application.category}
                          </Badge>
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            {application.sub_category.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {format(new Date(application.start_date), 'MMM dd')} -{' '}
                              {format(new Date(application.end_date), 'MMM dd, yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span className="capitalize">{application.period_type}</span>
                          </div>
                        </div>

                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2">
                          {application.reason}
                        </p>

                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Applied on {format(new Date(application.created_at), 'MMM dd, yyyy hh:mm a')}
                        </div>
                      </div>

                      {application.status === 'pending' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelApplication(application.id);
                          }}
                          disabled={cancelApplication.isPending}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Application Details Dialog */}
      <Dialog
        open={!!selectedApplicationId}
        onOpenChange={(open) => !open && setSelectedApplicationId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>
              View complete information about your application
            </DialogDescription>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-6">
              {/* Status and Category */}
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className={`capitalize bg-${APPLICATION_STATUS_COLORS[selectedApplication.status]}-50 dark:bg-${APPLICATION_STATUS_COLORS[selectedApplication.status]}-900/20 text-${APPLICATION_STATUS_COLORS[selectedApplication.status]}-700 dark:text-${APPLICATION_STATUS_COLORS[selectedApplication.status]}-300 border-${APPLICATION_STATUS_COLORS[selectedApplication.status]}-200 dark:border-${APPLICATION_STATUS_COLORS[selectedApplication.status]}-800`}
                >
                  {selectedApplication.status}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  {selectedApplication.category}
                </Badge>
                <span className="text-sm text-gray-500">
                  {selectedApplication.sub_category.replace('_', ' ')}
                </span>
              </div>

              {/* Date Range */}
              <div>
                <h4 className="font-medium mb-2">Date Range</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {format(new Date(selectedApplication.start_date), 'MMMM dd, yyyy')} to{' '}
                  {format(new Date(selectedApplication.end_date), 'MMMM dd, yyyy')}
                </p>
                <p className="text-sm text-gray-500 mt-1 capitalize">
                  Period Type: {selectedApplication.period_type}
                </p>
              </div>

              {/* Reason */}
              <div>
                <h4 className="font-medium mb-2">Reason</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {selectedApplication.reason}
                </p>
              </div>

              {/* Attachment */}
              {selectedApplication.attachment_url && (
                <div>
                  <h4 className="font-medium mb-2">Attachment</h4>
                  <a
                    href={selectedApplication.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    View Attachment
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              {/* Approval Timeline */}
              <div>
                <h4 className="font-medium mb-4">Approval Timeline</h4>
                <ApprovalTimeline applicationId={selectedApplication.id} />
              </div>

              {/* Actions */}
              {selectedApplication.status === 'pending' && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={() => handleCancelApplication(selectedApplication.id)}
                    disabled={cancelApplication.isPending}
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Application
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </ContentLayout>
  );
}
