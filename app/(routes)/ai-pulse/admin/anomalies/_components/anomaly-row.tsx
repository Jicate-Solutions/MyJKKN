'use client';

// Created: 2026-05-06 — AI Pulse module v3 (Wave B.5 Anomaly Review console)
//
// Renders one anomaly flag row: type badge, target user/team, signal value
// vs threshold, created_at, "Review" button. The button hands the flag back
// to the parent list component, which opens the review dialog.

import { format } from 'date-fns';
import { ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type {
  AnomalyFlagRow,
  AnomalyFlagType,
} from '@/lib/services/ai-pulse/anomaly-service';

const FLAG_TYPE_LABELS: Record<AnomalyFlagType, string> = {
  intra_dept_scoring_outlier: 'Intra-dept scoring outlier',
  random_poll_response_pattern: 'Random poll-response pattern',
  ig_reach_inconsistent: 'IG reach inconsistent',
  rotation_gaming: 'Rotation gaming',
  excuse_frequency_outlier: 'Excuse-frequency outlier',
};

const OUTCOME_VARIANT: Record<
  AnomalyFlagRow['review_outcome'],
  'default' | 'destructive' | 'success' | 'secondary' | 'outline'
> = {
  pending: 'outline',
  confirmed_anomaly: 'destructive',
  false_positive: 'success',
  inconclusive: 'secondary',
};

const OUTCOME_LABEL: Record<AnomalyFlagRow['review_outcome'], string> = {
  pending: 'Pending review',
  confirmed_anomaly: 'Confirmed',
  false_positive: 'False positive',
  inconclusive: 'Inconclusive',
};

interface AnomalyRowProps {
  flag: AnomalyFlagRow;
  onReview: (flag: AnomalyFlagRow) => void;
}

export function AnomalyRow({ flag, onReview }: AnomalyRowProps) {
  const flagLabel = FLAG_TYPE_LABELS[flag.flag_type] ?? flag.flag_type;
  const isPending = flag.review_outcome === 'pending';

  let signalSummary: string | null = null;
  if (flag.signal_value !== null && flag.signal_threshold !== null) {
    signalSummary = `${flag.signal_value} vs ${flag.signal_threshold}`;
  }

  let createdLabel = flag.created_at;
  try {
    createdLabel = format(new Date(flag.created_at), 'd MMM yyyy, HH:mm');
  } catch {
    /* fall back to raw string */
  }

  return (
    <Card className='overflow-hidden'>
      <CardContent className='flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between'>
        <div className='flex flex-1 flex-col gap-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='outline' className='gap-1 font-mono text-[11px]'>
              <ShieldAlert className='h-3 w-3' />
              {flagLabel}
            </Badge>
            <Badge variant={OUTCOME_VARIANT[flag.review_outcome]}>
              {OUTCOME_LABEL[flag.review_outcome]}
            </Badge>
          </div>

          <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
            <span>
              <span className='font-medium text-foreground'>Created:</span> {createdLabel}
            </span>
            {flag.target_user_id && (
              <span>
                <span className='font-medium text-foreground'>Target user:</span>{' '}
                <code className='font-mono'>{flag.target_user_id}</code>
              </span>
            )}
            {signalSummary && (
              <span>
                <span className='font-medium text-foreground'>Signal:</span>{' '}
                {signalSummary}
              </span>
            )}
            {flag.startup_event_id && (
              <span>
                <span className='font-medium text-foreground'>Event:</span>{' '}
                <code className='font-mono'>{flag.startup_event_id.slice(0, 8)}</code>
              </span>
            )}
          </div>

          {flag.review_notes && (
            <p className='text-xs text-muted-foreground'>
              <span className='font-medium text-foreground'>Notes:</span>{' '}
              {flag.review_notes}
            </p>
          )}
        </div>

        <div className='flex shrink-0 items-center gap-2'>
          <Button
            variant={isPending ? 'default' : 'outline'}
            size='sm'
            onClick={() => onReview(flag)}
          >
            {isPending ? 'Review' : 'Re-review'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
