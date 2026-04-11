'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle,
  XCircle,
  GraduationCap,
  ClipboardList,
  History,
  RefreshCw,
  ChevronRight,
  Clock,
  AlertCircle,
} from 'lucide-react';
import {
  useGraduationReadiness,
  useExitProcedure,
  useCreateEvaluation,
  useInitiateExit,
  useUpdateExitProgress,
  useCompleteExit,
} from '@/hooks/startup-studio';

// ─── Exit step labels ─────────────────────────────────────────────────────────

const EXIT_STEP_LABELS: Record<string, string> = {
  notice_given:          'Notice Given',
  fees_reconciled:       'Fees Reconciled',
  deposit_returned:      'Deposit Returned',
  exit_interview:        'Exit Interview Conducted',
  ip_settled:            'IP / IPR Settled',
  nda_status:            'NDA Signed',
  equipment_returned:    'Equipment Returned',
  access_revoked:        'System Access Revoked',
  alumni_joined:         'Joined Alumni Network',
  testimonial:           'Testimonial Received',
};

const REQUIRED_EXIT_STEPS = [
  'notice_given',
  'fees_reconciled',
  'exit_interview',
  'ip_settled',
  'access_revoked',
];

// ─── Readiness Section ────────────────────────────────────────────────────────

interface ReadinessSectionProps {
  candidateId: string;
}

