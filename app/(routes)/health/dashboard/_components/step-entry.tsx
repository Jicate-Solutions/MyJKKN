'use client';

// step-entry.tsx
// Manual step count entry card with SVG circular progress ring
// Usage: <StepEntry learnerId={learnerId} currentSteps={log.step_count} />

import { useState, useRef, useEffect } from 'react';
import { Footprints, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DEFAULT_STEP_GOAL } from '@/types/health';
import { useUpdateSteps } from '@/hooks/health/use-health';

// ─── Props ────────────────────────────────────────────────────────────────────

interface StepEntryProps {
  learnerId: string;
  currentSteps: number;
  goal?: number;
}

// ─── Circular Progress Ring ───────────────────────────────────────────────────

interface CircularRingProps {
  steps: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
}

function CircularRing({ steps, goal, size = 140, strokeWidth = 10 }: CircularRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(steps / goal, 1);
  const offset = circumference * (1 - pct);

  // Colour shifts as progress increases
  const colour =
    pct >= 1
      ? '#10b981'   // emerald-500 — goal reached
      : pct >= 0.6
      ? '#3b82f6'   // blue-500
      : pct >= 0.3
      ? '#f59e0b'   // amber-500
      : '#94a3b8';  // slate-400 — just starting

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="block"
      aria-hidden="true"
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/30"
      />
      {/* Progress arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-all duration-700 ease-out"
        style={{ filter: pct > 0 ? `drop-shadow(0 0 4px ${colour}80)` : 'none' }}
      />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepEntry({
  learnerId,
  currentSteps,
  goal = DEFAULT_STEP_GOAL,
}: StepEntryProps) {
  const [inputValue, setInputValue] = useState(currentSteps > 0 ? String(currentSteps) : '');
  const [tipVisible, setTipVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mutation = useUpdateSteps();

  // Keep input in sync if parent updates (e.g. after refetch) but only when not actively editing
  useEffect(() => {
    if (focused) return;
    setInputValue(currentSteps > 0 ? String(currentSteps) : '');
  }, [currentSteps, focused]);

  const [focused, setFocused] = useState(false);
  const parsedSteps = Math.max(0, Math.min(Number(inputValue) || 0, 99999));
  const displaySteps = focused ? parsedSteps : currentSteps;
  const pct = Math.round(Math.min((displaySteps / goal) * 100, 100));
  const goalReached = currentSteps >= goal;

  function handleSave() {
    if (mutation.isPending) return;
    mutation.mutate({ learnerId, steps: parsedSteps });
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-base">Steps Today</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Goal: {goal.toLocaleString()} steps
          </p>
        </div>
        {goalReached && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full animate-in fade-in slide-in-from-right-2">
            Goal reached!
          </span>
        )}
      </div>

      {/* Ring + number centred */}
      <div className="flex flex-col items-center mb-5">
        <div className="relative flex items-center justify-center">
          <CircularRing steps={displaySteps} goal={goal} />
          <div className="absolute flex flex-col items-center">
            <span className="text-2xl font-bold tabular-nums leading-none">
              {displaySteps.toLocaleString()}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium mt-0.5">
              {pct}% of goal
            </span>
          </div>
        </div>
      </div>

      {/* Numeric input */}
      <div className="mb-2">
        <label htmlFor="step-input" className="sr-only">
          Step count
        </label>
        <div className="relative flex items-center">
          <Footprints className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            id="step-input"
            ref={inputRef}
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={99999}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Enter step count"
            className={cn(
              'w-full pl-9 pr-4 py-3 rounded-xl border bg-muted/30 text-base font-medium',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
              'transition-all duration-150 placeholder:text-muted-foreground/60',
              '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
            )}
          />
        </div>
      </div>

      {/* Helper tip */}
      <div className="mb-4">
        <button
          onClick={() => setTipVisible((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="w-3.5 h-3.5" />
          Where do I find my step count?
        </button>
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            tipVisible ? 'max-h-20 mt-2 opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 rounded-lg px-3 py-2">
            Check <strong>Google Fit</strong>, <strong>Samsung Health</strong>, or{' '}
            <strong>Apple Health</strong> for today&apos;s step count, then enter it here.
          </p>
        </div>
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={mutation.isPending || parsedSteps === currentSteps}
        className="w-full h-12 text-base font-semibold rounded-xl transition-all duration-150"
      >
        {mutation.isPending ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Saving...
          </span>
        ) : (
          'Save Steps'
        )}
      </Button>
    </div>
  );
}
