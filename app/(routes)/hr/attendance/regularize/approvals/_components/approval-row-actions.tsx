'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Check, X } from 'lucide-react';

import {
  useApproveRegularization,
  useRejectRegularization,
} from '@/hooks/hr/use-regularization';
import type { RegularizationRequest } from '@/lib/services/hr/regularization-service';

interface ApprovalRowActionsProps {
  request: RegularizationRequest;
  approverProfileId: string;
}

export function ApprovalRowActions({
  request,
  approverProfileId,
}: ApprovalRowActionsProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const approve = useApproveRegularization();
  const reject = useRejectRegularization();

  if (request.status !== 'pending') {
    return (
      <span className="text-xs text-muted-foreground">
        {request.status === 'approved' ? 'Approved' : 'Rejected'}
      </span>
    );
  }

  const onApprove = () => {
    approve.mutate({ id: request.id, approverProfileId });
  };

  const onReject = () => {
    if (!rejectReason.trim()) return;
    reject.mutate(
      { id: request.id, approverProfileId, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setRejectReason('');
        },
      }
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="default"
        onClick={onApprove}
        disabled={approve.isPending}
      >
        <Check className="mr-1 h-4 w-4" />
        {approve.isPending ? 'Approving…' : 'Approve'}
      </Button>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <X className="mr-1 h-4 w-4" />
            Reject
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject regularization request</DialogTitle>
            <DialogDescription>
              Add a reason. The employee will see this in their request history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rejection-reason">Reason</Label>
            <Textarea
              id="rejection-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. attendance already corrected by HR"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRejectOpen(false)}
              disabled={reject.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onReject}
              disabled={!rejectReason.trim() || reject.isPending}
            >
              {reject.isPending ? 'Rejecting…' : 'Confirm reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
