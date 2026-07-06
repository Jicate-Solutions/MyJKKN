'use client';

/**
 * Pre-join onboarding checklist for a finally-approved candidate.
 * Steps are dynamically assigned (role or pinned person) by the checklist
 * template; each assignee ticks their own steps — the server enforces
 * per-step authorization, this dialog just surfaces who owns what.
 * The staff record can only be created once every step is complete.
 */

import { toast } from 'sonner';
import { CheckCircle2, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useCompleteOnboardingStep } from '@/hooks/hr/use-recruitment';
import type { HRRecruitmentCandidate } from '@/types/hr-recruitment';

export interface OnboardingStepInstance {
  index: number;
  step: string;
  completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  expected_by_day?: number | null;
  assigned_role?: string | null;
  assigned_user_email?: string | null;
  assigned_user_id?: string | null;
}

export function getOnboardingSteps(
  candidate: HRRecruitmentCandidate | null,
): OnboardingStepInstance[] | null {
  const raw = (candidate?.role_specific_details as Record<string, unknown> | null)
    ?.onboarding_steps;
  return Array.isArray(raw) ? (raw as OnboardingStepInstance[]) : null;
}

export function OnboardingChecklistDialog({
  open, onOpenChange, candidate, userId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: HRRecruitmentCandidate;
  userId: string | null;
}) {
  const completeStep = useCompleteOnboardingStep();
  const steps = getOnboardingSteps(candidate) ?? [];
  const done = steps.filter((s) => s.completed).length;
  const checklistName = (candidate.role_specific_details as Record<string, unknown> | null)
    ?.onboarding_checklist_name as string | undefined;

  const toggle = (step: OnboardingStepInstance, next: boolean) => {
    completeStep.mutate(
      { candidate_id: candidate.id, step_index: step.index, completed: next },
      {
        onSuccess: () => {
          if (next) toast.success(`"${step.step}" completed`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboarding Checklist — {candidate.name}</DialogTitle>
          <DialogDescription>
            {checklistName ?? 'Onboarding'} &middot;{' '}
            <span className="tabular-nums font-medium text-foreground">
              {done}/{steps.length}
            </span>{' '}
            completed. Each step is ticked by its assignee; the staff record unlocks when
            everything is done.
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
          <div
            className="h-2 rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }}
          />
        </div>

        <ul className="space-y-2">
          {steps.map((s) => {
            const mine =
              (s.assigned_user_id && s.assigned_user_id === userId) ||
              (!s.assigned_user_id && !s.assigned_role); // unassigned → HR fallback
            return (
              <li
                key={s.index}
                className={`flex items-start gap-2.5 rounded-md border p-2.5 ${
                  s.completed ? 'border-green-500/30 bg-green-50/50 dark:bg-green-900/10' : 'border-border'
                }`}
              >
                <Checkbox
                  className="mt-0.5"
                  checked={s.completed}
                  disabled={completeStep.isPending}
                  onCheckedChange={(v) => toggle(s, v === true)}
                  aria-label={`Mark "${s.step}" ${s.completed ? 'incomplete' : 'complete'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${s.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {s.step}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {s.assigned_user_email ? (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                        <UserRound className="h-3 w-3" />
                        {s.assigned_user_email}
                        {!s.assigned_user_id && (
                          <span className="text-red-600 dark:text-red-400">(no account)</span>
                        )}
                      </Badge>
                    ) : s.assigned_role ? (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                        <Users className="h-3 w-3" />
                        {s.assigned_role}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 text-muted-foreground">
                        <Users className="h-3 w-3" />
                        HR
                      </Badge>
                    )}
                    {typeof s.expected_by_day === 'number' && (
                      <span className="text-[10px] text-muted-foreground">by day {s.expected_by_day}</span>
                    )}
                    {mine && !s.completed && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground">
                        Yours
                      </Badge>
                    )}
                    {s.completed && s.completed_at && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-3 w-3" />
                        {new Date(s.completed_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {done === steps.length && steps.length > 0 && (
          <p className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            All steps complete — this candidate can now be onboarded to Staff.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
