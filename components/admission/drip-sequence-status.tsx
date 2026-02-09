'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Play,
  Pause,
  SkipForward,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  Ban,
  Activity,
  Mail,
  MessageSquare,
  Phone,
  Tag,
  UserPlus,
  ArrowRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { useDripStatus, useDripMutations } from '@/hooks/admission/use-drip-executor';
import type {
  DripSequence,
  DripScheduleStep,
  DripSequenceStatus,
  DripStepStatus,
} from '@/lib/services/admission/drip-executor-service';

// ============================================================================
// TYPES
// ============================================================================

interface DripSequenceStatusProps {
  sequenceId: string;
  onClose?: () => void;
  compact?: boolean;
}

interface DripSequenceCardProps {
  sequence: DripSequence;
  onClick?: () => void;
}

// ============================================================================
// STATUS HELPERS
// ============================================================================

const statusConfig: Record<
  DripSequenceStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  active: { label: 'Active', color: 'bg-green-500', icon: Activity },
  paused: { label: 'Paused', color: 'bg-yellow-500', icon: Pause },
  completed: { label: 'Completed', color: 'bg-blue-500', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-red-500', icon: AlertCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-500', icon: Ban },
};

const stepStatusConfig: Record<
  DripStepStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  pending: { label: 'Pending', color: 'text-gray-400', icon: Clock },
  scheduled: { label: 'Scheduled', color: 'text-blue-500', icon: Clock },
  executing: { label: 'Running', color: 'text-yellow-500', icon: Loader2 },
  completed: { label: 'Done', color: 'text-green-500', icon: CheckCircle2 },
  skipped: { label: 'Skipped', color: 'text-gray-400', icon: SkipForward },
  failed: { label: 'Failed', color: 'text-red-500', icon: AlertCircle },
};

const actionIcons: Record<string, React.ElementType> = {
  send_whatsapp: MessageSquare,
  send_email: Mail,
  send_sms: Phone,
  update_stage: ArrowRight,
  assign_counselor: UserPlus,
  add_tag: Tag,
  notify_counselor: UserPlus,
  assign_task: CheckCircle2,
};

// ============================================================================
// DRIP SEQUENCE STATUS COMPONENT (DETAILED)
// ============================================================================

