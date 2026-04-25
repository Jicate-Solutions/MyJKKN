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

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePendingApprovals,
  useProcessApproval,
  useProcessForward,
  useApprovalStatistics,
  useAllApplicationsForSuperAdminByStatus,
  useSuperAdminApprovalStatistics,
  useApplicationsByStatusForInstitution,
  useSponsorPendingApprovals,
  useProcessSponsorApproval,
} from '@/hooks/academic/use-leave-onduty';
import { ApprovalActionData, LeaveOndutyApplication } from '@/types/leave-onduty';
import { ContentLayout } from '@/components/layout/content-layout';
import { convertToAuthenticatedUrl } from '@/lib/utils/storage-url-helper';
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
import { AttachmentLink } from '@/components/academic/leave-onduty/attachment-link';
import { createColumns } from './_components/approvals-columns';
import { DataTable } from '@/components/ui/data-table';
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

import { ApplicationDetailsDialog } from './_components/application-details-dialog';
import { ForwardDialog } from './_components/forward-dialog';

export default function ApprovalsPage() {
  const router = useRouter();
  const { profile, isLoading: authLoading } = useAuth();
  const { can, isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected' | null>(null);
  // v2: forward dialog — boolean because the target + comment live in the
  // ForwardDialog component itself. Only the application_id context lives here.
  const [isForwardOpen, setIsForwardOpen] = useState(false);
  const [comments, setComments] = useState('');
  const [rowSelection, setRowSelection] = useState({});
  const [bulkAction, setBulkAction] = useState<'approved' | 'rejected' | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  // Phase 2 — sponsor approval queue state
  const [sponsorAction, setSponsorAction] = useState<{
    application: LeaveOndutyApplication;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [sponsorComments, setSponsorComments] = useState('');

  // Fetch applications awaiting THIS user as sponsor
  const { data: sponsorPending, isLoading: sponsorPendingLoading } = useSponsorPendingApprovals(
    profile?.id || null
  );
  const processSponsorMutation = useProcessSponsorApproval();

  const handleSponsorAction = () => {
    if (!sponsorAction || !profile?.id) return;
    if (sponsorAction.decision === 'rejected' && sponsorComments.trim().length === 0) return;

    processSponsorMutation.mutate(
      {
        application_id: sponsorAction.application.id,
        sponsor_id: profile.id,
        decision: sponsorAction.decision,
        comments: sponsorComments.trim() || undefined,
      },
      {
        onSuccess: () => {
          setSponsorAction(null);
          setSponsorComments('');
        },
      }
    );
  };

  // Permission check - redirect if unauthorized
  // CRITICAL: Wait for both auth AND permissions to finish loading before checking
  useEffect(() => {
    if (!authLoading && !permissionsLoading && !can('academic.leave_onduty.approve')) {
      router.replace('/');
    }
  }, [authLoading, permissionsLoading, can, router]);

  // Use different hooks based on user role - only enable the relevant one
  // Super admin: fetch all applications across all institutions
  const { data: superAdminApps, isLoading: superAdminLoading, error: superAdminError } =
    useAllApplicationsForSuperAdminByStatus(statusFilter, isSuperAdmin);

  // Institution-based: fetch applications for user's institution/department
  const { data: institutionApps, isLoading: institutionLoading, error: institutionError } =
    useApplicationsByStatusForInstitution(
      statusFilter,
      profile?.institution_id || null,
      profile?.department_id || null,
      !isSuperAdmin // Only enable for non-super admin
    );

  // Stats hooks - only enable the relevant one
  const { data: approverStats } = useApprovalStatistics(
    profile?.id || '',
    undefined,
    undefined,
    !isSuperAdmin // Only enable for non-super admin
  );
  const { data: superAdminStats } = useSuperAdminApprovalStatistics(isSuperAdmin);

  const processApproval = useProcessApproval();
  const processForward = useProcessForward();

  const handleForwardSubmit = (forwardToId: string, comments: string) => {
    if (!selectedApplicationId || !profile?.id) return;
    processForward.mutate(
      {
        application_id: selectedApplicationId,
        approver_id: profile.id,
        forward_to_id: forwardToId,
        comments,
      },
      {
        onSuccess: () => {
          setIsForwardOpen(false);
          setSelectedApplicationId(null);
        },
      }
    );
  };

  // Determine which data to use based on role
  const isLoading = isSuperAdmin ? superAdminLoading : institutionLoading;
  const error = isSuperAdmin ? superAdminError : institutionError;
  const stats = isSuperAdmin ? superAdminStats : approverStats;

  // Normalize data structure - both super admin and institution return applications directly
  const normalizedApprovals = useMemo(() => {
    const raw = isSuperAdmin ? (superAdminApps || []) : (institutionApps || []);

    // On the Pending tab, non-super-admin approvers should only see rows
    // where THEIR specific step is still pending. Without this the row
    // stays in the queue after they approve (because the application's
    // overall status stays 'pending' until all steps finish), inviting a
    // second click that hits the "not authorized" error.
    if (statusFilter !== 'pending' || isSuperAdmin || !profile?.id) return raw;
    return (raw as any[]).filter((app: any) => {
      const approvals = app.approvals ?? [];
      return approvals.some(
        (a: any) => a.approver_id === profile.id && a.status === 'pending'
      );
    });
  }, [isSuperAdmin, superAdminApps, institutionApps, statusFilter, profile?.id]);

  const selectedApplication = normalizedApprovals?.find(
    (app: any) => app.id === selectedApplicationId
  );

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

  // Table action handlers
  const handleViewDetails = (row: any) => {
    setSelectedApplicationId(row.id);
  };

  const handleApprove = (row: any) => {
    setSelectedApplicationId(row.id);
    setApprovalAction('approved');
  };

  const handleReject = (row: any) => {
    setSelectedApplicationId(row.id);
    setApprovalAction('rejected');
  };

  // Bulk action handlers
  const handleBulkApprove = () => {
    const selectedRows = Object.keys(rowSelection).filter(key => rowSelection[key]);
    if (selectedRows.length === 0) {
      toast.error('Please select at least one application');
      return;
    }
    setBulkAction('approved');
  };

  const handleBulkReject = () => {
    const selectedRows = Object.keys(rowSelection).filter(key => rowSelection[key]);
    if (selectedRows.length === 0) {
      toast.error('Please select at least one application');
      return;
    }
    setBulkAction('rejected');
  };

  const handleProcessBulkApproval = async () => {
    if (!bulkAction || !profile?.id) return;

    const selectedRows = Object.keys(rowSelection).filter(key => rowSelection[key]);
    const selectedApps = selectedRows
      .map(index => normalizedApprovals?.[parseInt(index)])
      .filter(Boolean);

    if (selectedApps.length === 0) return;

    // Process each approval sequentially
    for (const app of selectedApps) {
      const data: ApprovalActionData = {
        application_id: app.id,
        approver_id: profile.id,
        status: bulkAction,
        comments: comments.trim(),
      };

      await new Promise((resolve) => {
        processApproval.mutate(data, {
          onSuccess: () => resolve(true),
          onError: () => resolve(false),
        });
      });
    }

    // Reset after processing
    setRowSelection({});
    setBulkAction(null);
    setComments('');
    toast.success(`${selectedApps.length} application(s) ${bulkAction}`);
  };

  // Create table columns
  const columns = useMemo(
    () => createColumns(isSuperAdmin, handleViewDetails, handleApprove, handleReject, profile?.id),
    [isSuperAdmin, profile?.id]
  );

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

      {/* Phase 2: Awaiting Your Sponsor Approval section */}
      {!sponsorPendingLoading && sponsorPending && sponsorPending.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Awaiting Your Sponsor Approval
              <Badge className="ml-2 bg-amber-500 text-white hover:bg-amber-600">
                {sponsorPending.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Learners have picked you as their sponsor for these applications. Your approval is
              required before the academic chain (HOD → Principal) reviews them.
            </p>
            <div className="space-y-2">
              {sponsorPending.map((app: LeaveOndutyApplication) => {
                const learnerName = app.learner
                  ? `${app.learner.first_name} ${app.learner.last_name}`
                  : 'Unknown learner';
                const dateRange =
                  app.start_date === app.end_date
                    ? format(new Date(app.start_date), 'MMM d, yyyy')
                    : `${format(new Date(app.start_date), 'MMM d')} – ${format(new Date(app.end_date), 'MMM d, yyyy')}`;
                return (
                  <div
                    key={app.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-gray-950 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                          {learnerName}
                        </span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {app.sub_category.replace(/_/g, ' ')}
                        </Badge>
                        {app.learner?.roll_number && (
                          <span className="text-xs text-muted-foreground">
                            {app.learner.roll_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span>{dateRange}</span>
                      </div>
                      {app.reason && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          &ldquo;{app.reason}&rdquo;
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setSponsorAction({ application: app, decision: 'approved' })}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setSponsorAction({ application: app, decision: 'rejected' })}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

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
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {isSuperAdmin ? 'Total Applications' : 'Avg. Turnaround'}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {isSuperAdmin
                      ? (stats as any).total_applications
                      : `${(stats as any).average_turnaround_hours}h`}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status Tabs */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-md">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={statusFilter} className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {statusFilter === 'pending' && 'Pending Approvals'}
                    {statusFilter === 'approved' && 'Approved Applications'}
                    {statusFilter === 'rejected' && 'Rejected Applications'}
                    {statusFilter === 'all' && 'All Applications'}
                    {isSuperAdmin && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Super Admin - All Institutions
                      </Badge>
                    )}
                  </CardTitle>
                </div>

            {/* Bulk Action Buttons - Only show for pending applications */}
            {statusFilter === 'pending' && Object.keys(rowSelection).filter(key => rowSelection[key]).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {Object.keys(rowSelection).filter(key => rowSelection[key]).length} selected
                </span>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleBulkApprove}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve Selected
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkReject}
                  className="gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Selected
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <DataTable
            columns={columns}
            data={normalizedApprovals || []}
            filterColumn="reason"
            searchPlaceholder="Search applications..."
            rowSelection={statusFilter === 'pending' ? rowSelection : undefined}
            onRowSelectionChange={statusFilter === 'pending' ? (setRowSelection as any) : undefined}
          />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

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

      {/* Bulk Approval Action Dialog */}
      <Dialog
        open={!!bulkAction}
        onOpenChange={(open) => {
          if (!open) {
            setBulkAction(null);
            setComments('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkAction === 'approved' ? 'Approve' : 'Reject'} Multiple Applications
            </DialogTitle>
            <DialogDescription>
              You are about to {bulkAction === 'approved' ? 'approve' : 'reject'}{' '}
              {Object.keys(rowSelection).filter(key => rowSelection[key]).length} application(s).
              {bulkAction === 'rejected' && ' Please provide a reason for rejection.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="bulk-comments">
                Comments {bulkAction === 'rejected' && <span className="text-red-500">*</span>}
              </Label>
              <Textarea
                id="bulk-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder={
                  bulkAction === 'approved'
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
                setBulkAction(null);
                setComments('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={bulkAction === 'approved' ? 'default' : 'destructive'}
              onClick={handleProcessBulkApproval}
              disabled={
                processApproval.isPending ||
                (bulkAction === 'rejected' && comments.trim().length === 0)
              }
            >
              {processApproval.isPending ? (
                <>Processing...</>
              ) : (
                <>
                  {bulkAction === 'approved' ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve {Object.keys(rowSelection).filter(key => rowSelection[key]).length} Applications
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject {Object.keys(rowSelection).filter(key => rowSelection[key]).length} Applications
                    </>
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 2: Sponsor Approval Action Dialog */}
      <Dialog
        open={!!sponsorAction}
        onOpenChange={(open) => {
          if (!open) {
            setSponsorAction(null);
            setSponsorComments('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {sponsorAction?.decision === 'approved' ? 'Approve' : 'Reject'} as Sponsor
            </DialogTitle>
            <DialogDescription>
              {sponsorAction?.decision === 'approved'
                ? 'You are confirming that this learner is working with you on this activity. After your approval, the application will go to the HOD for academic approval.'
                : 'You are indicating that this learner is NOT working with you on this activity. This will reject the application and the academic chain will not review it.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {sponsorAction && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900/50 space-y-1">
                <div className="text-sm font-medium">
                  {sponsorAction.application.learner
                    ? `${sponsorAction.application.learner.first_name} ${sponsorAction.application.learner.last_name}`
                    : 'Unknown learner'}
                </div>
                <div className="text-xs text-muted-foreground capitalize">
                  {sponsorAction.application.sub_category.replace(/_/g, ' ')} · {format(new Date(sponsorAction.application.start_date), 'MMM d, yyyy')}
                  {sponsorAction.application.start_date !== sponsorAction.application.end_date &&
                    ` – ${format(new Date(sponsorAction.application.end_date), 'MMM d, yyyy')}`}
                </div>
                {sponsorAction.application.reason && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Reason: &ldquo;{sponsorAction.application.reason}&rdquo;
                  </p>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="sponsor-comments">
                Comments{' '}
                {sponsorAction?.decision === 'rejected' && <span className="text-red-500">*</span>}
              </Label>
              <Textarea
                id="sponsor-comments"
                value={sponsorComments}
                onChange={(e) => setSponsorComments(e.target.value)}
                placeholder={
                  sponsorAction?.decision === 'approved'
                    ? 'Optional: confirm details or add a note for the HOD'
                    : 'Required: explain why you are rejecting this application'
                }
                className="min-h-[100px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSponsorAction(null);
                setSponsorComments('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={sponsorAction?.decision === 'approved' ? 'default' : 'destructive'}
              onClick={handleSponsorAction}
              disabled={
                processSponsorMutation.isPending ||
                (sponsorAction?.decision === 'rejected' && sponsorComments.trim().length === 0)
              }
              className={sponsorAction?.decision === 'approved' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {processSponsorMutation.isPending ? (
                <>Processing...</>
              ) : sponsorAction?.decision === 'approved' ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve &amp; Forward to HOD
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject Application
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Application Details Dialog */}
      <ApplicationDetailsDialog
        isOpen={!!selectedApplicationId && !approvalAction && !isForwardOpen}
        onOpenChange={(open) => !open && setSelectedApplicationId(null)}
        application={selectedApplication}
        onApprove={() => setApprovalAction('approved')}
        onReject={() => setApprovalAction('rejected')}
        onForward={
          // Forwarding only makes sense while the application is still pending.
          // For history/other rows we hide the button by not passing the prop.
          selectedApplication?.status === 'pending' && !isSuperAdmin
            ? () => setIsForwardOpen(true)
            : undefined
        }
        isSuperAdmin={isSuperAdmin}
        currentUserId={profile?.id}
      />

      {/* v2: Forward Dialog */}
      <ForwardDialog
        open={isForwardOpen}
        onOpenChange={setIsForwardOpen}
        institutionId={profile?.institution_id || ''}
        approverId={profile?.id || ''}
        isSubmitting={processForward.isPending}
        onSubmit={handleForwardSubmit}
      />
      </div>
    </ContentLayout>
  );
}
