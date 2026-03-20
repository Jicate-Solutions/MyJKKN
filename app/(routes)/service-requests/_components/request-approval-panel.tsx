'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import type { ProcessApprovalDto, ServiceRequestApprovalStep } from '@/types/service-request';

interface RequestApprovalPanelProps {
  currentStep: ServiceRequestApprovalStep | null;
  onProcessApproval: (data: ProcessApprovalDto) => void;
  isProcessing?: boolean;
}

export function RequestApprovalPanel({
  currentStep,
  onProcessApproval,
  isProcessing,
}: RequestApprovalPanelProps) {
  const [confirmAction, setConfirmAction] = useState<ProcessApprovalDto['action'] | null>(null);
  const [comments, setComments] = useState('');

  const handleConfirm = () => {
    if (!confirmAction) return;
    onProcessApproval({ action: confirmAction, comments: comments.trim() || undefined });
    setConfirmAction(null);
    setComments('');
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Approval Actions</CardTitle>
          {currentStep && (
            <p className="text-sm text-muted-foreground">
              Current step: <span className="font-medium">{currentStep.step_name}</span>
              {' (Step '}{currentStep.step_order}{')'}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full gap-2"
            variant="default"
            onClick={() => setConfirmAction('approved')}
            disabled={isProcessing}
          >
            <CheckCircle className="h-4 w-4" />
            Approve
          </Button>
          <Button
            className="w-full gap-2"
            variant="outline"
            onClick={() => setConfirmAction('returned')}
            disabled={isProcessing}
          >
            <RotateCcw className="h-4 w-4" />
            Return for Revision
          </Button>
          <Button
            className="w-full gap-2"
            variant="destructive"
            onClick={() => setConfirmAction('rejected')}
            disabled={isProcessing}
          >
            <XCircle className="h-4 w-4" />
            Reject
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setComments('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'approved' && 'Approve Request'}
              {confirmAction === 'rejected' && 'Reject Request'}
              {confirmAction === 'returned' && 'Return for Revision'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'approved' && 'This will approve the request and advance to the next step.'}
              {confirmAction === 'rejected' && 'This will reject the request permanently. Please provide a reason.'}
              {confirmAction === 'returned' && 'This will return the request to the requester for revision.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="approval-comments">
              Comments
              {confirmAction === 'rejected' && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Textarea
              id="approval-comments"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder={
                confirmAction === 'approved'
                  ? 'Optional comments...'
                  : 'Provide a reason...'
              }
              className="min-h-[100px]"
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmAction(null);
                setComments('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={
                confirmAction === 'approved' ? 'default' :
                confirmAction === 'rejected' ? 'destructive' : 'outline'
              }
              onClick={handleConfirm}
              disabled={
                isProcessing ||
                (confirmAction === 'rejected' && !comments.trim())
              }
            >
              {isProcessing ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