function ReadinessSection({ candidateId }: ReadinessSectionProps) {
  const { data: rawReadiness, isLoading } = useGraduationReadiness?.(candidateId) ?? {};
  const createEvaluation = useCreateEvaluation?.();
  const initiateExit = useInitiateExit?.();

  const readiness: any = rawReadiness?.data ?? rawReadiness ?? null;
  const criteria: any[] = Array.isArray(readiness?.criteria)
    ? readiness.criteria
    : [];

  const metCount  = criteria.filter((c: any) => c.met ?? c.is_met).length;
  const totalCount = criteria.length;
  const neededCount = readiness?.min_criteria_required ?? readiness?.needed ?? totalCount;
  const progressPct = totalCount > 0 ? Math.round((metCount / totalCount) * 100) : 0;
  const isReady = readiness?.is_ready ?? (metCount >= neededCount);

  const handleEvaluate = async () => {
    if (!createEvaluation) return;
    await createEvaluation.mutateAsync({ candidateId, data: {} });
  };

  const handleInitiateExit = async () => {
    if (!initiateExit) return;
    await initiateExit.mutateAsync({ candidateId, data: {} });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-green-600" />
            Graduation Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-green-600" />
            Graduation Readiness
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleEvaluate}
              disabled={!createEvaluation || createEvaluation?.isPending}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {createEvaluation?.isPending ? 'Evaluating...' : 'Evaluate'}
            </Button>
            {isReady && (
              <Button
                size="sm"
                onClick={handleInitiateExit}
                disabled={!initiateExit || initiateExit?.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <GraduationCap className="mr-1.5 h-4 w-4" />
                {initiateExit?.isPending ? 'Initiating...' : 'Graduate'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {metCount} of {totalCount} criteria met
              {neededCount < totalCount && ` (need ${neededCount})`}
            </span>
            <Badge
              variant="outline"
              className={
                isReady
                  ? 'bg-green-100 text-green-800'
                  : 'bg-amber-100 text-amber-800'
              }
            >
              {isReady ? 'Ready to Graduate' : 'Not Yet Ready'}
            </Badge>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>

        {/* Criteria checklist */}
        {criteria.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <AlertCircle className="h-4 w-4" />
            No graduation criteria configured. Click Evaluate to load.
          </div>
        ) : (
          <div className="space-y-2">
            {criteria.map((criterion: any, index: number) => {
              const met = criterion.met ?? criterion.is_met ?? false;
              return (
                <div
                  key={criterion.id ?? criterion.key ?? index}
                  className="flex items-start gap-3 p-3 rounded-lg border"
                >
                  {met ? (
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${met ? '' : 'text-muted-foreground'}`}>
                      {criterion.label ?? criterion.name ?? criterion.key ?? `Criterion ${index + 1}`}
                    </p>
                    {criterion.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {criterion.description}
                      </p>
                    )}
                    {criterion.current_value != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Current: {criterion.current_value}
                        {criterion.required_value != null && ` / Required: ${criterion.required_value}`}
                      </p>
                    )}
                  </div>
                  {criterion.required && !met && (
                    <Badge variant="outline" className="text-xs shrink-0 bg-red-50 text-red-700">
                      Required
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Extend option if close but not ready */}
        {!isReady && metCount > 0 && metCount >= neededCount - 2 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-amber-800">
              This startup is close to graduation. Consider extending incubation to allow
              remaining criteria to be met.
            </span>
            <Button size="sm" variant="outline" className="ml-auto shrink-0 border-amber-300">
              Extend Incubation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exit Procedure Section ────────────────────────────────────────────────────

interface ExitProcedureSectionProps {
  candidateId: string;
}

function ExitProcedureSection({ candidateId }: ExitProcedureSectionProps) {
  const { data: rawExit, isLoading } = useExitProcedure?.(candidateId) ?? {};
  const updateProgress = useUpdateExitProgress?.();
  const completeExit = useCompleteExit?.();

  const exitData: any = rawExit?.data ?? rawExit ?? null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Exit Procedure
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!exitData) return null;

  const steps: Record<string, boolean> = exitData.steps ?? exitData.checklist ?? {};
  const stepKeys = Object.keys(EXIT_STEP_LABELS);
  const completedCount = stepKeys.filter((k) => steps[k]).length;
  const progressPct = stepKeys.length > 0
    ? Math.round((completedCount / stepKeys.length) * 100)
    : 0;

  const allRequiredDone = REQUIRED_EXIT_STEPS.every((k) => steps[k]);

  const handleToggle = async (stepKey: string, checked: boolean) => {
    if (!updateProgress) return;
    await updateProgress.mutateAsync({
      candidateId,
      data: { step: stepKey, value: checked },
    });
  };

  const handleCompleteExit = async () => {
    if (!completeExit) return;
    await completeExit.mutateAsync({ candidateId, data: {} });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-blue-600" />
            Exit Procedure
          </CardTitle>
          <Badge variant="outline" className="bg-blue-50 text-blue-800">
            {completedCount}/{stepKeys.length} steps done
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <Progress value={progressPct} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">{progressPct}% complete</p>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          {stepKeys.map((stepKey) => {
            const isChecked = steps[stepKey] ?? false;
            const isRequired = REQUIRED_EXIT_STEPS.includes(stepKey);

            return (
              <div
                key={stepKey}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <Checkbox
                  id={stepKey}
                  checked={isChecked}
                  onCheckedChange={(checked) => handleToggle(stepKey, !!checked)}
                  disabled={!updateProgress || updateProgress?.isPending}
                />
                <label
                  htmlFor={stepKey}
                  className={`text-sm flex-1 cursor-pointer ${
                    isChecked ? 'line-through text-muted-foreground' : ''
                  }`}
                >
                  {EXIT_STEP_LABELS[stepKey] ?? stepKey}
                </label>
                {isRequired && !isChecked && (
                  <Badge variant="outline" className="text-xs shrink-0 bg-red-50 text-red-700">
                    Required
                  </Badge>
                )}
                {isChecked && (
                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Complete exit button */}
        {allRequiredDone && (
          <div className="pt-2 flex justify-end">
            <Button
              onClick={handleCompleteExit}
              disabled={!completeExit || completeExit?.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {completeExit?.isPending ? 'Completing...' : 'Complete Exit'}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Decision History ─────────────────────────────────────────────────────────

interface DecisionHistoryProps {
  candidateId: string;
}

function DecisionHistory({ candidateId }: DecisionHistoryProps) {
  const { data: rawReadiness } = useGraduationReadiness?.(candidateId) ?? {};
  const readiness: any = rawReadiness?.data ?? rawReadiness ?? null;
  const evaluations: any[] = Array.isArray(readiness?.evaluations)
    ? readiness.evaluations
    : Array.isArray(readiness?.history)
    ? readiness.history
    : [];

  if (evaluations.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-gray-600" />
          Decision History
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-muted" />
          <div className="space-y-4">
            {evaluations.map((entry: any, index: number) => {
              const decision = entry.decision ?? entry.result ?? 'evaluated';
              const isPositive = ['approved', 'graduated', 'ready'].includes(decision);
              const isNegative = ['rejected', 'not_ready', 'denied'].includes(decision);

              return (
                <div
                  key={entry.id ?? index}
                  className="relative flex items-start gap-4 pl-10"
                >
                  <div className="absolute left-2.5 top-1.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  <div className="flex-1 p-3 border rounded-lg">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={
                          isPositive
                            ? 'bg-green-100 text-green-800'
                            : isNegative
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {(decision as string).replace(/_/g, ' ')}
                      </Badge>
                      {entry.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {entry.notes && (
                      <p className="text-sm text-muted-foreground mt-2">{entry.notes}</p>
                    )}
                    {entry.evaluated_by && (
                      <p className="text-xs text-muted-foreground mt-1">
                        By: {entry.evaluated_by}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main GraduationTab component ─────────────────────────────────────────────

interface GraduationTabProps {
  candidateId: string;
}

export function GraduationTab({ candidateId }: GraduationTabProps) {
  return (
    <div className="space-y-6">
      <ReadinessSection candidateId={candidateId} />
      <ExitProcedureSection candidateId={candidateId} />
      <DecisionHistory candidateId={candidateId} />
    </div>
  );
}
