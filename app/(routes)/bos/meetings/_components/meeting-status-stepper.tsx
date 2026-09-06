'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import {
  BosMeetingStatus,
  BOS_MEETING_STATUS_ORDER,
  BOS_MEETING_STATUS_LABELS,
} from '@/types/bos';

interface MeetingStatusStepperProps {
  currentStatus: BosMeetingStatus;
  className?: string;
  /**
   * Ordered list of statuses to render. Defaults to the full BoS 8-state order.
   * Academic Council meetings pass AC_MEETING_STATUS_ORDER (a shorter flow with
   * no principal-approval or ratification steps).
   */
  order?: BosMeetingStatus[];
}

export function MeetingStatusStepper({ currentStatus, className, order }: MeetingStatusStepperProps) {
  const statusOrder = order ?? BOS_MEETING_STATUS_ORDER;
  // 'completed' was removed from BOS_MEETING_STATUS_ORDER on 2026-05-20 so the
  // visible workflow skips that step. But legacy meetings (created before the
  // skip-chain shipped) may still be recorded with status='completed' in the
  // DB. Without this mapping, indexOf returns -1 and NO step renders as
  // completed — the user sees an all-grey stepper that looks broken. Map
  // 'completed' to the next visible step ('minutes_drafted') so all prior
  // steps green-tick correctly and the next-visible step is highlighted.
  const displayStatus =
    currentStatus === 'completed' ? 'minutes_drafted' : currentStatus;
  const currentIndex = statusOrder.indexOf(displayStatus);

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <ol className='flex items-center min-w-max'>
        {statusOrder.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === statusOrder.length - 1;

          return (
            <li key={status} className='flex items-center'>
              {/* Step circle */}
              <div className='flex flex-col items-center'>
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                    isCompleted
                      ? 'border-primary bg-primary text-primary-foreground'
                      : isCurrent
                      ? 'border-primary bg-background text-primary'
                      : 'border-muted-foreground/30 bg-background text-muted-foreground/50'
                  )}
                >
                  {isCompleted ? (
                    <Check className='h-3.5 w-3.5' />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {/* Label */}
                <span
                  className={cn(
                    'mt-1.5 whitespace-nowrap text-[10px] font-medium leading-tight text-center max-w-[72px]',
                    isCurrent
                      ? 'text-primary'
                      : isCompleted
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50'
                  )}
                >
                  {BOS_MEETING_STATUS_LABELS[status]}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'mx-1 h-0.5 w-8 flex-shrink-0 transition-colors',
                    index < currentIndex ? 'bg-primary' : 'bg-muted-foreground/20'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
