'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface AdvanceControlsProps {
  submissionId: string;
  currentStepLabel: string;
}

export function AdvanceControls({
  submissionId,
  currentStepLabel,
}: AdvanceControlsProps) {
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  function dispatch(action: 'approve' | 'reject') {
    if (!reason.trim()) {
      toast({
        title: 'Reason required',
        description: 'Add a short reason for the audit trail.',
        variant: 'destructive',
      });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/hr/forms/submissions/${submissionId}/advance`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, reason }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        toast({
          title: action === 'approve' ? 'Submission approved' : 'Submission rejected',
          description: `Step "${currentStepLabel}" recorded.`,
        });
        router.refresh();
      } catch (err) {
        toast({
          title: 'Action failed',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      }
    });
  }

  return (
    <div className="space-y-3" data-test="advance-controls">
      <div className="space-y-1">
        <Label htmlFor="advance-reason">Reason (required)</Label>
        <Input
          id="advance-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder='e.g. "Looks good, proceeding to HOD" or "Budget mismatch — please resubmit"'
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => dispatch('approve')}
          disabled={isPending}
          data-test="approve-step"
        >
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Approve step
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => dispatch('reject')}
          disabled={isPending}
          data-test="reject-step"
        >
          <XCircle className="h-4 w-4 mr-2" />
          Reject
        </Button>
      </div>
    </div>
  );
}
