'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useServiceRequest,
  useProcessApproval,
  useSubmitServiceRequest,
  useCancelServiceRequest,
  useMarkFulfilled,
  useCloseRequest,
  useAddComment,
} from '@/hooks/service-requests/use-service-requests';
import { RequestDetailView } from '../_components/request-detail-view';
import { RequestStatusBadge } from '../_components/request-status-badge';
import { PriorityBadge } from '../_components/priority-badge';
import { Edit, Send, XCircle, PackageCheck, Archive } from 'lucide-react';
import { format } from 'date-fns';
import type { ProcessApprovalDto, ServiceRequestApprovalStep } from '@/types/service-request';

export default function ServiceRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { profile } = useAuth();
  const { can, isSuperAdmin } = usePermissions();
  const { data: request, isLoading, error } = useServiceRequest(id);
  const processApproval = useProcessApproval();
  const submitRequest = useSubmitServiceRequest();
  const cancelRequest = useCancelServiceRequest();
  const markFulfilled = useMarkFulfilled();
  const closeRequest = useCloseRequest();
  const addComment = useAddComment();

  const [commentText, setCommentText] = useState('');

  const canApprove = useMemo(() => {
    if (!request || !profile) return false;
    if (request.status !== 'in_review' && request.status !== 'submitted') return false;
    if (isSuperAdmin) return true;
    return can('service_requests.approve');
  }, [request, profile, isSuperAdmin, can]);

  const currentApprovalStep: ServiceRequestApprovalStep | null = useMemo(() => {
    if (!request?.service_type?.approval_steps) return null;
    return (
      request.service_type.approval_steps.find(
        (s) => s.step_order === request.current_approval_step
      ) || null
    );
  }, [request]);

  const isRequester = request?.requester_id === profile?.id;
  const isDraft = request?.status === 'draft';
  const isReturned = request?.status === 'returned';
  const isApproved = request?.status === 'approved';
  const isFulfilled = request?.status === 'fulfilled';
  const isCancellable = ['draft', 'returned', 'submitted'].includes(request?.status || '');

  const handleProcessApproval = (data: ProcessApprovalDto) => {
    processApproval.mutate({ id, data });
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate(
      { id, content: commentText.trim() },
      { onSuccess: () => setCommentText('') }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Service Request">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !request) {
    return (
      <ContentLayout title="Service Request">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-red-500">
            {error?.message || 'Request not found'}
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Request ${request.request_number}`}>
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
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{request.request_number}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-5 mt-4">
        {/* ── Hero Header Card ─────────────────────── */}
        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">

              {/* Left: service name + meta */}
              <div className="min-w-0">
                {/* Request number + badges row */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {request.request_number}
                  </span>
                  <RequestStatusBadge status={request.status} />
                  {request.priority && <PriorityBadge priority={request.priority} />}
                </div>

                {/* Service type name */}
                <h1 className="text-xl sm:text-2xl font-bold leading-tight truncate">
                  {request.service_type?.name || 'Service Request'}
                </h1>

                {/* Submission date */}
                {request.submitted_at && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Submitted on{' '}
                    {format(new Date(request.submitted_at), 'MMMM dd, yyyy')}
                  </p>
                )}
              </div>

              {/* Right: action buttons */}
              <div className="flex flex-wrap gap-2 sm:shrink-0">
                {/* Requester actions */}
                {isRequester && (
                  <>
                    {(isDraft || isReturned) && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/service-requests/${id}/edit`)}
                          className="gap-2"
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => submitRequest.mutate(id)}
                          disabled={submitRequest.isPending}
                          className="gap-2"
                        >
                          <Send className="h-4 w-4" />
                          {submitRequest.isPending ? 'Submitting…' : 'Submit'}
                        </Button>
                      </>
                    )}
                    {isCancellable && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          cancelRequest.mutate(
                            { id },
                            {
                              onSuccess: () =>
                                router.push('/service-requests?tab=my-requests'),
                            }
                          )
                        }
                        disabled={cancelRequest.isPending}
                        className="gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        {cancelRequest.isPending ? 'Cancelling…' : 'Cancel'}
                      </Button>
                    )}
                  </>
                )}

                {/* Admin / staff actions */}
                {(isSuperAdmin || can('service_requests.manage')) && (
                  <>
                    {isApproved && (
                      <Button
                        size="sm"
                        onClick={() => markFulfilled.mutate(id)}
                        disabled={markFulfilled.isPending}
                        className="gap-2"
                      >
                        <PackageCheck className="h-4 w-4" />
                        Mark Fulfilled
                      </Button>
                    )}
                    {(isApproved || isFulfilled) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeRequest.mutate(id)}
                        disabled={closeRequest.isPending}
                        className="gap-2"
                      >
                        <Archive className="h-4 w-4" />
                        Close
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Main Detail View ─────────────────────── */}
        <RequestDetailView
          request={request}
          canApprove={canApprove}
          currentApprovalStep={currentApprovalStep}
          onProcessApproval={handleProcessApproval}
          isProcessing={processApproval.isPending}
        />

        {/* ── Add Comment ──────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Add Comment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              className="min-h-[80px] resize-none"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleAddComment}
                disabled={!commentText.trim() || addComment.isPending}
                size="sm"
              >
                {addComment.isPending ? 'Posting…' : 'Post Comment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
