'use client';

/**
 * My Leave/OnDuty Applications Page
 *
 * Mobile-first responsive design for learners to:
 * - View all their applications
 * - Filter by status
 * - View application details
 * - Cancel pending applications
 *
 * @route /learners/leave-onduty/my-applications
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useMyLeaveOndutyApplications,
  useCancelLeaveOndutyApplication,
} from '@/hooks/academic/use-leave-onduty';
import { ApplicationStatus, APPLICATION_STATUS_COLORS } from '@/types/leave-onduty';
import { ContentLayout } from '@/components/layout/content-layout';
import { AttachmentLink } from '@/components/academic/leave-onduty/attachment-link';
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
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
  Plus,
  FileText,
  Calendar,
  Clock,
  AlertCircle,
  ExternalLink,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useMediaQuery } from '@/hooks/use-media-query';

// Shared content component for both Dialog and Drawer
function ApplicationDetailsContent({
  application,
  onCancel,
  isCancelling,
}: {
  application: any;
  onCancel: () => void;
  isCancelling: boolean;
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Status and Category */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <Badge
          variant="outline"
          className={`capitalize bg-${APPLICATION_STATUS_COLORS[application.status]}-50 dark:bg-${APPLICATION_STATUS_COLORS[application.status]}-900/20 text-${APPLICATION_STATUS_COLORS[application.status]}-700 dark:text-${APPLICATION_STATUS_COLORS[application.status]}-300 border-${APPLICATION_STATUS_COLORS[application.status]}-200 dark:border-${APPLICATION_STATUS_COLORS[application.status]}-800`}
        >
          {application.status}
        </Badge>
        <Badge variant="secondary" className="capitalize">
          {application.category}
        </Badge>
        <span className="text-sm text-gray-500 capitalize">
          {application.sub_category.replace('_', ' ')}
        </span>
      </div>

      {/* Date Range */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4">
        <h4 className="font-medium mb-2 text-sm sm:text-base flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Date Range
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {format(new Date(application.start_date), 'MMM dd, yyyy')} to{' '}
          {format(new Date(application.end_date), 'MMM dd, yyyy')}
        </p>
        <p className="text-xs sm:text-sm text-gray-500 mt-1 capitalize flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {application.period_type}
        </p>
      </div>

      {/* Reason */}
      <div>
        <h4 className="font-medium mb-2 text-sm sm:text-base">Reason</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4">
          {application.reason}
        </p>
      </div>

      {/* Attachment */}
      {application.attachment_url && (
        <div>
          <h4 className="font-medium mb-2 text-sm sm:text-base">Attachment</h4>
          <AttachmentLink
            attachmentUrl={application.attachment_url}
            className="bg-primary/5 px-3 py-2 rounded-lg"
          />
        </div>
      )}

      {/* Approval Timeline */}
      <div>
        <h4 className="font-medium mb-3 sm:mb-4 text-sm sm:text-base">Approval Timeline</h4>
        <ApprovalTimeline applicationId={application.id} />
      </div>

      {/* Actions */}
      {application.status === 'pending' && (
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="destructive"
            onClick={onCancel}
            disabled={isCancelling}
            className="flex-1"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Application
          </Button>
        </div>
      )}
    </div>
  );
}

