'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Loader2,
  Rocket,
  User,
  Calendar,
  Lightbulb,
  Search,
  Scale,
  Workflow,
  MessageSquare,
  Hammer,
  BarChart3,
  ClipboardCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCycle, useAdvanceStep, useCompleteCycle } from '@/hooks/startup-studio';

interface CycleDetailProps {
  id: string;
}

const STEP_CONFIG: Record<number, { label: string; icon: React.ElementType; color: string }> = {
  1: { label: 'Problem', icon: Lightbulb, color: 'text-purple-600' },
  2: { label: 'Context', icon: Search, color: 'text-blue-600' },
  3: { label: 'Value Assessment', icon: Scale, color: 'text-amber-600' },
  4: { label: 'Workflow', icon: Workflow, color: 'text-teal-600' },
  5: { label: 'Prompt', icon: MessageSquare, color: 'text-indigo-600' },
  6: { label: 'Build', icon: Hammer, color: 'text-orange-600' },
  7: { label: 'Impact', icon: BarChart3, color: 'text-green-600' },
  8: { label: 'Review', icon: ClipboardCheck, color: 'text-rose-600' },
};

const STATUS_BADGE_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  abandoned: { label: 'Abandoned', color: 'bg-gray-100 text-gray-800' },
};

export function CycleDetail({ id }: CycleDetailProps) {
  const router = useRouter();
  const { data: rawData, isLoading } = useCycle(id);
  const advanceStep = useAdvanceStep();
  const completeCycle = useCompleteCycle();

  const cycle = rawData as any;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Cycle not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/startup-studio/cycles">Back to Cycles</Link>
        </Button>
      </div>
    );
  }

  const currentStep = cycle.current_step ?? 1;
  const status = cycle.status || 'active';
  const statusConfig = STATUS_BADGE_CONFIG[status] || {
    label: status,
    color: 'bg-gray-100 text-gray-800',
  };

  const handleAdvanceStep = () => {
    advanceStep.mutate(id, {
      onSuccess: () => {
        toast.success(`Advanced to step ${currentStep + 1}`);
      },
      onError: () => {
        toast.error('Failed to advance step');
      },
    });
  };

  const handleCompleteCycle = () => {
    completeCycle.mutate(id, {
      onSuccess: () => {
        toast.success('Cycle completed successfully');
      },
      onError: () => {
        toast.error('Failed to complete cycle');
      },
    });
  };

  // Extract step data from the cycle
  const steps = cycle.steps || cycle.step_data || {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/startup-studio/cycles">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">
                {cycle.name || `Cycle #${id.slice(0, 8)}`}
              </h1>
              <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              {cycle.user?.full_name && (
                <span className="flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {cycle.user.full_name}
                </span>
              )}
              {cycle.event?.name && (
                <span className="flex items-center gap-1">
                  <Rocket className="h-3.5 w-3.5" />
                  {cycle.event.name}
                </span>
              )}
              {cycle.created_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(new Date(cycle.created_at), 'MMM d, yyyy')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {status === 'active' && (
          <div className="flex items-center gap-2">
            {currentStep < 8 && (
              <Button
                size="sm"
                onClick={handleAdvanceStep}
                disabled={advanceStep.isPending}
              >
                {advanceStep.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-1" />
                )}
                Advance Step
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleCompleteCycle}
              disabled={completeCycle.isPending}
              className="text-green-700 hover:bg-green-50"
            >
              {completeCycle.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-1" />
              )}
              Complete Cycle
            </Button>
          </div>
        )}
      </div>

      {/* Horizontal Stepper */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between overflow-x-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
              const config = STEP_CONFIG[step];
              const Icon = config.icon;
              const isCompleted = step < currentStep;
              const isCurrent = step === currentStep;
              const isFuture = step > currentStep;

              return (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[60px]">
                    <div
                      className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors',
                        isCompleted && 'bg-green-100 border-green-600 text-green-700',
                        isCurrent && 'bg-blue-100 border-blue-600 text-blue-700',
                        isFuture && 'bg-muted border-muted-foreground/30 text-muted-foreground'
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4" />
                      ) : (
                        <span className="text-xs font-bold">{step}</span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'text-[10px] mt-1 text-center whitespace-nowrap',
                        isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                  {step < 8 && (
                    <div
                      className={cn(
                        'h-0.5 w-4 sm:w-6 mx-0.5',
                        step < currentStep ? 'bg-green-600' : 'bg-muted-foreground/20'
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step Data Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((step) => {
          const config = STEP_CONFIG[step];
          const Icon = config.icon;
          const isCompleted = step < currentStep;
          const isCurrent = step === currentStep;
          const stepKey = config.label.toLowerCase().replace(/ /g, '_');

          // Try to find step data in multiple possible shapes
          const stepData =
            steps[step] ||
            steps[stepKey] ||
            steps[`step_${step}`] ||
            (cycle[stepKey]) ||
            null;

          if (step > currentStep && status !== 'completed') {
            return (
              <Card key={step} className="opacity-50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={cn('h-4 w-4', config.color)} />
                    <span className="text-muted-foreground">{step}. {config.label}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">Not started yet</p>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card
              key={step}
              className={cn(
                isCurrent && 'border-blue-300 shadow-sm',
                isCompleted && 'border-green-200'
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', config.color)} />
                    {step}. {config.label}
                  </div>
                  {isCompleted && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {isCurrent && (
                    <Badge className="bg-blue-100 text-blue-800">Current</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {stepData ? (
                  <div className="space-y-2">
                    {typeof stepData === 'string' ? (
                      <p className="text-sm whitespace-pre-wrap">{stepData}</p>
                    ) : typeof stepData === 'object' ? (
                      Object.entries(stepData).map(([key, value]) => {
                        if (key === 'id' || key === 'cycle_id' || key === 'created_at' || key === 'updated_at') return null;
                        return (
                          <div key={key} className="text-sm">
                            <span className="font-medium text-muted-foreground capitalize">
                              {key.replace(/_/g, ' ')}:
                            </span>{' '}
                            <span className="whitespace-pre-wrap">
                              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '-')}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-sm">{String(stepData)}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {isCurrent ? 'Awaiting data entry' : 'No data recorded'}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
