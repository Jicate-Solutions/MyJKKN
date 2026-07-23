'use client';

/**
 * Change Decision Dialog
 *
 * Approve or reject a submitted / under-review change request. Sets status to
 * 'approved' or 'rejected', stamps decided_at. decided_by is resolved from the
 * current session by ChangeService (omitted here).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F14.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleSlash, Loader2 } from 'lucide-react';
import { useDecideChangeRequest } from '@/hooks/projects/use-changes';
import type { ProjectChangeRequest } from '@/types/projects';

interface ChangeDecisionDialogProps {
  changeRequest: ProjectChangeRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangeDecisionDialog({
  changeRequest,
  open,
  onOpenChange,
}: ChangeDecisionDialogProps) {
  const decideChangeRequest = useDecideChangeRequest();
  const [pendingDecision, setPendingDecision] = useState<
    'approved' | 'rejected' | null
  >(null);

  function handleDecide(status: 'approved' | 'rejected') {
    setPendingDecision(status);
    decideChangeRequest.mutate(
      {
        id: changeRequest.id,
        decision: {
          status,
          // decided_by omitted → ChangeService resolves it to the session actor.
        },
      },
      {
        onSuccess: () => {
          toast.success(
            status === 'approved'
              ? 'Change request approved'
              : 'Change request rejected'
          );
          setPendingDecision(null);
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(`Failed: ${err.message}`);
          setPendingDecision(null);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review Change Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Scale indicator */}
          <div className="flex items-center gap-2">
            <Badge
              className={
                changeRequest.is_major
                  ? 'bg-orange-500 text-white font-semibold'
                  : 'bg-muted text-muted-foreground'
              }
            >
              {changeRequest.is_major ? 'Major' : 'Minor'}
            </Badge>
            <span className="text-xs text-muted-foreground capitalize">
              {changeRequest.change_type}
            </span>
          </div>

          {/* Title */}
          <div>
            <p className="font-semibold text-base">{changeRequest.title}</p>
            {changeRequest.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {changeRequest.description}
              </p>
            )}
          </div>

          {/* Impact */}
          {changeRequest.impact_summary && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Impact Summary
              </p>
              <p className="text-sm">{changeRequest.impact_summary}</p>
            </div>
          )}

          {changeRequest.is_major && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
              <p className="text-xs font-semibold text-orange-700">
                This is a major change and may require additional stakeholder sign-off.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={decideChangeRequest.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleDecide('rejected')}
            disabled={decideChangeRequest.isPending}
            className="gap-1.5"
          >
            {pendingDecision === 'rejected' && decideChangeRequest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CircleSlash className="h-4 w-4" />
            )}
            Reject
          </Button>
          <Button
            onClick={() => handleDecide('approved')}
            disabled={decideChangeRequest.isPending}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            {pendingDecision === 'approved' && decideChangeRequest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
