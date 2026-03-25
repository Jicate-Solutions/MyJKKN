'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, User, Mail, Building2, Calendar, MessageSquare } from 'lucide-react';
import { ProfileChangeRequest } from '@/types/learner-profile-change';
import { RequestDetailCard } from './request-detail-card';
import { format } from 'date-fns';

interface RequestDetailClientProps {
  request: ProfileChangeRequest;
  userId: string;
}

/**
 * Request Detail Client Component
 *
 * Features:
 * - Student info header
 * - Comparison display (current vs requested)
 * - Action buttons (Approve/Reject)
 * - Approval/Rejection dialogs
 * - Read-only view for approved/rejected requests
 */
export function RequestDetailClient({ request, userId }: RequestDetailClientProps) {
  const router = useRouter();
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [isRejectionDialogOpen, setIsRejectionDialogOpen] = useState(false);
  const [approvalComments, setApprovalComments] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPending = request.request_status === 'pending';
  const isApproved = request.request_status === 'approved';
  const isRejected = request.request_status === 'rejected';

  // Handle approval
  const handleApprove = async () => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/learners/change-requests/${request.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_comments: approvalComments.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to approve request');
      }

      toast.success('Request approved successfully!');
      setIsApprovalDialogOpen(false);
      router.refresh();
    } catch (error: any) {
      console.error('[request-detail-client] Approval error:', error);
      toast.error(error.message || 'Failed to approve request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle rejection
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/learners/change-requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_comments: rejectionReason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to reject request');
      }

      toast.success('Request rejected successfully!');
      setIsRejectionDialogOpen(false);
      router.refresh();
    } catch (error: any) {
      console.error('[request-detail-client] Rejection error:', error);
      toast.error(error.message || 'Failed to reject request');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Student Info Header Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-xl">
                {request.learner?.first_name} {request.learner?.last_name}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <User className="h-4 w-4" />
                Roll No: {request.learner?.roll_number || 'N/A'}
              </CardDescription>
            </div>
            {getStatusBadge(request.request_status)}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">College Email</p>
                <p className="text-sm">{request.learner?.college_email || 'Not assigned'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Institution</p>
                <p className="text-sm">{request.learner?.institution?.name || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Department</p>
                <p className="text-sm">{request.learner?.department?.department_name || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Program</p>
                <p className="text-sm">{request.learner?.program?.program_name || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Submitted At</p>
                <p className="text-sm">
                  {format(new Date(request.submitted_at), 'PPpp')}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Submitted By</p>
                <p className="text-sm">{request.submitter?.full_name || 'N/A'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Display */}
      {request.learner && (
        <RequestDetailCard
          currentData={request.learner}
          changedFields={request.changed_fields}
        />
      )}

      {/* Decision Details Card (for approved/rejected requests) */}
      {(isApproved || isRejected) && (
        <Card className={isApproved ? 'border-green-500' : 'border-red-500'}>
          <CardHeader className={isApproved ? 'bg-green-50' : 'bg-red-50'}>
            <CardTitle className="flex items-center gap-2">
              {isApproved ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-green-900">Approved</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="text-red-900">Rejected</span>
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reviewed By</p>
                <p className="text-sm">{request.reviewer?.full_name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Reviewed At</p>
                <p className="text-sm">
                  {request.reviewed_at ? format(new Date(request.reviewed_at), 'PPpp') : 'N/A'}
                </p>
              </div>
              {request.review_comments && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Comments</p>
                  <p className="text-sm whitespace-pre-wrap">{request.review_comments}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons (only for pending requests) */}
      {isPending && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button
                variant="outline"
                className="text-red-600 hover:bg-red-50 border-red-300"
                onClick={() => setIsRejectionDialogOpen(true)}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject Request
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setIsApprovalDialogOpen(true)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approval Dialog */}
      <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Approve Change Request
            </DialogTitle>
            <DialogDescription>
              This will update the student's profile with the requested changes.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="approval-comments">Comments (Optional)</Label>
              <Textarea
                id="approval-comments"
                placeholder="Add any comments about this approval..."
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsApprovalDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? 'Approving...' : 'Confirm Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={isRejectionDialogOpen} onOpenChange={setIsRejectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Reject Change Request
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this request.
              The student will be notified of your decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection-reason">
                Rejection Reason <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                placeholder="Explain why this request is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRejectionDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isSubmitting || !rejectionReason.trim()}
              variant="destructive"
            >
              {isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
