'use client';

import { useEffect, useState, useCallback } from 'react';
import { Progress } from '@/components/ui/progress';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimerBarProps {
  /** Total time allowed in minutes */
  totalMinutes: number;
  /** Called when time runs out */
  onTimeUp: () => void;
  /** Whether to stop the timer */
  paused?: boolean;
}

export function TimerBar({ totalMinutes, onTimeUp, paused = false }: TimerBarProps) {
  const totalSeconds = totalMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    if (paused) return;
    if (secondsLeft <= 0) {
      onTimeUp();
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, paused, onTimeUp]);

  const percentage = (secondsLeft / totalSeconds) * 100;
  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const isWarning = percentage < 25;
  const isCritical = percentage < 10;

  return (
    <div className="flex items-center gap-3 w-full">
      <Clock className={cn('h-4 w-4 shrink-0', isCritical ? 'text-red-500 animate-pulse' : isWarning ? 'text-yellow-500' : 'text-muted-foreground')} />
      <Progress
        value={percentage}
        className={cn('flex-1 h-2', isCritical ? '[&>div]:bg-red-500' : isWarning ? '[&>div]:bg-yellow-500' : '')}
      />
      <span className={cn(
        'text-sm font-mono tabular-nums shrink-0 min-w-[4ch]',
        isCritical ? 'text-red-500 font-bold' : isWarning ? 'text-yellow-500' : 'text-muted-foreground'
      )}>
        {minutes}:{secs.toString().padStart(2, '0')}
      </span>
    </div>
  );
}
