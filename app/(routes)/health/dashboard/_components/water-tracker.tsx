'use client';

// water-tracker.tsx
// Visual 8-glass water tracker — tap any glass to fill up to that position
// Usage: <WaterTracker learnerId={learnerId} currentGlasses={log.water_glasses} />

import { Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_WATER_GOAL } from '@/types/health';
import { useUpdateWater } from '@/hooks/health/use-health';

// ─── Props ────────────────────────────────────────────────────────────────────

interface WaterTrackerProps {
  learnerId: string;
  currentGlasses: number;
  goal?: number;
}

// ─── Single Glass Icon ────────────────────────────────────────────────────────

interface GlassProps {
  index: number;          // 1-based
  filled: boolean;
  pending: boolean;
  onClick: () => void;
}

function Glass({ index, filled, pending, onClick }: GlassProps) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      aria-label={`Glass ${index}`}
      aria-pressed={filled}
      className={cn(
        'flex flex-col items-center justify-center rounded-xl transition-all duration-200',
        'min-w-[40px] min-h-[52px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
        'active:scale-90',
        filled
          ? 'text-blue-500 scale-105'
          : 'text-muted-foreground/40 hover:text-muted-foreground',
        pending && 'opacity-60 cursor-wait',
      )}
    >
      <Droplets
        className={cn(
          'w-7 h-7 transition-all duration-300',
          filled && 'fill-blue-400 drop-shadow-[0_0_4px_rgba(59,130,246,0.5)]',
        )}
        strokeWidth={filled ? 1 : 1.5}
      />
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WaterTracker({
  learnerId,
  currentGlasses,
  goal = DEFAULT_WATER_GOAL,
}: WaterTrackerProps) {
  const mutation = useUpdateWater();

  function handleGlassTap(glassIndex: number) {
    // If already at this exact level, toggle off (set to 0), otherwise fill up to it
    const newValue = currentGlasses === glassIndex ? glassIndex - 1 : glassIndex;
    mutation.mutate({ learnerId, glasses: Math.max(0, Math.min(newValue, goal)) });
  }

  const pct = Math.round((currentGlasses / goal) * 100);
  const allDone = currentGlasses >= goal;

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-base">Water Intake</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Stay hydrated today</p>
        </div>
        {allDone && (
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full animate-in fade-in slide-in-from-right-2">
            Goal reached!
          </span>
        )}
      </div>

      {/* Glasses grid — 8 in a single row on mobile, wraps naturally */}
      <div className="flex flex-wrap gap-1 justify-between mb-4" role="group" aria-label="Water glasses">
        {Array.from({ length: goal }, (_, i) => {
          const glassIndex = i + 1;
          return (
            <Glass
              key={glassIndex}
              index={glassIndex}
              filled={glassIndex <= currentGlasses}
              pending={mutation.isPending}
              onClick={() => handleGlassTap(glassIndex)}
            />
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-blue-400 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={currentGlasses}
          aria-valuemin={0}
          aria-valuemax={goal}
        />
      </div>

      {/* Count text */}
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="text-lg font-bold text-blue-500">{currentGlasses}</span>
          <span className="mx-1 text-muted-foreground/60">/</span>
          <span className="font-medium">{goal}</span>
          <span className="ml-1">glasses</span>
        </p>
        <p className="text-xs text-muted-foreground">{pct}%</p>
      </div>
    </div>
  );
}
