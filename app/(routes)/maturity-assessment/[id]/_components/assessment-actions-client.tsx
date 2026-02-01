'use client';

import { useRouter } from 'next/navigation';
import { Send, CheckCircle, XCircle, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  useSubmitMaturityAssessment,
  useApproveMaturityAssessment,
  useRejectMaturityAssessment
} from '@/hooks/maturity-assessment';
import type { AssessmentStatus } from '@/types/maturity-assessment';

interface AssessmentActionsClientProps {
  assessmentId: string;
  status: AssessmentStatus;
  canSubmit: boolean;
  canApprove: boolean;
  reviewerId?: string;
}

export function AssessmentActionsClient({
  assessmentId,
  status,
  canSubmit,
  canApprove,
  reviewerId
}: AssessmentActionsClientProps) {
  const router = useRouter();
  const submitMutation = useSubmitMaturityAssessment();
  const approveMutation = useApproveMaturityAssessment();
  const rejectMutation = useRejectMaturityAssessment();

  const handleSubmit = async () => {
    await submitMutation.mutateAsync(assessmentId);
    router.refresh();
  };

  const handleApprove = async () => {
    if (!reviewerId) return;
    await approveMutation.mutateAsync({ id: assessmentId, reviewerId });
    router.refresh();
  };

  const handleReject = async () => {
    await rejectMutation.mutateAsync(assessmentId);
    router.refresh();
  };

  if (status === 'draft' && canSubmit) {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Submit for Review
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Assessment</AlertDialogTitle>
            <AlertDialogDescription>
              This will submit the assessment for review. You will not be able
              to edit it after submission. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
            >
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (status === 'submitted' && canApprove) {
    return (
      <div className="flex gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-red-600">
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject Assessment</AlertDialogTitle>
              <AlertDialogDescription>
                This will return the assessment to draft status so the assessor
                can make changes. Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReject}
                disabled={rejectMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                Reject
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve Assessment</AlertDialogTitle>
              <AlertDialogDescription>
                This will approve the assessment and make it the official record.
                Are you sure?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApprove}
                disabled={approveMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                Approve
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return null;
}