export default function MyApplicationsPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [selectedStatus, setSelectedStatus] = useState<ApplicationStatus | 'all'>('all');
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Permission check - redirect if unauthorized
  // CRITICAL: Wait for both auth AND permissions to finish loading before checking
  useEffect(() => {
    if (!authLoading && !permissionsLoading && !can('learners.leave_onduty.view')) {
      router.replace('/');
    }
  }, [authLoading, permissionsLoading, can, router]);

  // Fetch ALL applications once (no server-side filter)
  const { data: applications, isLoading, error } = useMyLeaveOndutyApplications(
    profile?.learner_id || ''
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

  // Client-side filtering for instant tab switching
  const filteredApplications = (applications || []).filter((app) => {
    if (selectedStatus === 'all') return true;
    return app.status === selectedStatus;
  });

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

  // Show loading while checking auth or if user is not a student (redirecting)
  if (authLoading || isLoading || (profile && profile.role !== 'student')) {
    return (
      <ContentLayout title="Leave/OnDuty">
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
      <ContentLayout title="Leave/OnDuty">
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
    <ContentLayout title="Leave/OnDuty">
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
        {/* Breadcrumb - Hidden on mobile */}
        <Breadcrumb className="hidden md:flex">
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
              <BreadcrumbPage>Leave/OnDuty</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header - Desktop only shows button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">
            Leave/OnDuty
          </h2>
          {/* Desktop Apply Button */}
          <Link href="/learners/leave-onduty/apply" className="hidden sm:block">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Application
            </Button>
          </Link>
        </div>

        {/* Tabs - Scrollable on mobile */}
        <Tabs value={selectedStatus} onValueChange={(v) => setSelectedStatus(v as any)}>
          <ScrollArea className="w-full whitespace-nowrap">
            <TabsList className="mb-4 inline-flex w-max sm:w-auto">
              <TabsTrigger value="all" className="px-3 sm:px-4">
                All
                {counts.all > 0 && (
                  <span className="ml-1.5 sm:ml-2 rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 sm:px-2 py-0.5 text-xs">
                    {counts.all}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="pending" className="px-3 sm:px-4">
                Pending
                {counts.pending > 0 && (
                  <span className="ml-1.5 sm:ml-2 rounded-full bg-yellow-200 dark:bg-yellow-900/50 px-1.5 sm:px-2 py-0.5 text-xs">
                    {counts.pending}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved" className="px-3 sm:px-4">
                Approved
                {counts.approved > 0 && (
                  <span className="ml-1.5 sm:ml-2 rounded-full bg-green-200 dark:bg-green-900/50 px-1.5 sm:px-2 py-0.5 text-xs">
                    {counts.approved}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="px-3 sm:px-4">
                Rejected
                {counts.rejected > 0 && (
                  <span className="ml-1.5 sm:ml-2 rounded-full bg-red-200 dark:bg-red-900/50 px-1.5 sm:px-2 py-0.5 text-xs">
                    {counts.rejected}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="px-3 sm:px-4">
                Cancelled
                {counts.cancelled > 0 && (
                  <span className="ml-1.5 sm:ml-2 rounded-full bg-gray-200 dark:bg-gray-700 px-1.5 sm:px-2 py-0.5 text-xs">
                    {counts.cancelled}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <ScrollBar orientation="horizontal" className="invisible" />
          </ScrollArea>

        <TabsContent value={selectedStatus} className="space-y-3 sm:space-y-4">
          {filteredApplications.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 px-4">
                <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-3 sm:mb-4" />
                <p className="text-gray-600 dark:text-gray-400 text-center text-sm sm:text-base">
                  No applications found
                </p>
                <Link href="/learners/leave-onduty/apply" className="w-full sm:w-auto">
                  <Button variant="outline" className="mt-4 w-full sm:w-auto">
                    Create Your First Application
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:gap-4">
              {filteredApplications.map((application) => (
                <Card
                  key={application.id}
                  className="cursor-pointer hover:shadow-md transition-shadow active:bg-gray-50 dark:active:bg-gray-800/50"
                  onClick={() => setSelectedApplicationId(application.id)}
                >
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Badges - Wrap on mobile */}
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mb-2">
                          <Badge
                            variant="outline"
                            className={`capitalize text-xs sm:text-sm bg-${APPLICATION_STATUS_COLORS[application.status]}-50 dark:bg-${APPLICATION_STATUS_COLORS[application.status]}-900/20 text-${APPLICATION_STATUS_COLORS[application.status]}-700 dark:text-${APPLICATION_STATUS_COLORS[application.status]}-300 border-${APPLICATION_STATUS_COLORS[application.status]}-200 dark:border-${APPLICATION_STATUS_COLORS[application.status]}-800`}
                          >
                            {application.status}
                          </Badge>
                          <Badge variant="secondary" className="capitalize text-xs sm:text-sm">
                            {application.category}
                          </Badge>
                          <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 capitalize">
                            {application.sub_category.replace('_', ' ')}
                          </span>
                        </div>

                        {/* Date and Period - Stack on mobile */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                            <span className="truncate">
                              {format(new Date(application.start_date), 'MMM dd')} -{' '}
                              {format(new Date(application.end_date), 'MMM dd, yyyy')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                            <span className="capitalize">{application.period_type}</span>
                          </div>
                        </div>

                        {/* Reason */}
                        <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2">
                          {application.reason}
                        </p>

                        {/* Applied date */}
                        <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Applied {format(new Date(application.created_at), 'MMM dd, yyyy')}
                        </div>
                      </div>

                      {/* Actions and Arrow */}
                      <div className="flex flex-col items-end gap-2">
                        {application.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 sm:px-3 text-xs sm:text-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelApplication(application.id);
                            }}
                            disabled={cancelApplication.isPending}
                          >
                            <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 sm:mr-1" />
                            <span className="hidden sm:inline">Cancel</span>
                          </Button>
                        )}
                        <ChevronRight className="h-5 w-5 text-gray-400 mt-auto" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Application Details - Drawer on mobile, Dialog on desktop */}
      {isMobile ? (
        <Drawer
          open={!!selectedApplicationId}
          onOpenChange={(open) => !open && setSelectedApplicationId(null)}
        >
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>Application Details</DrawerTitle>
              <DrawerDescription>
                View complete information about your application
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-24 overflow-y-auto">
              {selectedApplication && (
                <ApplicationDetailsContent
                  application={selectedApplication}
                  onCancel={() => handleCancelApplication(selectedApplication.id)}
                  isCancelling={cancelApplication.isPending}
                />
              )}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
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
              <ApplicationDetailsContent
                application={selectedApplication}
                onCancel={() => handleCancelApplication(selectedApplication.id)}
                isCancelling={cancelApplication.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Mobile Floating Apply Button */}
      <div className="fixed bottom-20 left-0 right-0 p-4 sm:hidden z-40">
        <Link href="/learners/leave-onduty/apply" className="block">
          <Button className="w-full shadow-lg" size="lg">
            <Plus className="h-5 w-5 mr-2" />
            Apply for Leave/OnDuty
          </Button>
        </Link>
      </div>
      </div>
    </ContentLayout>
  );
}