export function DripSequenceStatus({
  sequenceId,
  onClose,
  compact = false,
}: DripSequenceStatusProps) {
  const { sequence, steps, logs, isLoading, refetch } = useDripStatus(sequenceId);
  const mutations = useDripMutations();

  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [skipReason, setSkipReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!sequence) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <p className="text-muted-foreground">Sequence not found</p>
        </CardContent>
      </Card>
    );
  }

  const config = statusConfig[sequence.status];
  const StatusIcon = config.icon;
  const progress = sequence.total_steps > 0 ? (sequence.current_step_index / sequence.total_steps) * 100 : 0;
  const isActive = sequence.status === 'active';
  const isPaused = sequence.status === 'paused';
  const canControl = isActive || isPaused;

  const handlePause = async () => {
    await mutations.pauseSequence.mutateAsync(sequenceId);
  };

  const handleResume = async () => {
    await mutations.resumeSequence.mutateAsync(sequenceId);
  };

  const handleSkip = async () => {
    await mutations.skipStep.mutateAsync({
      sequenceId,
      reason: skipReason || undefined,
    });
    setShowSkipDialog(false);
    setSkipReason('');
  };

  const handleCancel = async () => {
    await mutations.cancelSequence.mutateAsync({
      sequenceId,
      reason: cancelReason || undefined,
    });
    setShowCancelDialog(false);
    setCancelReason('');
    onClose?.();
  };

  const currentStep = steps.find((s) => s.step_index === sequence.current_step_index);
  const nextScheduledTime = currentStep?.scheduled_at
    ? new Date(currentStep.scheduled_at)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <StatusIcon className={`h-5 w-5 ${config.color.replace('bg-', 'text-')}`} />
              {sequence.workflow?.name || 'Drip Sequence'}
            </CardTitle>
            <CardDescription>
              {sequence.lead?.full_name} • Started{' '}
              {formatDistanceToNow(new Date(sequence.started_at), { addSuffix: true })}
            </CardDescription>
          </div>
          <Badge className={config.color}>{config.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {sequence.current_step_index} / {sequence.total_steps} steps
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Next Action */}
        {canControl && currentStep && nextScheduledTime && (
          <div className="rounded-lg border p-3 bg-muted/50">
            <div className="flex items-center gap-2 text-sm font-medium mb-1">
              <Clock className="h-4 w-4" />
              Next Action
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = actionIcons[currentStep.action_type] || Activity;
                  return <Icon className="h-4 w-4 text-muted-foreground" />;
                })()}
                <span className="text-sm capitalize">
                  {currentStep.action_type.replace(/_/g, ' ')}
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                {nextScheduledTime > new Date()
                  ? `in ${formatDistanceToNow(nextScheduledTime)}`
                  : 'Ready to execute'}
              </span>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        {canControl && (
          <div className="flex gap-2">
            {isActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePause}
                disabled={mutations.pauseSequence.isPending}
              >
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResume}
                disabled={mutations.resumeSequence.isPending}
              >
                <Play className="h-4 w-4 mr-1" />
                Resume
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSkipDialog(true)}
              disabled={mutations.skipStep.isPending}
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip Step
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowCancelDialog(true)}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        )}

        {/* Steps Timeline */}
        {!compact && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Steps Timeline</h4>
                <Button variant="ghost" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pr-4">
                  {steps.map((step, index) => {
                    const stepConfig = stepStatusConfig[step.status];
                    const StepIcon = stepConfig.icon;
                    const ActionIcon = actionIcons[step.action_type] || Activity;
                    const isCurrent = index === sequence.current_step_index;

                    return (
                      <div
                        key={step.id}
                        className={`flex items-start gap-3 p-2 rounded-lg ${
                          isCurrent ? 'bg-primary/10 border border-primary/20' : ''
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <StepIcon
                                  className={`h-4 w-4 ${stepConfig.color} ${
                                    step.status === 'executing' ? 'animate-spin' : ''
                                  }`}
                                />
                              </TooltipTrigger>
                              <TooltipContent>{stepConfig.label}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {index < steps.length - 1 && (
                            <div className="w-px h-6 bg-border mt-1" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <ActionIcon className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-medium capitalize truncate">
                              {step.action_type.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {step.executed_at
                              ? `Executed ${formatDistanceToNow(new Date(step.executed_at), {
                                  addSuffix: true,
                                })}`
                              : step.skipped_at
                              ? `Skipped ${formatDistanceToNow(new Date(step.skipped_at), {
                                  addSuffix: true,
                                })}`
                              : `Scheduled for ${format(
                                  new Date(step.scheduled_at),
                                  'MMM d, h:mm a'
                                )}`}
                          </div>
                          {step.error_message && (
                            <p className="text-xs text-destructive mt-1">
                              {step.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {/* Paused Info */}
        {sequence.paused_at && (
          <div className="text-sm text-muted-foreground">
            Paused {formatDistanceToNow(new Date(sequence.paused_at), { addSuffix: true })}
          </div>
        )}

        {/* Completed Info */}
        {sequence.completed_at && (
          <div className="text-sm text-muted-foreground">
            Completed{' '}
            {formatDistanceToNow(new Date(sequence.completed_at), { addSuffix: true })}
          </div>
        )}

        {/* Error Info */}
        {sequence.error_message && (
          <div className="text-sm text-destructive">Error: {sequence.error_message}</div>
        )}
      </CardContent>

      {/* Skip Dialog */}
      <Dialog open={showSkipDialog} onOpenChange={setShowSkipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip Current Step</DialogTitle>
            <DialogDescription>
              This will skip the current step and move to the next one. The skipped step
              will not be executed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for skipping (optional)"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkipDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSkip} disabled={mutations.skipStep.isPending}>
              {mutations.skipStep.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Skip Step
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Drip Sequence</DialogTitle>
            <DialogDescription>
              This will permanently cancel the drip sequence. All remaining steps will
              not be executed. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Keep Running
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={mutations.cancelSequence.isPending}
            >
              {mutations.cancelSequence.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Cancel Sequence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================================================
// DRIP SEQUENCE CARD (COMPACT LIST ITEM)
// ============================================================================

export function DripSequenceCard({ sequence, onClick }: DripSequenceCardProps) {
  const config = statusConfig[sequence.status];
  const StatusIcon = config.icon;
  const progress = sequence.total_steps > 0 ? (sequence.current_step_index / sequence.total_steps) * 100 : 0;

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <StatusIcon
              className={`h-5 w-5 flex-shrink-0 ${config.color.replace('bg-', 'text-')}`}
            />
            <div className="min-w-0">
              <p className="font-medium truncate">
                {sequence.lead?.full_name || 'Unknown Lead'}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {sequence.workflow?.name || 'Drip Sequence'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-sm font-medium">
                {sequence.current_step_index}/{sequence.total_steps}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(sequence.started_at), { addSuffix: true })}
              </p>
            </div>
            <Badge className={config.color} variant="secondary">
              {config.label}
            </Badge>
          </div>
        </div>
        <Progress value={progress} className="h-1 mt-3" />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// DRIP SEQUENCES LIST
// ============================================================================

interface DripSequencesListProps {
  sequences: DripSequence[];
  isLoading?: boolean;
  onSequenceClick?: (sequence: DripSequence) => void;
  emptyMessage?: string;
}

export function DripSequencesList({
  sequences,
  isLoading,
  onSequenceClick,
  emptyMessage = 'No drip sequences found',
}: DripSequencesListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sequences.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sequences.map((sequence) => (
        <DripSequenceCard
          key={sequence.id}
          sequence={sequence}
          onClick={() => onSequenceClick?.(sequence)}
        />
      ))}
    </div>
  );
}

export default DripSequenceStatus;
