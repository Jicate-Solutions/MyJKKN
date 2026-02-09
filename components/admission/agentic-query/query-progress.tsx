'use client';

// components/admission/agentic-query/query-progress.tsx
// Progress indicator showing query processing steps

import { Check, Loader2, AlertCircle, Brain, Route, Database, BarChart3, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface QueryStep {
  id: string;
  name: 'understanding' | 'planning' | 'executing' | 'analyzing' | 'responding';
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  message?: string;
  details?: string;
}

interface QueryProgressProps {
  steps: QueryStep[];
  className?: string;
  variant?: 'default' | 'compact' | 'minimal';
}

const STEP_CONFIG = {
  understanding: {
    label: 'Understanding',
    icon: Brain,
    description: 'Analyzing your query',
  },
  planning: {
    label: 'Planning',
    icon: Route,
    description: 'Determining data needs',
  },
  executing: {
    label: 'Executing',
    icon: Database,
    description: 'Fetching data',
  },
  analyzing: {
    label: 'Analyzing',
    icon: BarChart3,
    description: 'Processing results',
  },
  responding: {
    label: 'Responding',
    icon: MessageSquare,
    description: 'Generating response',
  },
};

const STEP_ORDER: QueryStep['name'][] = ['understanding', 'planning', 'executing', 'analyzing', 'responding'];

export function QueryProgress({ steps, className, variant = 'default' }: QueryProgressProps) {
  // Build complete step list with status
  const allSteps = STEP_ORDER.map((name) => {
    const step = steps.find((s) => s.name === name);
    return {
      name,
      ...STEP_CONFIG[name],
      status: step?.status || 'pending',
      message: step?.message,
      details: step?.details,
    };
  });

  if (variant === 'minimal') {
    return <QueryProgressMinimal steps={allSteps} className={className} />;
  }

  if (variant === 'compact') {
    return <QueryProgressCompact steps={allSteps} className={className} />;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {allSteps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.status === 'in_progress';
        const isCompleted = step.status === 'completed';
        const isError = step.status === 'error';
        const isPending = step.status === 'pending';

        return (
          <motion.div
            key={step.name}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border transition-all duration-300',
              isActive && 'bg-primary/5 border-primary/30',
              isCompleted && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900',
              isError && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900',
              isPending && 'opacity-50'
            )}
          >
            {/* Status indicator */}
            <div
              className={cn(
                'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                isActive && 'bg-primary text-primary-foreground',
                isCompleted && 'bg-green-500 text-white',
                isError && 'bg-red-500 text-white',
                isPending && 'bg-muted text-muted-foreground'
              )}
            >
              {isActive ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isCompleted ? (
                <Check className="h-4 w-4" />
              ) : isError ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'font-medium text-sm',
                  isActive && 'text-primary',
                  isCompleted && 'text-green-700 dark:text-green-400',
                  isError && 'text-red-700 dark:text-red-400'
                )}>
                  {step.label}
                </span>
                {isActive && (
                  <span className="text-xs text-muted-foreground animate-pulse">
                    Processing...
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {(step.message || step.description) && (
                  <motion.p
                    key={step.message || step.description}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="text-xs text-muted-foreground mt-0.5"
                  >
                    {step.message || step.description}
                  </motion.p>
                )}
              </AnimatePresence>

              {step.details && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-muted-foreground/70 mt-0.5"
                >
                  {step.details}
                </motion.p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// Compact horizontal progress
function QueryProgressCompact({ steps, className }: { steps: any[]; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.status === 'in_progress';
        const isCompleted = step.status === 'completed';
        const isError = step.status === 'error';

        return (
          <div key={step.name} className="flex items-center">
            <div
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition-all',
                isActive && 'bg-primary text-primary-foreground scale-110',
                isCompleted && 'bg-green-500 text-white',
                isError && 'bg-red-500 text-white',
                !isActive && !isCompleted && !isError && 'bg-muted text-muted-foreground'
              )}
              title={step.message || step.label}
            >
              {isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isCompleted ? (
                <Check className="h-3.5 w-3.5" />
              ) : isError ? (
                <AlertCircle className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-6 h-0.5 transition-colors',
                  isCompleted ? 'bg-green-500' : 'bg-muted'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Minimal inline progress
function QueryProgressMinimal({ steps, className }: { steps: any[]; className?: string }) {
  const activeStep = steps.find((s) => s.status === 'in_progress');
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const hasError = steps.some((s) => s.status === 'error');

  if (hasError) {
    return (
      <div className={cn('flex items-center gap-2 text-red-600', className)}>
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm">Error processing query</span>
      </div>
    );
  }

  if (!activeStep && completedCount === steps.length) {
    return (
      <div className={cn('flex items-center gap-2 text-green-600', className)}>
        <Check className="h-4 w-4" />
        <span className="text-sm">Complete</span>
      </div>
    );
  }

  if (!activeStep) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 text-primary', className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{activeStep.message || activeStep.label}</span>
      <span className="text-xs text-muted-foreground">
        ({completedCount + 1}/{steps.length})
      </span>
    </div>
  );
}

// Progress bar variant
export function QueryProgressBar({ steps, className }: QueryProgressProps) {
  const completedCount = steps.filter((s) => s.status === 'completed').length;
  const totalSteps = STEP_ORDER.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  const activeStep = steps.find((s) => s.status === 'in_progress');
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <div className={cn('space-y-1', className)}>
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn(
            'h-full rounded-full',
            hasError ? 'bg-red-500' : 'bg-primary'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Status text */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {hasError
            ? 'Error'
            : activeStep
            ? activeStep.message || `${STEP_CONFIG[activeStep.name as keyof typeof STEP_CONFIG]?.label}...`
            : completedCount === totalSteps
            ? 'Complete'
            : 'Preparing...'}
        </span>
        <span className="text-muted-foreground">
          {completedCount}/{totalSteps}
        </span>
      </div>
    </div>
  );
}
