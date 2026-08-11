'use client';

// Manual re-run of the automatic lifecycle promotion for one learner.
//
// The payment triggers do this automatically on every payment (see migration
// 20260811140000). This button exists for the case the accounts team actually
// reported: a learner whose status looks behind their payments. It answers the
// question either way — it promotes them, or it tells you exactly how far short
// they are, which is the more common and more useful outcome.
//
// It cannot be used to skip the rules. The RPC applies the thresholds from
// admission_statuses, only ever promotes, and no-ops outside account/reserved.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { OnboardingService } from '@/lib/services/billing/onboarding/onboarding-service';
import { getErrorMessage } from '@/lib/utils';

interface ReevaluateStatusButtonProps {
  studentId: string;
  /** Current lifecycle status, used only to explain a no-op before calling. */
  lifecycleStatus?: string | null;
  /** Refetch the page's data so the header badge reflects a promotion. */
  onEvaluated?: () => void;
}

/** The only two statuses the evaluator can act on — mirrors the RPC's guard. */
const EVALUABLE = new Set(['account', 'reserved']);

export function ReevaluateStatusButton({
  studentId,
  lifecycleStatus,
  onEvaluated
}: ReevaluateStatusButtonProps) {
  const [isRunning, setIsRunning] = useState(false);

  const handleClick = async () => {
    if (isRunning) return;
    setIsRunning(true);

    try {
      const result = await OnboardingService.reevaluateStatus(studentId);

      if (result.updated) {
        toast.success('Status updated', {
          description: `Promoted to ${result.finalStatus ?? 'the next stage'} — ${result.paidPct ?? 0}% paid.`
        });
        onEvaluated?.();
        return;
      }

      // Not an error. Say WHY nothing moved, because "no change" with no reason
      // is exactly the silence that let this pipeline stall unnoticed.
      if (result.reason === 'no_op_for_status') {
        toast.info('No change', {
          description: `Automatic promotion only applies to Account and Reserved learners. This learner is ${result.finalStatus ?? lifecycleStatus ?? 'in another status'}.`
        });
      } else if (result.threshold != null) {
        toast.info('No change', {
          description: `Paid ${result.paidPct ?? 0}% — the next stage needs ${result.threshold}%.`
        });
      } else {
        toast.info('No change', {
          description: `Paid ${result.paidPct ?? 0}%. The learner has not met the criteria for the next stage yet.`
        });
      }
    } catch (error) {
      toast.error('Re-evaluation failed', {
        description: getErrorMessage(error)
      });
    } finally {
      setIsRunning(false);
    }
  };

  const notEvaluable =
    !!lifecycleStatus && !EVALUABLE.has(lifecycleStatus);

  return (
    <Button
      variant='outline'
      onClick={handleClick}
      disabled={isRunning || notEvaluable}
      className='w-full sm:w-auto'
      title={
        notEvaluable
          ? 'Automatic promotion applies only to Account and Reserved learners'
          : 'Re-run the automatic status check against this learner’s payments'
      }
    >
      {isRunning ? (
        <>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          Checking…
        </>
      ) : (
        <>
          <RefreshCw className='mr-2 h-4 w-4' />
          Re-evaluate Status
        </>
      )}
    </Button>
  );
}
