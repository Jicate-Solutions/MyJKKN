'use client';
// app/(routes)/learners/my-profile/_components/pending-changes-banner.tsx

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { ChangeRequestStatus } from '@/types/learner-profile-change';
import { useCancelChangeRequest } from '@/hooks/learner-profile/use-change-request-mutations';

interface PendingChangesBannerProps {
  requestId: string;
  status: ChangeRequestStatus;
  submittedAt: string;
  reviewComments?: string;
  /**
   * Optional: new student_photo_url from the pending request's changed_fields.
   * When set (and status is 'pending'), the banner renders a small preview of
   * the uploaded photo so students can confirm their upload went through.
   * Addresses the "photo not uploading" cluster (BUG-003067 et al) where the
   * upload did in fact succeed into a pending change request but students had
   * no visual feedback and assumed the feature was broken.
   */
  pendingPhotoUrl?: string | null;
}

export function PendingChangesBanner({
  requestId,
  status,
  submittedAt,
  reviewComments,
  pendingPhotoUrl,
}: PendingChangesBannerProps) {
  const { mutate: cancelRequest, isPending: isCancelling } = useCancelChangeRequest();

  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: Clock,
          iconColor: 'text-yellow-600',
          bgColor: 'bg-yellow-50 border-yellow-200',
          title: 'Changes Pending Approval',
          description: `Submitted ${formatDistanceToNow(new Date(submittedAt), { addSuffix: true })}. Your requested changes are being reviewed by your department.`,
        };
      case 'approved':
        return {
          icon: CheckCircle2,
          iconColor: 'text-green-600',
          bgColor: 'bg-green-50 border-green-200',
          title: 'Changes Approved',
          description: 'Your profile has been updated with the approved changes.',
        };
      case 'rejected':
        return {
          icon: XCircle,
          iconColor: 'text-red-600',
          bgColor: 'bg-red-50 border-red-200',
          title: 'Changes Rejected',
          description: reviewComments || 'Your change request was rejected. Please review the feedback below.',
        };
      case 'cancelled':
        return {
          icon: XCircle,
          iconColor: 'text-gray-600',
          bgColor: 'bg-gray-50 border-gray-200',
          title: 'Request Cancelled',
          description: 'Your change request was cancelled.',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <Alert className={config.bgColor}>
      <Icon className={`h-5 w-5 ${config.iconColor}`} />
      <AlertTitle className="flex items-center gap-2">
        {config.title}
        <Badge variant={status === 'approved' ? 'default' : 'outline'}>
          {status.toUpperCase()}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p>{config.description}</p>

        {/* Pending photo preview — visual confirmation that the upload landed
            in the change request (addresses the "photo not uploading" cluster). */}
        {status === 'pending' && pendingPhotoUrl && (
          <div className="mt-3 flex items-center gap-3 p-3 bg-white rounded-md border border-yellow-200">
            <div className="relative w-14 h-14 flex-shrink-0 rounded-full overflow-hidden border-2 border-yellow-400">
              <Image
                src={pendingPhotoUrl}
                alt="Pending profile photo"
                fill
                className="object-cover"
                sizes="56px"
              />
            </div>
            <div className="text-sm">
              <p className="font-medium text-yellow-900">
                Your new profile photo was uploaded successfully.
              </p>
              <p className="text-yellow-800 mt-0.5">
                It will appear across the app once your department approves this request.
              </p>
            </div>
          </div>
        )}

        {/* Show rejection feedback */}
        {status === 'rejected' && reviewComments && (
          <div className="mt-3 p-3 bg-white rounded-md border border-red-200">
            <p className="text-sm font-medium text-red-900">Reviewer Feedback:</p>
            <p className="text-sm text-red-700 mt-1">{reviewComments}</p>
          </div>
        )}

        {/* Cancel button for pending requests */}
        {status === 'pending' && (
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancelRequest(requestId)}
              disabled={isCancelling}
            >
              {isCancelling ? 'Cancelling...' : 'Cancel Request'}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
