'use client';

/**
 * Leave/OnDuty Approvals Dashboard
 *
 * Allows faculty/HOD/principal to:
 * - View applications pending their approval
 * - Approve or reject applications
 * - Filter by various criteria
 * - View application details and timeline
 *
 * @route /academic/leave-onduty/approvals
 */

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  usePendingApprovals,
  useProcessApproval,
  useApprovalStatistics,
} from '@/hooks/academic/use-leave-onduty';
import { ApprovalActionData } from '@/types/leave-onduty';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApprovalTimeline } from '@/components/academic/leave-onduty/approval-timeline';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  Clock,
  Users,
  FileText,
  Calendar,
  AlertCircle,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected' | null>(null);
  const [comments, setComments] = useState('');

  const { data: pendingApprovals, isLoading, error } = usePendingApprovals(profile?.id || '');
  const { data: stats } = useApprovalStatistics(profile?.id || '');
  const processApproval = useProcessApproval();

  const selectedApproval = pendingApprovals?.find(
    (a) => a.application_id === selectedApplicationId
  );
  const selectedApplication = selectedApproval?.application;

  const handleProcessApproval = async () => {
    if (!approvalAction || !selectedApplicationId || !profile?.id) return;

    const data: ApprovalActionData = {
      application_id: selectedApplicationId,
      approver_id: profile.id,
      status: approvalAction,
      comments: comments.trim(),
    };

    processApproval.mutate(data, {
      onSuccess: () => {
        setSelectedApplicationId(null);
        setApprovalAction(null);
        setComments('');
      },
    });
  };

  if (isLoading) {
    return (
      <ContentLayout title="Leave/OnDuty Approvals">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
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
      <ContentLayout title="Leave/OnDuty Approvals">
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Failed to load approvals. Please try again.</AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Leave/OnDuty Approvals">
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
                <Link href="/academic">Academic</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/academic/leave-onduty">Leave/OnDuty</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Approvals</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.pending}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Approved Today</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.approved_today}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Rejected Today</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.rejected_today}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Avg. Turnaround</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {stats.average_turnaround_hours}h
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pending Approvals List */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Approvals</CardTitle>
        </CardHeader>
        <CardContent>
          {!pendingApprovals || pendingApprovals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-center">
                No pending approvals
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingApprovals.map((approval) => {
                const application = approval.application;
                if (!application) return null;

                return (
                  <Card
                    key={approval.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedApplicationId(application.id)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {application.learner?.first_name} {application.learner?.last_name}
                            </span>
                            <Badge variant="secondary" className="capitalize">
                              {application.category}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {application.sub_category.replace('_', ' ')}
                            </span>
                          </div>

                          {application.learner?.roll_number && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                              Roll No: {application.learner.roll_number}
                            </p>
                          )}

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
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApplicationId(application.id);
                              setApprovalAction('approved');
                            }}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedApplicationId(application.id);
                              setApprovalAction('rejected');
                            }}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval Action Dialog */}
      <Dialog
        open={!!approvalAction}
        onOpenChange={(open) => {
          if (!open) {
            setApprovalAction(null);
            setComments('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approvalAction === 'approved' ? 'Approve' : 'Reject'} Application
            </DialogTitle>
            <DialogDescription>
              {approvalAction === 'approved'
                ? 'This will approve the application and move it to the next step.'
                : 'This will reject the application. Please provide a reason.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="comments">
                Comments {approvalAction === 'rejected' && <span className="text-red-500">*</span>}
              </Label>
              <Textarea
                id="comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  approvalAction === 'approved'
                    ? 'Add any comments (optional)'
                    : 'Provide a reason for rejection'
                }
                className="min-h-[100px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setApprovalAction(null);
                setComments('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={approvalAction === 'approved' ? 'default' : 'destructive'}
              onClick={handleProcessApproval}
              disabled={
                processApproval.isPending ||
                (approvalAction === 'rejected' && comments.trim().length === 0)
              }
            >
              {processApproval.isPending ? (
                <>Processing...</>
              ) : (
                <>
                  {approvalAction === 'approved' ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Application Details Dialog */}
      <Dialog
        open={!!selectedApplicationId && !approvalAction}
        onOpenChange={(open) => !open && setSelectedApplicationId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
          </DialogHeader>

          {selectedApplication && (
            <div className="space-y-6">
              {/* Student Info */}
              <div>
                <h4 className="font-medium mb-2">Student Information</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedApplication.learner?.first_name}{' '}
                  {selectedApplication.learner?.last_name}
                  {selectedApplication.learner?.roll_number && (
                    <span className="ml-2">({selectedApplication.learner.roll_number})</span>
                  )}
                </p>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </ContentLayout>
  );
}
