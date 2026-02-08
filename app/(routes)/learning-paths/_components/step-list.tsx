'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  SkipForward,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pencil,
  Trash2,
  Play,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { LearningPathStep, LearningPathStepStatus } from '@/types/learning-path';
import {
  STEP_TYPE_LABELS,
  STEP_TYPE_COLORS,
  STEP_STATUS_LABELS,
  STEP_STATUS_COLORS,
} from '@/types/learning-path';

interface StepListProps {
  steps: LearningPathStep[];
  onUpdateStatus: (stepId: string, status: LearningPathStepStatus) => void;
  onDeleteStep: (stepId: string) => void;
  isUpdating: boolean;
}

const statusIcons: Record<LearningPathStepStatus, React.ReactNode> = {
  pending: <Circle className='h-5 w-5 text-slate-400' />,
  in_progress: <Clock className='h-5 w-5 text-blue-500' />,
  completed: <CheckCircle2 className='h-5 w-5 text-emerald-500' />,
  skipped: <SkipForward className='h-5 w-5 text-amber-500' />,
};

export function StepList({ steps, onUpdateStatus, onDeleteStep, isUpdating }: StepListProps) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  if (steps.length === 0) {
    return (
      <div className='text-center py-8 text-muted-foreground'>
        No steps added yet. Add steps to build this learning path.
      </div>
    );
  }

  const toggleExpand = (stepId: string) => {
    setExpandedStep((prev) => (prev === stepId ? null : stepId));
  };

  const getNextStatus = (current: LearningPathStepStatus): LearningPathStepStatus | null => {
    switch (current) {
      case 'pending':
        return 'in_progress';
      case 'in_progress':
        return 'completed';
      default:
        return null;
    }
  };

  return (
    <div className='space-y-3'>
      {steps.map((step, index) => {
        const isExpanded = expandedStep === step.id;
        const typeLabel = STEP_TYPE_LABELS[step.step_type] || step.step_type;
        const typeColor = STEP_TYPE_COLORS[step.step_type] || 'bg-slate-100 text-slate-800';
        const statusLabel = STEP_STATUS_LABELS[step.status] || step.status;
        const statusColor = STEP_STATUS_COLORS[step.status] || 'bg-slate-100 text-slate-700';
        const nextStatus = getNextStatus(step.status);

        return (
          <Card key={step.id} className='overflow-hidden'>
            <div
              className='flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50'
              onClick={() => toggleExpand(step.id)}
            >
              {/* Status icon */}
              <div className='shrink-0'>
                {statusIcons[step.status]}
              </div>

              {/* Step number */}
              <div className='shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium'>
                {step.step_number}
              </div>

              {/* Content */}
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2'>
                  <span className='font-medium text-sm truncate'>{step.title}</span>
                  <Badge className={`${typeColor} text-xs shrink-0`} variant='outline'>
                    {typeLabel}
                  </Badge>
                </div>
                {step.estimated_hours && (
                  <span className='text-xs text-muted-foreground'>
                    ~{step.estimated_hours}h estimated
                  </span>
                )}
              </div>

              {/* Status badge */}
              <Badge className={`${statusColor} text-xs shrink-0`} variant='outline'>
                {statusLabel}
              </Badge>

              {/* Expand icon */}
              <div className='shrink-0'>
                {isExpanded ? (
                  <ChevronUp className='h-4 w-4 text-muted-foreground' />
                ) : (
                  <ChevronDown className='h-4 w-4 text-muted-foreground' />
                )}
              </div>
            </div>

            {isExpanded && (
              <CardContent className='pt-0 pb-4 border-t'>
                <div className='space-y-3 pt-3'>
                  {step.description && (
                    <p className='text-sm text-muted-foreground'>{step.description}</p>
                  )}

                  {/* Competencies */}
                  {step.target_competencies && step.target_competencies.length > 0 && (
                    <div>
                      <span className='text-xs font-medium text-muted-foreground'>Target Competencies</span>
                      <div className='flex flex-wrap gap-1 mt-1'>
                        {step.target_competencies.map((comp: string, idx: number) => (
                          <Badge key={`${step.id}-comp-${idx}`} variant='secondary' className='text-xs'>
                            {comp}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence */}
                  {step.completion_evidence && (
                    <div>
                      <span className='text-xs font-medium text-muted-foreground'>Evidence</span>
                      <a
                        href={step.completion_evidence}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='flex items-center gap-1 text-sm text-blue-600 hover:underline mt-1'
                      >
                        <ExternalLink className='h-3 w-3' />
                        View Evidence
                      </a>
                    </div>
                  )}

                  {/* Score */}
                  {step.score != null && (
                    <div>
                      <span className='text-xs font-medium text-muted-foreground'>Score</span>
                      <p className='text-sm font-medium'>{step.score}/100</p>
                    </div>
                  )}

                  {/* Mentor Notes */}
                  {step.mentor_notes && (
                    <div>
                      <span className='text-xs font-medium text-muted-foreground'>Mentor Notes</span>
                      <p className='text-sm text-muted-foreground mt-1'>{step.mentor_notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className='flex items-center gap-2 pt-2'>
                    {nextStatus && (
                      <Button
                        size='sm'
                        variant='default'
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(step.id, nextStatus);
                        }}
                        disabled={isUpdating}
                      >
                        {nextStatus === 'in_progress' && <Play className='h-3 w-3 mr-1' />}
                        {nextStatus === 'completed' && <CheckCircle2 className='h-3 w-3 mr-1' />}
                        Mark as {STEP_STATUS_LABELS[nextStatus]}
                      </Button>
                    )}

                    {step.status !== 'skipped' && step.status !== 'completed' && (
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(step.id, 'skipped');
                        }}
                        disabled={isUpdating}
                      >
                        <SkipForward className='h-3 w-3 mr-1' />
                        Skip
                      </Button>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive hover:text-destructive'
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className='h-3 w-3' />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Step</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &quot;{step.title}&quot;? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDeleteStep(step.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
