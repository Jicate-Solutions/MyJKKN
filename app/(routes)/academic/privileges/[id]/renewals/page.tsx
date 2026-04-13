'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePermissions } from '@/hooks/use-permissions';
import {
  usePrivilegeGroup,
  useRenewalsForMonth,
  useReviewRenewal,
  useRenewalDashboard,
  useGroupReviewers,
} from '@/hooks/academic/use-privileges';
import toast from 'react-hot-toast';
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Users,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  ExternalLink,
  PauseCircle,
} from 'lucide-react';

const renewalStatusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  approved: {
    label: 'Approved',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
  },
  denied: {
    label: 'Denied',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  pending: {
    label: 'Pending Review',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  auto_paused: {
    label: 'Auto-Paused',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
};

export default function RenewalReviewPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;

  const { userProfile, isSuperAdmin } = usePermissions();

  // Compute review month inside component (not module level) so it stays fresh
  // Review month = NEXT month (what we're approving FOR)
  const reviewMonth = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];
  }, []);

  const { data: group, isLoading: groupLoading } = usePrivilegeGroup(groupId);
  const { data: reviewers } = useGroupReviewers(groupId);

  // Access control: only super_admin, admin, or assigned committee members
  const isAdmin = userProfile?.role === 'admin';
  const isAssignedReviewer = reviewers?.some((r: any) => r.reviewer_id === userProfile?.id);
  const { data: dashboard, isLoading: dashboardLoading } = useRenewalDashboard(groupId, reviewMonth);
  const { data: renewals, isLoading: renewalsLoading } = useRenewalsForMonth(groupId, reviewMonth);
  const reviewRenewal = useReviewRenewal(groupId, reviewMonth);

  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const renewalsList: any[] = Array.isArray(renewals) ? renewals : [];

  // Format month for display
  const displayMonth = format(new Date(reviewMonth), 'MMMM yyyy');

  const handleReview = (renewalId: string, decision: 'approved' | 'denied') => {
    if (!userProfile?.id) {
      toast.error('Unable to identify reviewer');
      return;
    }
    reviewRenewal.mutate(
      {
        renewal_id: renewalId,
        decision,
        notes: reviewNotes[renewalId] || undefined,
        reviewed_by: userProfile.id,
      },
      {
        onSuccess: () => {
          setReviewNotes((prev) => {
            const next = { ...prev };
            delete next[renewalId];
            return next;
          });
        },
      }
    );
  };

  if (groupLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!isSuperAdmin && !isAdmin && !isAssignedReviewer) {
    return (
      <ContentLayout title="Access Denied">
        <Card><CardContent className="py-16 text-center">
          <p className="text-muted-foreground">You are not authorized to review renewals for this group.</p>
        </CardContent></Card>
      </ContentLayout>
    );
  }

  if (!group) {
    return (
      <ContentLayout title="Not Found">
        <div className="flex flex-col items-center justify-center py-16">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Privilege group not found
          </h3>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push('/academic/privileges')}
          >
            Back to Groups
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${group.name} - Renewals`}>
      <div className="space-y-6">
        {/* Breadcrumbs */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/academic/privileges">Privileges</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/academic/privileges/${groupId}`}>
                {group.name}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Renewal Review</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Back */}
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{group.name}</h2>
            <p className="text-muted-foreground">
              Monthly Renewal Review &mdash; {displayMonth}
            </p>
          </div>
          <Badge variant="outline" className="text-sm px-3 py-1 w-fit">
            <Clock className="h-3.5 w-3.5 mr-1.5" />
            Due by 27th
          </Badge>
        </div>

        {/* Stats Cards */}
        {dashboardLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : dashboard ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-2">
                    <Users className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dashboard.total_members}</p>
                    <p className="text-xs text-muted-foreground">Total Members</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-100 p-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dashboard.approved}</p>
                    <p className="text-xs text-muted-foreground">Approved</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-gray-100 p-2">
                    <FileText className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dashboard.pending_report}</p>
                    <p className="text-xs text-muted-foreground">Pending Report</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-yellow-100 p-2">
                    <Clock className="h-4 w-4 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dashboard.pending_review}</p>
                    <p className="text-xs text-muted-foreground">Pending Review</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-orange-100 p-2">
                    <PauseCircle className="h-4 w-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{dashboard.paused}</p>
                    <p className="text-xs text-muted-foreground">Paused</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Member Review Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Member Renewal Status</CardTitle>
          </CardHeader>
          <CardContent>
            {renewalsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : renewalsList.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No renewal records for {displayMonth}.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Members need to submit their progress reports first.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner Name</TableHead>
                      <TableHead>Roll Number</TableHead>
                      <TableHead>Report Status</TableHead>
                      <TableHead>Renewal Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renewalsList.map((renewal: any, idx: number) => {
                      const member = renewal.member;
                      const report = renewal.report;
                      const learner = member?.learner;
                      const hasReport = !!report;
                      const statusInfo =
                        renewalStatusConfig[renewal.status] || renewalStatusConfig.pending;
                      const isReviewed = renewal.status === 'approved' || renewal.status === 'denied';

                      const learnerName =
                        learner?.full_name ||
                        `${learner?.first_name || ''} ${learner?.last_name || ''}`.trim() ||
                        'Unknown';

                      return (
                        <TableRow key={renewal.member_id || renewal.id || idx}>
                          <TableCell className="font-medium">{learnerName}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {learner?.roll_number || '-'}
                          </TableCell>
                          <TableCell>
                            {hasReport ? (
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="gap-1.5 text-blue-600 hover:text-blue-700">
                                    <FileText className="h-3.5 w-3.5" />
                                    View Report
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Progress Report - {learnerName}</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4 pt-2">
                                    {report.description && (
                                      <div>
                                        <p className="text-sm font-medium mb-1">Description</p>
                                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                          {report.description}
                                        </p>
                                      </div>
                                    )}
                                    {report.app_url && (
                                      <div>
                                        <p className="text-sm font-medium mb-1">App URL</p>
                                        <a
                                          href={report.app_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                                        >
                                          {report.app_url}
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      </div>
                                    )}
                                    {report.github_url && (
                                      <div>
                                        <p className="text-sm font-medium mb-1">GitHub URL</p>
                                        <a
                                          href={report.github_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                                        >
                                          {report.github_url}
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      </div>
                                    )}
                                    {report.screenshot_url && (
                                      <div>
                                        <p className="text-sm font-medium mb-1">Screenshot</p>
                                        <a
                                          href={report.screenshot_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                                        >
                                          View Screenshot
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      </div>
                                    )}
                                    {report.created_at && (
                                      <p className="text-xs text-muted-foreground">
                                        Submitted: {format(new Date(report.created_at), 'dd MMM yyyy, HH:mm')}
                                      </p>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                No report
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={`gap-1 ${statusInfo.className}`}>
                              {statusInfo.icon}
                              {statusInfo.label}
                            </Badge>
                            {renewal.reviewer && (
                              <p className="text-xs text-muted-foreground mt-1">
                                by {renewal.reviewer.full_name}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {isReviewed ? (
                              <span className="text-xs text-muted-foreground">
                                {renewal.review_notes || '-'}
                              </span>
                            ) : (
                              <Input
                                placeholder="Add notes..."
                                className="h-8 text-xs max-w-[180px]"
                                value={reviewNotes[renewal.id] || ''}
                                onChange={(e) =>
                                  setReviewNotes((prev) => ({
                                    ...prev,
                                    [renewal.id]: e.target.value,
                                  }))
                                }
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!renewal.id ? (
                              <span className="text-xs text-muted-foreground">No report submitted</span>
                            ) : isReviewed ? (
                              <span className="text-xs text-muted-foreground italic">
                                Reviewed
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                                          disabled={!hasReport || reviewRenewal.isPending}
                                          onClick={() => handleReview(renewal.id, 'approved')}
                                        >
                                          {reviewRenewal.isPending ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <>
                                              <CheckCircle className="h-4 w-4 mr-1" />
                                              Approve
                                            </>
                                          )}
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    {!hasReport && (
                                      <TooltipContent>
                                        <p>Report required before approval</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                  disabled={reviewRenewal.isPending}
                                  onClick={() => handleReview(renewal.id, 'denied')}
                                >
                                  {reviewRenewal.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <XCircle className="h-4 w-4 mr-1" />
                                      Deny
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
