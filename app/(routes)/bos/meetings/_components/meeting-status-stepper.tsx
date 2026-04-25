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
}

export function MeetingStatusStepper({ currentStatus, className }: MeetingStatusStepperProps) {
  const currentIndex = BOS_MEETING_STATUS_ORDER.indexOf(currentStatus);

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <ol className='flex items-center min-w-max'>
        {BOS_MEETING_STATUS_ORDER.map((status, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === BOS_MEETING_STATUS_ORDER.length - 1;

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
