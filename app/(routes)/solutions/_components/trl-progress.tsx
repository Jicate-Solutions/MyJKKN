'use client';

import { Check, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TRL_LEVELS } from './trl-badge';

interface TRLProgressProps {
  currentTRL: number;
  targetTRL?: number;
  className?: string;
}

export function TRLProgress({ currentTRL, targetTRL, className }: TRLProgressProps) {
  const levels = Object.keys(TRL_LEVELS).map(Number);

  return (
    <div className={cn('relative', className)}>
      {/* RDIF Threshold Marker */}
      <div className="absolute top-0 left-[33%] -translate-x-1/2 -translate-y-6">
        <div className="flex flex-col items-center">
          <div className="text-xs font-semibold text-[#0b6d41] whitespace-nowrap">
            RDIF Threshold
          </div>
          <div className="w-px h-4 bg-[#0b6d41]" />
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex items-center justify-between gap-2 mt-8">
        {levels.map((level, index) => {
          const isCompleted = level < currentTRL;
          const isCurrent = level === currentTRL;
          const isTarget = targetTRL && level === targetTRL;
          const isRDIFThreshold = level === 4;

          const trlLevel = TRL_LEVELS[level as keyof typeof TRL_LEVELS];

          return (
            <div key={level} className="flex flex-col items-center flex-1">
              {/* Level Indicator */}
              <div
                className={cn(
                  'relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all',
                  isCompleted && 'bg-green-500 border-green-600 text-white',
                  isCurrent && `bg-blue-500 border-blue-600 text-white animate-pulse`,
                  !isCompleted && !isCurrent && 'bg-gray-200 border-gray-300 text-gray-500',
                  isRDIFThreshold && 'ring-2 ring-[#0b6d41] ring-offset-2'
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : isCurrent ? (
                  <span className="text-sm font-bold">{level}</span>
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                {isTarget && (
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 border-2 border-white rounded-full" />
                )}
              </div>

              {/* Connector Line */}
              {index < levels.length - 1 && (
                <div className="absolute h-0.5 bg-gray-300" style={{ width: 'calc(11.11% - 1rem)', left: `${(index / levels.length) * 100 + 5.5}%`, top: '1.25rem' }}>
                  <div
                    className={cn(
                      'h-full transition-all',
                      level < currentTRL && 'bg-green-500'
                    )}
                  />
                </div>
              )}

              {/* Level Number */}
              <div className="mt-2 text-xs font-semibold text-muted-foreground">
                {level}
              </div>

              {/* Level Name (on hover or below) */}
              <div
                className="mt-1 text-xs text-center text-muted-foreground max-w-[80px] line-clamp-2 hidden sm:block"
                title={trlLevel.name}
              >
                {trlLevel.name}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mt-8 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white">
            <Check className="h-3 w-3" />
          </div>
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white">
            <span className="text-xs font-bold">{currentTRL}</span>
          </div>
          <span>Current</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
            <Circle className="h-3 w-3" />
          </div>
          <span>Future</span>
        </div>
      </div>
    </div>
  );
}
